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

    const handleBanned = useCallback(() => {
        showDialog({
            title: '账号已封禁',
            message: '您的账号因违反社区规定已被封禁，无法继续操作。如有异议请联系客服。',
            actions: [
                {
                    label: '退出登录',
                    variant: 'destructive',
                    onPress: () => {
                        logout();
                    }
                }
            ]
        });
    }, [logout, showDialog]);

    /**
     * 检查用户是否被封禁
     * @returns boolean - 如果用户正常返回 true，被封禁返回 false
     */
    const checkBanStatus = useCallback((): boolean => {
        // 检查本地 store 状态（兼容后端 is_banned 数值/布尔字段与历史 status 字段）
        if (user?.is_banned === 1 || user?.is_banned === true || user?.status === 'banned') {
            handleBanned();
            return false;
        }

        return true;
    }, [user, handleBanned]);

    return { checkBanStatus };
};
