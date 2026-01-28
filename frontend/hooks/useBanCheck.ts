import { useCallback } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useDialogStore } from '../store/useDialogStore';

/**
 * 封禁检查 Hook
 * 用于在敏感操作（如上传图片、发送消息）前检查用户状态
 */
export const useBanCheck = () => {
    const { user, logout } = useAuthStore();
    const { showDialog } = useDialogStore();

    /**
     * 检查用户是否被封禁
     * @returns boolean - 如果用户正常返回 true，被封禁返回 false
     */
    const checkBanStatus = useCallback((): boolean => {
        // 1. 检查本地 store 状态
        if (user?.status === 'banned') {
            handleBanned();
            return false;
        }

        // 2. 可以在这里扩展 API 实时检查 (Optional)

        return true;
    }, [user]);

    const handleBanned = useCallback(() => {
        showDialog({
            title: '账号已封禁', // Custom Modal Title
            message: '您的账号因违反社区规定已被封禁，无法继续操作。如有异议请联系客服。', // Custom Modal Message
            actions: [
                {
                    label: '退出登录',
                    variant: 'destructive',
                    onPress: () => {
                        logout();
                        // 强制刷新或跳转逻辑由 App 路由处理 Auth 状态变化自动完成
                    }
                }
            ]
        });
    }, [logout, showDialog]);

    return { checkBanStatus };
};
