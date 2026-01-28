/**
 * Warm Terra 色系常量定义
 */
export const Colors = {
    // 主色调
    primary: '#cc6933',       // Terracotta 陶土色
    primaryDark: '#b05525',

    // 辅助色
    secondary: '#9EC29C',     // Sage Green 鼠尾草绿

    // 背景色
    background: '#FDFBF7',    // Creamy Off-white
    backgroundDark: '#2a2522',

    // 表面色
    surface: '#FFFFFF',
    surfaceDark: '#36302c',

    // 文字色
    textMain: '#47433F',      // Deep Warm Charcoal
    textSubtle: '#837167',
    textLight: '#FFFFFF',

    // 装饰色
    sand: '#EBE7E2',          // Warm Sand
    inputBg: '#F2EFE9',

    // 状态色
    success: '#9EC29C',
    error: '#E57373',
    warning: '#FFB74D',
} as const;

// 优先级颜色映射
export const PriorityColors = {
    low: Colors.textSubtle,
    normal: Colors.primary,
    high: Colors.error,
} as const;
