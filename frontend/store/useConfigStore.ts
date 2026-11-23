/**
 * 开发者配置状态管理
 * 使用 Zustand + AsyncStorage 持久化存储
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';


export interface ConfigState {
    // API 服务地址
    apiUrl: string;

    // STT 配置
    sttBaseUrl: string;
    sttApiKey: string;
    sttModel: string;

    // LLM 配置
    llmBaseUrl: string;
    llmApiKey: string;
    llmModel: string;

    // Vision 配置
    visionModel: string;

    // 设备标识
    deviceId: string;

    // 持久化水合状态（非持久化字段）
    _hasHydrated: boolean;

    // Actions
    setApiUrl: (url: string) => void;
    // STT Actions
    setSttBaseUrl: (url: string) => void;
    setSttApiKey: (key: string) => void;
    setSttModel: (model: string) => void;
    // LLM Actions
    setLlmBaseUrl: (url: string) => void;
    setLlmApiKey: (key: string) => void;
    setLlmModel: (model: string) => void;
    setVisionModel: (model: string) => void;

    setDeviceId: (id: string) => void;
    setHasHydrated: (hydrated: boolean) => void;
    resetConfig: () => void;
}

// 默认配置（支持 EXPO_PUBLIC_API_URL 环境变量，回退本地地址）
const defaultConfig = {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000',

    sttBaseUrl: 'https://api.siliconflow.cn/v1',
    sttApiKey: '',
    sttModel: 'FunAudioLLM/SenseVoiceSmall',

    llmBaseUrl: 'https://api.siliconflow.cn/v1',
    llmApiKey: '',
    llmModel: 'Qwen/Qwen2.5-7B-Instruct',

    visionModel: 'THUDM/GLM-4.1V-9B-Thinking',

    deviceId: '',
};

export const useConfigStore = create<ConfigState>()(
    persist(
        (set, get) => ({
            ...defaultConfig,
            _hasHydrated: false,

            setApiUrl: (url) => set({ apiUrl: url.trim().replace(/\/$/, '') }),

            setSttBaseUrl: (url) => set({ sttBaseUrl: url }),
            setSttApiKey: (key) => set({ sttApiKey: key }),
            setSttModel: (model) => set({ sttModel: model }),

            setLlmBaseUrl: (url) => set({ llmBaseUrl: url }),
            setLlmApiKey: (key) => set({ llmApiKey: key }),
            setLlmModel: (model) => set({ llmModel: model }),
            setVisionModel: (model) => set({ visionModel: model }),

            setDeviceId: (id) => set({ deviceId: id }),
            setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),

            resetConfig: () => set({
                ...defaultConfig,
                deviceId: get().deviceId,
                _hasHydrated: true,
            }),
        }),
        {
            name: 'project-flow-config-v2', // 升级存储 key 以避免冲突
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                apiUrl: state.apiUrl,
                sttBaseUrl: state.sttBaseUrl,
                sttApiKey: state.sttApiKey,
                sttModel: state.sttModel,
                llmBaseUrl: state.llmBaseUrl,
                llmApiKey: state.llmApiKey,
                llmModel: state.llmModel,
                visionModel: state.visionModel,
                deviceId: state.deviceId,
            }),
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
            },
        }
    )
);
