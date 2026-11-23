/**
 * 日期工具函数（统一使用设备本地时区，避免 toISOString 导致东八区日期偏移）
 */

export const formatLocalDate = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const formatLocalDateTime = (date: Date = new Date()): string => {
    const datePart = formatLocalDate(date);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${datePart} ${hours}:${minutes}:${seconds}`;
};

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
                return formatLocalDate(targetDate);
        }
    } catch {
        return dateString;
    }
};
