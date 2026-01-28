/**
 * API 服务模块
 * 所有后端 API 调用都通过此模块
 */
import { useConfigStore } from '../store/useConfigStore';
import { useDebugStore, ProcessingPhase } from '../store/useDebugStore';
import { useLanguageStore } from '../store/useLanguageStore';
import { useAuthStore } from '../store/useAuthStore';
import { useDialogStore } from '../store/useDialogStore';

const containsCjk = (value: string) => /[\u4e00-\u9fff]/.test(value);

const sanitizeServerMessage = (message: string, t: (key: string) => string, language: string) => {
    if (language === 'en' && containsCjk(message)) {
        return t('alert.processFailed.unknown');
    }
    return message;
};

// 当前请求的控制器
let currentAbortController: AbortController | null = null;

const getClientTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * 取消当前正在进行的 API 请求
 */
export const cancelCurrentRequest = () => {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;

        const debug = useDebugStore.getState();
        // 如果不在最终状态，则标记为 Idle 或 Error
        if (debug.currentPhase !== ProcessingPhase.Completed && debug.currentPhase !== ProcessingPhase.Error) {
            debug.setPhase(ProcessingPhase.Idle);
            debug.addLog('Request cancelled by user.');
            debug.setProgress(0);
        }
    }
};

const getAuthHeaders = () => {
    const token = useAuthStore.getState().accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const handleBannedResponse = (payload: any, t: (key: string) => string) => {
    if (payload?.code === 'ACCOUNT_BANNED' || payload?.detail === '账户已被封禁') {
        useAuthStore.getState().logout();
        useDialogStore.getState().showDialog({
            title: t('alert.accountBanned.title'),
            message: t('alert.accountBanned.message'),
            actions: [{ label: t('common.confirm'), variant: 'primary' }],
        });
        return true;
    }
    return false;
};

const parseErrorPayload = async (response: Response) => {
    try {
        return await response.json();
    } catch {
        const text = await response.text();
        return { detail: text };
    }
};

/**
 * 带有自动 Token 刷新机制的 fetch 封装
 */
export const fetchWithAuth = async (url: string, options: RequestInit): Promise<Response> => {
    const authStore = useAuthStore.getState();
    const token = authStore.accessToken;

    // Inject current token
    const headers = new Headers(options.headers);
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    // First attempt
    let response = await fetch(url, { ...options, headers });

    // If 401, try to refresh
    if (response.status === 401) {
        // Avoid infinite loop if refresh endpoint itself is called (should not happen with this architecture but good practice)
        if (url.includes('/auth/refresh')) return response;

        console.log('Access token expired, attempting to refresh...');
        const success = await authStore.refreshAccessToken();

        if (success) {
            console.log('Token refresh successful, retrying request...');
            const newToken = useAuthStore.getState().accessToken;
            headers.set('Authorization', `Bearer ${newToken}`);
            response = await fetch(url, { ...options, headers });
        } else {
            console.log('Token refresh failed, user needs to login again.');
            // logout() is already called in refreshAccessToken() if it fails
        }
    }

    return response;
};

// 任务项类型
export interface TaskItem {
    title: string;
    time?: string;
    timestamp?: string;
    location?: string;
    suggestion?: string;
    priority: 'low' | 'normal' | 'high';
    subtasks?: string[];
}

// AI 解析结果
export interface AIParseResult {
    tasks: TaskItem[];
    summary?: string;
}

// 音频处理响应
export interface ProcessAudioResponse {
    success: boolean;
    raw_text: string;
    ai_result?: AIParseResult;
    record_id?: number;
    error?: string;
}

// 获取当前配置
const getConfig = () => {
    const state = useConfigStore.getState();
    return {
        apiUrl: state.apiUrl,
        sttModel: state.sttModel,
        llmModel: state.llmModel,
        deviceId: state.deviceId,
    };
};

/**
 *处理音频文件
 * @param audioUri 音频文件 URI
 * @returns 处理结果
 */
export const processAudio = async (uri: string): Promise<ProcessAudioResponse> => {
    const debug = useDebugStore.getState();
    const { t, language } = useLanguageStore.getState();

    try {
        debug.reset(); // 确保每次开始是一个新会话（如果不是连续调用）
        // 如果外部没有置位 Recording/Compressing，这里初始化
        if (debug.currentPhase === ProcessingPhase.Idle) {
            debug.setPhase(ProcessingPhase.Uploading);
        }

        debug.addLog(t('api.log.processAudio.start'));
        debug.setPhase(ProcessingPhase.Uploading);
        debug.setProgress(10);

        // 初始化 AbortController
        if (currentAbortController) {
            currentAbortController.abort(); // 取消上一个（如果有）
        }
        currentAbortController = new AbortController();

        const {
            apiUrl,
            sttBaseUrl, sttApiKey, sttModel,
            llmBaseUrl, llmApiKey, llmModel,
            deviceId
        } = useConfigStore.getState();

        if (!apiUrl) throw new Error(t('api.error.apiUrlMissing'));
        // API Key 现在由后端管理，前端不再校验

        debug.addLog(`${t('api.log.backendPrefix')}${apiUrl}`);

        // 自动识别文件类型
        const fileName = uri.split('/').pop() || 'recording';
        let fileType = 'audio/aac';
        if (fileName.endsWith('.wav')) fileType = 'audio/wav';
        else if (fileName.endsWith('.webm')) fileType = 'audio/webm';
        else if (fileName.endsWith('.m4a')) fileType = 'audio/m4a';

        debug.addLog(`${t('api.log.fileReadyPrefix')}${fileName} (${fileType})`);

        const formData = new FormData();
        formData.append('file', {
            uri: uri,
            name: fileName,
            type: fileType,
        } as any);

        debug.setProgress(30);
        debug.addLog(t('api.log.sendingRequest'));

        // 模拟上传进度 (Fetch 不支持)
        const progressInterval = setInterval(() => {
            const current = useDebugStore.getState().progress;
            if (current < 80) debug.setProgress(current + 5);
        }, 500);

        const response = await fetchWithAuth(`${apiUrl.replace(/\/$/, '')}/api/process-audio`, {
            method: 'POST',
            signal: currentAbortController.signal,
            headers: {
                'Accept': 'application/json',
                'X-STT-Base-Url': sttBaseUrl,
                'X-STT-Key': sttApiKey,
                'X-STT-Model': sttModel,
                'X-LLM-Base-Url': llmBaseUrl,
                'X-LLM-Key': llmApiKey,
                'X-LLM-Model': llmModel,
                'X-Device-ID': deviceId || 'unknown-device',
                'X-Client-Time': getClientTime(),
            } as Record<string, string>,
            body: formData,
        });

        clearInterval(progressInterval);

        if (!response.ok) {
            const payload = await parseErrorPayload(response);
            if (handleBannedResponse(payload, t)) {
                return { success: false, raw_text: '', error: t('alert.accountBanned.message') };
            }
            const errorText = typeof payload.detail === 'string' ? payload.detail : t('alert.processFailed.unknown');
            debug.setPhase(ProcessingPhase.Error);
            const sanitizedErrorText = sanitizeServerMessage(errorText, t, language);
            debug.addLog(`${t('api.log.requestFailedPrefix')}${response.status} ${sanitizedErrorText}`);
            return { success: false, raw_text: '', error: `${t('api.error.requestFailedPrefix')}${response.status} ${sanitizedErrorText}` };
        }

        debug.setProgress(90);
        debug.setPhase(ProcessingPhase.ProcessingLLM); // 后端其实 STT 和 LLM 是一起回来的，但在这算处理完了
        debug.addLog(t('api.log.responseParsing'));

        const data: ProcessAudioResponse = await response.json();

        if (data.success) {
            debug.setProgress(100);
            debug.setPhase(ProcessingPhase.Completed);
            debug.addLog(`${t('api.log.processSuccessPrefix')}${data.raw_text?.substring(0, 20)}...`);
            debug.addLog(`${t('api.log.tasksExtractedPrefix')}${data.ai_result?.tasks.length || 0}`);
        } else {
            debug.setPhase(ProcessingPhase.Error);
            const businessError = data.error ? sanitizeServerMessage(data.error, t, language) : '';
            debug.addLog(`${t('api.log.businessErrorPrefix')}${businessError}`);
        }

        return data;

    } catch (error) {
        // 如果是取消请求，不做错误处理
        if (error instanceof Error && error.name === 'AbortError') {
            console.log('Request aborted');
            return { success: false, raw_text: '', error: 'Request cancelled' };
        }

        console.error('API Error:', error);
        debug.setPhase(ProcessingPhase.Error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const sanitizedErrorMessage = sanitizeServerMessage(errorMessage, t, language);
        debug.addLog(`${t('api.log.exceptionPrefix')}${sanitizedErrorMessage}`);
        return { success: false, raw_text: '', error: sanitizedErrorMessage };
    }
}


/**
 * 处理纯文本
 * @param text 输入文本
 * @returns 处理结果
 */
export const processText = async (text: string): Promise<ProcessAudioResponse> => {
    const debug = useDebugStore.getState();
    const { t, language } = useLanguageStore.getState();

    try {
        debug.reset();
        debug.setPhase(ProcessingPhase.Uploading);
        debug.addLog(t('api.log.processText.start'));
        debug.setProgress(20);

        // Initialize AbortController
        if (currentAbortController) {
            currentAbortController.abort();
        }
        currentAbortController = new AbortController();

        const {
            apiUrl,
            llmBaseUrl, llmApiKey, llmModel,
            deviceId
        } = useConfigStore.getState();

        if (!apiUrl) throw new Error(t('api.error.apiUrlMissing'));
        // API Key 现在由后端管理，前端不再校验

        debug.addLog(`${t('api.log.sendingTextPrefix')}${text.substring(0, 20)}...`);
        debug.setProgress(40);

        // 模拟进度
        const progressInterval = setInterval(() => {
            const current = useDebugStore.getState().progress;
            if (current < 90) debug.setProgress(current + 10);
        }, 300);

        const response = await fetchWithAuth(`${apiUrl.replace(/\/$/, '')}/api/process-text`, {
            method: 'POST',
            signal: currentAbortController.signal,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-LLM-Base-Url': llmBaseUrl,
                'X-LLM-Key': llmApiKey,
                'X-LLM-Model': llmModel,
                'X-Device-ID': deviceId || 'unknown-device',
                'X-Client-Time': getClientTime(),
            } as Record<string, string>,
            body: JSON.stringify({ text }),
        });

        clearInterval(progressInterval);

        if (!response.ok) {
            const payload = await parseErrorPayload(response);
            if (handleBannedResponse(payload, t)) {
                return { success: false, raw_text: text, error: t('alert.accountBanned.message') };
            }
            const errorText = typeof payload.detail === 'string' ? payload.detail : t('alert.processFailed.unknown');
            debug.setPhase(ProcessingPhase.Error);
            const sanitizedErrorText = sanitizeServerMessage(errorText, t, language);
            debug.addLog(`${t('api.log.requestFailedPrefix')}${response.status} ${sanitizedErrorText}`);
            return { success: false, raw_text: text, error: `${t('api.error.requestFailedPrefix')}${response.status} ${sanitizedErrorText}` };
        }

        debug.setProgress(95);
        debug.addLog(t('api.log.responseParsingText'));

        const data: ProcessAudioResponse = await response.json();

        debug.setProgress(100);
        debug.setPhase(ProcessingPhase.Completed);
        debug.addLog(`${t('api.log.processTextDonePrefix')}${data.ai_result?.tasks.length || 0}`);

        return data;

    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.log('Request aborted');
            return { success: false, raw_text: text, error: 'Request cancelled' };
        }

        console.error('API Error:', error);
        debug.setPhase(ProcessingPhase.Error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const sanitizedErrorMessage = sanitizeServerMessage(errorMessage, t, language);
        debug.addLog(`${t('api.log.exceptionPrefix')}${sanitizedErrorMessage}`);
        return { success: false, raw_text: text, error: sanitizedErrorMessage };
    }
};

export const processImage = async (uri: string): Promise<ProcessAudioResponse> => {
    const { t, language } = useLanguageStore.getState();
    const debug = useDebugStore.getState();

    try {
        const { apiUrl, visionModel, deviceId } = useConfigStore.getState();
        if (!apiUrl) throw new Error(t('api.error.apiUrlMissing'));

        // Initialize AbortController
        if (currentAbortController) {
            currentAbortController.abort();
        }
        currentAbortController = new AbortController();

        const fileName = uri.split('/').pop() || 'image.jpg';
        const formData = new FormData();
        formData.append('file', {
            uri,
            name: fileName,
            type: 'image/jpeg',
        } as any);

        debug.setProgress(30);
        debug.addLog(t('api.log.sendingRequest') || 'Sending request...');

        // Create a timeout signal
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

        const fetchPromise = fetchWithAuth(`${apiUrl.replace(/\/$/, '')}/api/process-image`, {
            method: 'POST',
            signal: controller.signal, // Use local controller for timeout
            headers: {
                'Accept': 'application/json',
                'X-Vision-Model': visionModel,
                'X-Device-ID': deviceId || 'unknown-device',
            } as Record<string, string>,
            body: formData,
        });

        const timeoutPromise = new Promise<Response>((_, reject) =>
            setTimeout(() => reject(new Error(t('api.error.requestTimeout') || 'Request timed out')), 60000)
        );

        // Race between fetch and timeout
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        clearTimeout(timeoutId);

        debug.setProgress(70);
        debug.addLog(t('api.log.responseParsing') || 'Parsing response...');

        if (!response.ok) {
            const payload = await parseErrorPayload(response);
            if (handleBannedResponse(payload, t)) {
                return { success: false, raw_text: '', error: t('alert.accountBanned.message') };
            }
            const errorText = typeof payload.detail === 'string' ? payload.detail : t('alert.processFailed.unknown');
            const sanitizedErrorText = sanitizeServerMessage(errorText, t, language);
            return { success: false, raw_text: '', error: sanitizedErrorText };
        }

        debug.setProgress(90);
        debug.setPhase(ProcessingPhase.ProcessingLLM);
        debug.addLog(t('api.log.responseParsingText') || 'Parsing result...');

        const data: ProcessAudioResponse = await response.json();

        if (data.success) {
            debug.setProgress(100);
            debug.setPhase(ProcessingPhase.Completed);
            debug.addLog(`${t('api.log.tasksExtractedPrefix') || 'Extracted'} ${data.ai_result?.tasks.length || 0} ${t('api.log.tasksSuffix') || 'tasks'}`);
        } else {
            debug.setPhase(ProcessingPhase.Error);
            debug.addLog(`${t('api.log.businessErrorPrefix') || 'Error:'} ${data.error || 'Unknown error'}`);
        }

        return data;
    } catch (error) {
        debug.setPhase(ProcessingPhase.Error);
        debug.setProgress(0);

        if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timed out'))) {
            return { success: false, raw_text: '', error: t('api.error.requestTimeout') || 'Request timed out' };
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        const sanitizedErrorMessage = sanitizeServerMessage(errorMessage, t, language);
        return { success: false, raw_text: '', error: sanitizedErrorMessage };
    }
};

export const testConnection = async (): Promise<{ success: boolean; message: string }> => {
    try {
        const t = useLanguageStore.getState().t;
        const { apiUrl, llmBaseUrl, llmApiKey } = useConfigStore.getState();

        if (!apiUrl) return { success: false, message: t('api.test.missingApiUrl') };
        // API Key 已交由后端校验

        const response = await fetchWithAuth(`${apiUrl.replace(/\/$/, '')}/api/test-connection`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-LLM-Base-Url': llmBaseUrl,
                'X-LLM-Key': llmApiKey,
            } as Record<string, string>,
        });

        if (!response.ok) {
            const payload = await parseErrorPayload(response);
            if (handleBannedResponse(payload, t)) {
                return { success: false, message: t('alert.accountBanned.message') };
            }
            return { success: false, message: `${t('api.test.connectionFailedPrefix')}${response.status}` };
        }

        const data = await response.json();
        return data;

    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
};

