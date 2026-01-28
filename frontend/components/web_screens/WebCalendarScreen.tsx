import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useTaskStore } from '../../store/useTaskStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import { WebHomeLayout } from '../../components/web/WebHomeLayout';
import { useBanCheck } from '../../hooks/useBanCheck';
import { useDialogStore } from '../../store/useDialogStore';

export default function WebCalendarScreen() {
    const { getTasksByDate, getAllTaskDates, deleteTask, addTask, getHomePageTasks } = useTaskStore();
    const { user } = useAuthStore();
    const { t, language } = useLanguageStore();
    const { checkBanStatus } = useBanCheck();
    const { showDialog } = useDialogStore();

    // Mock Calendar Logic - In real app, would use state for current month/year
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());

    // Handle month transitions
    if (currentMonth > 11) {
        setCurrentMonth(0);
        setCurrentYear(currentYear + 1);
    } else if (currentMonth < 0) {
        setCurrentMonth(11);
        setCurrentYear(currentYear - 1);
    }

    // Generate simple calendar grid
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDay = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun

    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array.from({ length: firstDay }, (_, i) => i);

    const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US';
    const monthName = new Date(currentYear, currentMonth).toLocaleString(locale, { month: 'long' });

    const handleTaskClick = (task: any) => {
        showDialog({
            title: t('common.edit') + ' / ' + t('common.delete'),
            message: `${t('web.calendar.dialog.taskPrefix')}${task.title}\n${t('web.calendar.dialog.timePrefix')}${task.timestamp}`,
            actions: [
                {
                    label: t('common.cancel'),
                    variant: 'secondary'
                },
                {
                    label: t('common.delete'),
                    variant: 'destructive',
                    onPress: () => {
                        if (checkBanStatus()) {
                            deleteTask(task.id);
                        }
                    }
                }
            ]
        });
    };

    const handleNewEvent = () => {
        if (Platform.OS === 'web') {
            const title = window.prompt(t('task.add'));
            if (title) {
                addTask({
                    title,
                    priority: 'normal',
                    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    subtasks: []
                });
            }
        }
    };

    // Find Next Up Task
    const nextUpTask = useMemo(() => {
        const now = new Date();
        const allTasks = getHomePageTasks(); // Using getHomePageTasks as a proxy for 'all relevant tasks'
        // Filter tasks that are in the future and not completed
        const futureTasks = allTasks.filter(t => {
            if (!t.timestamp) return false;
            return new Date(t.timestamp) > now && !t.completed;
        });
        return futureTasks.sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime())[0];
    }, [getHomePageTasks, currentYear, currentMonth]);

    return (
        <WebHomeLayout>
            <View className="flex flex-col gap-6 h-full p-6" style={{ height: 'calc(100vh - 100px)' } as any}>
                <View className="flex-row justify-between items-center">
                    <View>
                        <Text className="text-2xl font-bold tracking-tight" style={{ color: Colors.textMain }}>{t('web.calendar.title')}</Text>
                        <Text className="text-sm" style={{ color: Colors.textSubtle }}>{t('web.calendar.subtitle')}</Text>
                    </View>
                    <Pressable
                        onPress={handleNewEvent}
                        className="bg-primary px-5 py-2.5 rounded-xl flex-row items-center gap-2 hover:opacity-90 transition-opacity"
                    >
                        <Ionicons name="add" size={20} color="white" />
                        <Text className="text-white font-bold text-sm">{t('web.calendar.newEvent')}</Text>
                    </Pressable>
                </View>

                <View className="flex-row gap-6 h-full" style={{ flex: 1 }}>
                    {/* Left: Calendar Grid */}
                    <View className="flex-3 flex flex-col rounded-2xl border shadow-sm overflow-hidden h-full" style={{ flex: 3, backgroundColor: Colors.surface, borderColor: 'rgba(0,0,0,0.05)' }}>
                        {/* Calendar Header */}
                        <View className="flex-row items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                            <View className="flex-row items-center gap-4">
                                <Text className="text-xl font-bold" style={{ color: Colors.textMain }}>{monthName} {currentYear}</Text>
                                <View className="flex-row items-center bg-[#F8F6F6] rounded-lg p-1">
                                    <Pressable onPress={() => setCurrentMonth(prev => prev - 1)} className="p-1 rounded hover:bg-white"><Ionicons name="chevron-back" size={16} color={Colors.textSubtle} /></Pressable>
                                    <Text onPress={() => { setCurrentMonth(new Date().getMonth()); setCurrentYear(new Date().getFullYear()); }} className="px-3 py-1 text-xs font-bold cursor-pointer" style={{ color: Colors.textMain }}>{t('calendar.today')}</Text>
                                    <Pressable onPress={() => setCurrentMonth(prev => prev + 1)} className="p-1 rounded hover:bg-white"><Ionicons name="chevron-forward" size={16} color={Colors.textSubtle} /></Pressable>
                                </View>
                            </View>
                            <View className="flex-row bg-[#F8F6F6] rounded-lg p-1">
                                <Pressable className="px-3 py-1.5 rounded bg-white shadow-sm"><Text className="text-xs font-medium" style={{ color: Colors.textMain }}>{t('web.calendar.view.month')}</Text></Pressable>
                                <Pressable className="px-3 py-1.5 rounded"><Text className="text-xs font-medium" style={{ color: Colors.textSubtle }}>{t('web.calendar.view.week')}</Text></Pressable>
                            </View>
                        </View>

                        {/* Days Header */}
                        <View className="flex-row border-b bg-[#F8F6F6]" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                            {[t('home.date.weekday.sun'), t('home.date.weekday.mon'), t('home.date.weekday.tue'), t('home.date.weekday.wed'), t('home.date.weekday.thu'), t('home.date.weekday.fri'), t('home.date.weekday.sat')].map(day => (
                                <View key={day} className="flex-1 py-3 items-center justify-center">
                                    <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: Colors.textSubtle }}>{day}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Grid */}
                        <View className="flex-1 flex-row flex-wrap bg-[#E5DEDC] gap-[1px]" style={{ gap: 1 }}>
                            {/* Render Blanks */}
                            {blanks.map((_, i) => (
                                <View key={`blank-${i}`} className="bg-white p-2 min-h-[100px]" style={{ width: '14.2%', backgroundColor: Colors.surface }}>
                                </View>
                            ))}

                            {/* Render Days */}
                            {days.map(day => {
                                const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                                // Strict sort: stored tasks are already loosely sorted, but ensure here
                                // Format current day as YYYY-MM-DD for comparison
                                // Note: dateStr might be 2023-10-1 (not padded) if logic above is simple, so ensure padding
                                const dayTasks = getTasksByDate(dateStr).sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

                                return (
                                    <View key={day} className="bg-white p-2 min-h-[100px] flex-col gap-1 group hover:bg-[#F8F6F6] transition-colors" style={{ width: '14.2%', backgroundColor: Colors.surface }}>
                                        <Text className="text-sm font-medium" style={{ color: Colors.textMain }}>{day}</Text>

                                        {dayTasks.map((task, idx) => (
                                            <Pressable
                                                key={task.id}
                                                onPress={() => handleTaskClick(task)}
                                                className="px-2 py-1 rounded border-l-4 truncate cursor-pointer hover:opacity-80 transition-opacity"
                                                style={{
                                                    marginTop: 2,
                                                    backgroundColor: task.priority === 'high' ? Colors.primary + '1A' : '#e0f2fe',
                                                    borderLeftColor: task.priority === 'high' ? Colors.primary : '#0284c7'
                                                }}
                                            >
                                                <Text className="text-xs font-semibold truncate" numberOfLines={1} style={{ color: task.priority === 'high' ? Colors.primary : '#0369a1' }}>
                                                    {task.title}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                );
                            })}
                        </View>
                    </View>

                    {/* Right: Insights Panel */}
                    <ScrollView className="flex-1 min-w-[320px] max-w-sm flex-col gap-5" showsVerticalScrollIndicator={false}>
                        {/* AI Insight */}
                        <View className="p-5 rounded-2xl border relative overflow-hidden"
                            style={{ backgroundColor: 'white', borderColor: Colors.primary + '33' }}>
                            <View className="flex-row items-start gap-3 relative z-10">
                                <View className="p-2 rounded-lg" style={{ backgroundColor: Colors.surface }}>
                                    <Ionicons name="sparkles" size={20} color={Colors.primary} />
                                </View>
                                <View>
                                    <Text className="font-bold text-sm uppercase tracking-wide mb-1" style={{ color: Colors.textMain }}>{t('web.calendar.aiInsightTitle')}</Text>
                                    <Text className="text-sm leading-relaxed" style={{ color: Colors.textMain }}>
                                        {t('web.calendar.aiInsightText')}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Task Distribution (Simple List Mock) */}
                        <View className="p-5 rounded-2xl border shadow-sm flex-col gap-4" style={{ backgroundColor: Colors.surface, borderColor: 'rgba(0,0,0,0.05)' }}>
                            <View className="flex-row justify-between items-center">
                                <Text className="font-bold" style={{ color: Colors.textMain }}>{t('web.calendar.weeklyFocus')}</Text>
                                <Text className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">+12%</Text>
                            </View>
                            {/* Simple bar chart approximation */}
                            <View className="flex-row items-end gap-1 h-36 border-b border-dashed pt-4" style={{ borderColor: '#E5DEDC' }}>
                                {[40, 60, 30, 80, 50, 20, 10].map((h, i) => (
                                    <View key={i} className="flex-1 flex-col items-center gap-2 h-full justify-end">
                                        <View className="w-full bg-[#f4f1f0] rounded-t-sm relative h-full overflow-hidden">
                                            <View className="absolute bottom-0 w-full transition-all" style={{ height: `${h}%`, backgroundColor: i === 3 ? Colors.primary : Colors.primary + '40' }} />
                                        </View>
                                    </View>
                                ))}
                            </View>
                            <View className="flex-row justify-between px-1">
                                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => <Text key={d} className="text-[10px] text-gray-400 font-bold">{d}</Text>)}
                            </View>
                        </View>

                        {/* Next Up */}
                        <View className="p-5 rounded-2xl border shadow-sm flex-col gap-3 flex-1" style={{ backgroundColor: Colors.surface, borderColor: 'rgba(0,0,0,0.05)' }}>
                            <Text className="font-bold" style={{ color: Colors.textMain }}>{t('web.calendar.nextUp')}</Text>
                            <View className="flex-col gap-3">
                                {nextUpTask ? (
                                    <View className="flex-row items-start gap-3 p-3 rounded-xl border border-transparent hover:border-[#e5dedc] transition-colors cursor-pointer" style={{ backgroundColor: '#F8F6F6' }}>
                                        <View className="mt-1 size-5 rounded-md border-2 flex items-center justify-center" style={{ borderColor: Colors.textSubtle + '4D' }} />
                                        <View className="flex-1">
                                            <Text className="text-sm font-semibold" style={{ color: Colors.textMain }}>{nextUpTask.title}</Text>
                                            <Text className="text-xs mt-0.5" style={{ color: Colors.textSubtle }}>
                                                {nextUpTask.timestamp ? new Date(nextUpTask.timestamp).toLocaleString() : t('web.tasks.anytime')}
                                            </Text>
                                        </View>
                                    </View>
                                ) : (
                                    <Text className="text-sm text-gray-400">No upcoming tasks.</Text>
                                )}
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </WebHomeLayout>
    );
}
