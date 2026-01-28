/**
 * 用户认证状态管理
 * 管理登录状态、用户信息和 Token
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConfigStore } from './useConfigStore';
import { useLanguageStore } from './useLanguageStore';
import { useDialogStore } from './useDialogStore';

const containsCjk = (value: string) => /[\u4e00-\u9fff]/.test(value);

const translateAuthDetail = (
    detail: string,
    t: (key: string) => string,
    language: string,
    fallbackKey: 'error.login' | 'error.register'
) => {
    if (language !== 'en') return detail;
    const map: Record<string, string> = {
        '两次输入的密码不一致': t('auth.error.passwordMismatch'),
        '密码长度不能少于6位': t('auth.error.passwordLength'),
        '用户名已被注册': t('auth.error.usernameTaken'),
        '请提供用户名或UID': t('auth.error.missingIdentifier'),
        '请提供用户名或 UID': t('auth.error.missingIdentifier'),
        '用户不存在': t('auth.error.userNotFound'),
        '密码错误': t('auth.error.passwordInvalid'),
    };
    if (map[detail]) return map[detail];
    if (containsCjk(detail)) return t(fallbackKey);
    return detail;
};

export interface User {
    uid: number;
    username: string;
    nickname: string | null;
    avatar_url: string | null;
    tier: 'free' | 'vip';
    daily_usage?: number;
    status?: string;
}

interface AuthState {
    // 用户信息
    user: User | null;
    accessToken: string | null;
    refreshToken: string | null;
    isLoggedIn: boolean;
    isLoading: boolean;
    error: string | null;

    // Actions
    login: (usernameOrUid: string | number, password: string) => Promise<boolean>;
    register: (username: string, password: string, nickname?: string) => Promise<User | false>;
    logout: () => void;
    setUser: (user: User | null) => void;
    setTokens: (access: string, refresh: string) => void;
    clearError: () => void;
    fetchUserInfo: () => Promise<void>;
    refreshAccessToken: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            accessToken: null,
            refreshToken: null,
            isLoggedIn: false,
            isLoading: false,
            error: null,

            login: async (usernameOrUid, password) => {
                set({ isLoading: true, error: null });

                try {
                    const { t, language } = useLanguageStore.getState();
                    const configStore = useConfigStore.getState();
                    const apiUrl = configStore.apiUrl;
                    const deviceId = configStore.deviceId;

                    const normalizedInput = typeof usernameOrUid === 'string'
                        ? usernameOrUid.trim()
                        : usernameOrUid;
                    const uidFromString = typeof normalizedInput === 'string' && /^\d+$/.test(normalizedInput)
                        ? Number(normalizedInput)
                        : null;
                    const isUid = typeof normalizedInput === 'number' || uidFromString !== null;

                    const response = await fetch(`${apiUrl}/auth/login`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Device-ID': deviceId || 'unknown-device'
                        },
                        body: JSON.stringify(
                            isUid
                                ? { uid: typeof normalizedInput === 'number' ? normalizedInput : uidFromString, password }
                                : { username: normalizedInput, password }
                        ),
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        if (response.status === 403 && data?.detail === '账户已被封禁') {
                            useDialogStore.getState().showDialog({
                                title: t('alert.accountBanned.title'),
                                message: t('alert.accountBanned.message'),
                                actions: [{ label: t('common.confirm'), variant: 'primary' }],
                            });
                            set({ error: t('alert.accountBanned.message'), isLoading: false });
                            return false;
                        }
                        const detail = typeof data.detail === 'string'
                            ? translateAuthDetail(data.detail, t, language, 'error.login')
                            : t('error.login');
                        set({ error: detail, isLoading: false });
                        return false;
                    }

                    set({
                        user: data.user,
                        accessToken: data.access_token,
                        refreshToken: data.refresh_token,
                        isLoggedIn: true,
                        isLoading: false,
                        error: null,
                    });

                    return true;
                } catch (e) {
                    const t = useLanguageStore.getState().t;
                    set({
                        error: e instanceof Error ? e.message : t('error.network'),
                        isLoading: false
                    });
                    return false;
                }
            },

            register: async (username, password, nickname) => {
                set({ isLoading: true, error: null });

                try {
                    const { t, language } = useLanguageStore.getState();
                    const configStore = useConfigStore.getState();
                    const apiUrl = configStore.apiUrl;
                    const deviceId = configStore.deviceId;

                    const response = await fetch(`${apiUrl}/auth/register`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Device-ID': deviceId || 'unknown-device'
                        },
                        body: JSON.stringify({
                            username,
                            password,
                            password_confirm: password,
                            nickname: nickname || username,
                        }),
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        const detail = typeof data.detail === 'string'
                            ? translateAuthDetail(data.detail, t, language, 'error.register')
                            : t('error.register');
                        set({ error: detail, isLoading: false });
                        return false;
                    }

                    set({
                        user: data.user,
                        accessToken: data.access_token,
                        refreshToken: data.refresh_token,
                        isLoggedIn: true,
                        isLoading: false,
                        error: null,
                    });

                    return data.user;
                } catch (e) {
                    const t = useLanguageStore.getState().t;
                    set({
                        error: e instanceof Error ? e.message : t('error.network'),
                        isLoading: false
                    });
                    return false;
                }
            },

            logout: () => {
                set({
                    user: null,
                    accessToken: null,
                    refreshToken: null,
                    isLoggedIn: false,
                    error: null,
                });
            },

            setUser: (user) => set({ user, isLoggedIn: !!user }),

            setTokens: (access, refresh) => set({
                accessToken: access,
                refreshToken: refresh
            }),

            clearError: () => set({ error: null }),

            fetchUserInfo: async () => {
                const { accessToken } = get();
                if (!accessToken) return;

                try {
                    const apiUrl = useConfigStore.getState().apiUrl;
                    const t = useLanguageStore.getState().t;
                    const response = await fetch(`${apiUrl}/auth/me`, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                        },
                    });

                    if (response.ok) {
                        const user = await response.json();
                        set({ user, isLoggedIn: true });
                    } else if (response.status === 401) {
                        // Token 过期，尝试刷新
                        const refreshed = await get().refreshAccessToken();
                        if (refreshed) {
                            // 刷新成功，重新获取用户信息
                            return await get().fetchUserInfo();
                        }
                        // 刷新失败，登出已在 refreshAccessToken 中处理
                    } else if (response.status === 403) {
                        try {
                            const payload = await response.json();
                            if (payload?.code === 'ACCOUNT_BANNED' || payload?.detail === '账户已被封禁') {
                                useDialogStore.getState().showDialog({
                                    title: t('alert.accountBanned.title'),
                                    message: t('alert.accountBanned.message'),
                                    actions: [{ label: t('common.confirm'), variant: 'primary' }],
                                });
                            }
                        } catch {
                            // ignore parse errors
                        }
                        get().logout();
                    } else {
                        // 其他错误，直接登出
                        get().logout();
                    }
                } catch (e) {
                    console.error('获取用户信息失败:', e);
                }
            },

            refreshAccessToken: async () => {
                const { refreshToken } = get();
                if (!refreshToken) return false;

                try {
                    const apiUrl = useConfigStore.getState().apiUrl;
                    const response = await fetch(`${apiUrl}/auth/refresh`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refresh_token: refreshToken }),
                    });

                    if (!response.ok) {
                        // Refresh token 也无效，需要重新登录
                        get().logout();
                        return false;
                    }

                    const data = await response.json();
                    set({
                        user: data.user,
                        accessToken: data.access_token,
                        refreshToken: data.refresh_token,
                        isLoggedIn: true,
                    });
                    return true;
                } catch (e) {
                    console.error('Token 刷新失败:', e);
                    return false;
                }
            },
        }),
        {
            name: 'project-flow-auth',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                user: state.user,
                accessToken: state.accessToken,
                refreshToken: state.refreshToken,
                isLoggedIn: state.isLoggedIn,
            }),
        }
    )
);