/**
 * 健康检查
 * @returns 服务状态
 */
export async function healthCheck(): Promise<{ status: string; message?: string }> {
    const config = getConfig();
    const t = useLanguageStore.getState().t;

    try {
        const response = await fetch(`${config.apiUrl}/api/health`);

        if (!response.ok) {
            return { status: 'error', message: `${t('api.health.serverErrorPrefix')}${response.status}` };
        }

        return await response.json();
    } catch (error) {
        return {
            status: 'error',
            message: `${t('api.health.connectionFailedPrefix')}${error instanceof Error ? error.message : t('alert.processFailed.unknown')}`,
        };
    }
}

/**
 * 获取模型列表 (同时会注册设备 ID)
 */
export async function fetchModels(): Promise<any> {
    const config = getConfig();

    try {
        // 使用 fetchWithAuth 确保带上 headers (包括 X-Device-ID)
        const response = await fetchWithAuth(`${config.apiUrl.replace(/\/$/, '')}/api/models`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Device-ID': config.deviceId || 'unknown-device',
            } as Record<string, string>,
        });

        if (!response.ok) {
            console.log('Fetch models failed:', response.status);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('Fetch models error:', error);
        return null;
    }
}
/**
 * 提交番茄钟记录
 */
export const pomodoroEnd = async (session_id: string, duration_sec: number, status: 'completed' | 'interrupted', local_date?: string, local_hour?: number) => {
    const { t, language } = useLanguageStore.getState();
    const config = getConfig();

    try {
        const body: any = { session_id, duration_sec, status };
        // 如果有本地时间，直接传
        if (local_date && local_hour !== undefined) {
            body.local_date = local_date;
            body.local_hour = local_hour;
        } else {
            // 否则传 UTC 和 offset
            body.end_at = new Date().toISOString();
            body.tz_offset_minutes = new Date().getTimezoneOffset();
        }

        const response = await fetchWithAuth(`${config.apiUrl.replace(/\/$/, '')}/api/pomodoro/end`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-ID': config.deviceId || 'unknown-device',
            } as Record<string, string>,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const payload = await parseErrorPayload(response);
            if (handleBannedResponse(payload, t)) return { success: false };
            return { success: false, message: payload.detail || t('alert.processFailed.unknown') };
        }

        return { success: true, data: await response.json() };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
};

/**
 * 获取番茄钟统计
 */
export const pomodoroStats = async (days: number = 30) => {
    const { t } = useLanguageStore.getState();
    const config = getConfig();

    try {
        const response = await fetchWithAuth(`${config.apiUrl.replace(/\/$/, '')}/api/pomodoro/stats?days=${days}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Device-ID': config.deviceId || 'unknown-device',
            } as Record<string, string>,
        });

        if (!response.ok) {
            const payload = await parseErrorPayload(response);
            if (handleBannedResponse(payload, t)) return { success: false };
            return { success: false, message: payload.detail || t('alert.processFailed.unknown') };
        }

        return { success: true, data: await response.json() };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
};
