/**
 * 首页 - Today Dashboard
 * 复刻 HTML 原型的主界面
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { TaskCard } from '../../components/TaskCard';
import { VoiceInputBar } from '../../components/VoiceInputBar';
import { useTaskStore } from '../../store/useTaskStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import { useDialogStore } from '../../store/useDialogStore';
import { useTimerStore } from '../../store/useTimerStore';
import WebHomeScreen from '../../components/web_screens/WebHomeScreen';

// Mobile Home Component (Original Logic)
const MobileHomeScreen = () => {
    const insets = useSafeAreaInsets();
    const { getHomePageTasks, toggleTask, deleteTask, clearTodayTasks } = useTaskStore();
    const { t, language } = useLanguageStore();
    const { showDialog } = useDialogStore();

    // 获取今天有时间安排的任务 + 逾期任务
    const todayTasksWithTime = getHomePageTasks();

    // 获取当前日期信息
    const dateInfo = useMemo(() => {
        const now = new Date();
        const weekdays = [
            t('home.date.weekday.sun'),
            t('home.date.weekday.mon'),
            t('home.date.weekday.tue'),
            t('home.date.weekday.wed'),
            t('home.date.weekday.thu'),
            t('home.date.weekday.fri'),
            t('home.date.weekday.sat'),
        ];
        const months = [
            t('home.date.month.1'),
            t('home.date.month.2'),
            t('home.date.month.3'),
            t('home.date.month.4'),
            t('home.date.month.5'),
            t('home.date.month.6'),
            t('home.date.month.7'),
            t('home.date.month.8'),
            t('home.date.month.9'),
            t('home.date.month.10'),
            t('home.date.month.11'),
            t('home.date.month.12'),
        ];

        return {
            weekday: weekdays[now.getDay()],
            month: months[now.getMonth()],
            day: now.getDate(),
            greeting: now.getHours() < 12
                ? t('home.greeting.morning')
                : now.getHours() < 18
                    ? t('home.greeting.afternoon')
                    : t('home.greeting.evening'),
        };
    }, [t, language]);

    // 计算完成率
    const completionStats = useMemo(() => {
        if (todayTasksWithTime.length === 0) {
            return { completed: 0, total: 0, percentage: 0 };
        }
        const completed = todayTasksWithTime.filter((t) => t.completed).length;
        return {
            completed,
            total: todayTasksWithTime.length,
            percentage: Math.round((completed / todayTasksWithTime.length) * 100),
        };
    }, [todayTasksWithTime]);

    // 管理菜单点击
    const handleMenuPress = () => {
        showDialog({
            title: t('home.menu.title'),
            message: t('home.menu.message'),
            actions: [
                { label: t('common.cancel'), variant: 'secondary' },
                {
                    label: t('home.menu.clearAll'),
                    variant: 'destructive',
                    onPress: () => {
                        showDialog({
                            title: t('home.menu.confirm.title'),
                            message: t('home.menu.confirm.message'),
                            actions: [
                                { label: t('common.cancel'), variant: 'secondary' },
                                { label: t('home.menu.confirm.confirm'), variant: 'destructive', onPress: clearTodayTasks },
                            ],
                        });
                    },
                },
            ],
        });
    };

    return (
        <View className="flex-1" style={{ backgroundColor: Colors.background }}>
            {/* 顶部安全区 */}
            <View style={{ height: insets.top + 12 }} />

            {/* 头部 */}
            <View className="px-6 py-4 flex-row justify-between items-center">
                <View>
                    <Text
                        className="text-3xl font-extrabold tracking-tight leading-tight"
                        style={{ color: Colors.textMain }}
                    >
                        {dateInfo.greeting}，{'\n'}{t('home.user')}
                    </Text>
                    <Text
                        className="text-sm font-medium mt-1"
                        style={{ color: Colors.textSubtle }}
                    >
                        {dateInfo.weekday}，{language === 'zh-CN' ? `${dateInfo.month}${dateInfo.day}日` : `${dateInfo.month} ${dateInfo.day}`}
                    </Text>
                </View>

                {/* 头像 */}
                <View
                    className="h-12 w-12 rounded-full overflow-hidden border-2 items-center justify-center"
                    style={{ borderColor: Colors.surface, backgroundColor: Colors.sand }}
                >
                    <Ionicons name="person" size={24} color={Colors.textSubtle} />
                </View>
            </View>

            {/* 主内容区 */}
            <ScrollView
                className="flex-1 px-6"
                contentContainerStyle={{ paddingBottom: 200 }}
                showsVerticalScrollIndicator={false}
            >
                <View className="h-4" />

                {/* Today's Focus 卡片 */}
                <View
                    className="rounded-3xl p-6"
                    style={{ backgroundColor: Colors.surface, shadowColor: '#A8A09B', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 5 }}
                >
                    <View className="flex-row items-center justify-between mb-6">
                        <Text
                            className="text-lg font-bold tracking-tight"
                            style={{ color: Colors.textMain }}
                        >
                            {t('home.focus.title')}
                        </Text>
                        <View className="flex-row items-center gap-2">
                            {/* Start Focus Button */}
                            <Pressable
                                className="p-2 rounded-full bg-orange-100"
                                onPress={() => useTimerStore.getState().start()}
                                hitSlop={10}
                            >
                                <Ionicons name="play" size={20} color={Colors.primary} />
                            </Pressable>

                            <Pressable
                                className="p-2 -mr-2"
                                onPress={handleMenuPress}
                                hitSlop={10}
                            >
                                <Ionicons name="ellipsis-horizontal" size={20} color={Colors.primary} />
                            </Pressable>
                        </View>
                    </View>

                    {/* 任务列表 */}
                    {todayTasksWithTime.length > 0 ? (
                        <View className="gap-4">
                            {todayTasksWithTime.map((task) => (
                                <TaskCard
                                    key={task.id}
                                    task={task}
                                    onToggle={toggleTask}
                                    onDelete={deleteTask}
                                />
                            ))}
                        </View>
                    ) : (
                        <View className="py-8 items-center">
                            <Ionicons name="calendar-outline" size={48} color={Colors.textSubtle + '60'} />
                            <Text className="text-base mt-3" style={{ color: Colors.textSubtle }}>
                                {t('home.empty.title')}
                            </Text>
                            <Text className="text-sm mt-1" style={{ color: Colors.textSubtle + '80' }}>
                                {t('home.empty.subtitle')}
                            </Text>
                        </View>
                    )}
                </View>

                <View className="h-6" />

                {/* Yesterday's Review 卡片 */}
                <View
                    className="rounded-3xl p-6 relative overflow-hidden"
                    style={{ backgroundColor: Colors.sand }}
                >
                    {/* 背景装饰 */}
                    <View
                        className="absolute -right-8 -top-8 w-32 h-32 rounded-full"
                        style={{ backgroundColor: Colors.primary + '08' }}
                    />

                    <View className="flex-row items-center gap-2 mb-2">
                        <Ionicons name="sparkles" size={18} color={Colors.primary} />
                        <Text
                            className="text-sm font-bold uppercase tracking-wider"
                            style={{ color: Colors.primary }}
                        >
                            {t('home.review.title')}
                        </Text>
                    </View>

                    <Text
                        className="text-base font-medium leading-relaxed"
                        style={{ color: Colors.textMain }}
                    >
                        {completionStats.total > 0 ? (
                            <>
                                {t('home.review.completed.prefix')}
                                <Text className="font-bold" style={{ color: Colors.primary }}>
                                    {completionStats.percentage}%
                                </Text>
                                {t('home.review.completed.suffix')}
                                {completionStats.percentage >= 80 && t('home.review.praise.high')}
                                {completionStats.percentage >= 50 && completionStats.percentage < 80 && t('home.review.praise.mid')}
                                {completionStats.percentage < 50 && t('home.review.praise.low')}
                            </>
                        ) : (
                            t('home.review.noTasks')
                        )}
                    </Text>

                    {/* 进度条 */}
                    {completionStats.total > 0 && (
                        <View className="mt-4">
                            <View
                                className="h-1.5 rounded-full overflow-hidden"
                                style={{ backgroundColor: Colors.surface + '80' }}
                            >
                                <View
                                    className="h-full rounded-full"
                                    style={{
                                        backgroundColor: Colors.primary,
                                        width: `${completionStats.percentage}%`,
                                    }}
                                />
                            </View>
                        </View>
                    )}
                </View>

                <View className="h-8" />
            </ScrollView>

            {/* 语音输入条 */}
            <VoiceInputBar />

            {/* 底部 Tab 占位 */}
            <View style={{ height: 88 }} />
        </View>
    );
}

const HomeScreen = () => {
    const { width } = useWindowDimensions();
    const isDesktop = width >= 768; // Tailwind md/lg breakpoint typical usage

    if (isDesktop && Platform.OS === 'web') {
        return <WebHomeScreen />;
    }

    return <MobileHomeScreen />;
};

export default HomeScreen;
