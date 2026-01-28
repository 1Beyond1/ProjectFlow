/**
 * 日期工具函数
 */

export const formatFriendlyDate = (dateString?: string): string => {
    if (!dateString) return '';

    try {
        const targetDate = new Date(dateString);
        if (isNaN(targetDate.getTime())) return dateString; // 无法解析则原样返回

        const today = new Date();

        // 归一化到午夜 00:00:00，避免时分秒影响天数计算
        const targetDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        const diffTime = targetDay.getTime() - currentDay.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        switch (diffDays) {
            case -2: return '前天';
            case -1: return '昨天';
            case 0: return '今天';
            case 1: return '明天';
            case 2: return '后天';
            default:
                // 返回 YYYY-MM-DD
                const y = targetDate.getFullYear();
                const m = (targetDate.getMonth() + 1).toString().padStart(2, '0');
                const d = targetDate.getDate().toString().padStart(2, '0');
                return `${y}-${m}-${d}`;
        }
    } catch (e) {
        return dateString;
    }
};
