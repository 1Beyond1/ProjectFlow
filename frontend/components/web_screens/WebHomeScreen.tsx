import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Image, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useTaskStore } from '../../store/useTaskStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import { WebHomeLayout } from '../../components/web/WebHomeLayout';
import { WebChatInput } from '../../components/web/WebChatInput';
import Svg, { Circle, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { processText, TaskItem } from '../../services/api';
import { useDialogStore } from '../../store/useDialogStore';
import { useTimerStore } from '../../store/useTimerStore';
import { formatTime } from '../../components/FocusTimerWidget'; // Reusing format function or define local if not exported

export default function WebHomeScreen() {
    const { getHomePageTasks, toggleTask, addTask } = useTaskStore();
    const { user } = useAuthStore();
    const { t, language } = useLanguageStore();
    const { showDialog } = useDialogStore();
    const { timeLeft, status, start, pause, resume, reset, mode, setMode, duration, setDuration } = useTimerStore();
    const [isProcessing, setIsProcessing] = useState(false);

    const handleToggleTimer = () => {
        if (status === 'running') {
            pause();
        } else if (status === 'paused') {
            resume();
        } else {
            start();
        }
    };

    const canAdjustTimer = status !== 'running';
    const durationOptions = [15, 25, 50];

    // Habits State (Local for now)
    const [habits, setHabits] = useState([
        { name: 'web.habit.item.hydration', icon: 'water', color: '#3B82F6', bg: '#EFF6FF', w: '75%', completed: false },
        { name: 'web.habit.item.meditation', icon: 'body-outline', color: '#9333EA', bg: '#F3E8FF', w: '100%', completed: true },
        { name: 'web.habit.item.reading', icon: 'book-outline', color: '#EA580C', bg: '#FFEDD5', w: '50%', completed: false },
        { name: 'web.habit.item.exercise', icon: 'fitness-outline', color: '#16A34A', bg: '#DCFCE7', w: '0%', completed: false },
    ]);

    const toggleHabit = (index: number) => {
        const newHabits = [...habits];
        newHabits[index].completed = !newHabits[index].completed;
        newHabits[index].w = newHabits[index].completed ? '100%' : '0%';
        setHabits(newHabits);
    };

    const handleSendText = async (text: string) => {
        setIsProcessing(true);
        try {
            const result = await processText(text);
            if (result.success && result.ai_result?.tasks) {
                // Add extracted tasks
                const tasksToAdd = result.ai_result.tasks;
                tasksToAdd.forEach((task: TaskItem) => {
                    addTask({
                        title: task.title,
                        priority: task.priority || 'normal',
                        timestamp: task.timestamp, // API returns YYYY-MM-DD HH:mm:ss
                        subtasks: task.subtasks
                    });
                });

                showDialog({
                    title: t('common.success'),
                    message: `${t('api.log.processSuccessPrefix')}${tasksToAdd.length} ${t('web.tasks.taskCountSuffix')}`,
                    actions: [{ label: t('common.confirm'), variant: 'primary' }]
                });
            } else {
                showDialog({
                    title: t('common.error'),
                    message: result.error || t('alert.processFailed.unknown'),
                    actions: [{ label: t('common.confirm'), variant: 'primary' }]
                });
            }
        } catch (e) {
            console.error(e);
            showDialog({
                title: t('common.error'),
                message: t('alert.processFailed.unknown'),
                actions: [{ label: t('common.confirm'), variant: 'primary' }]
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const now = new Date();
    const hour = now.getHours();
    const greetingKey = hour < 12 ? 'home.greeting.morning' : hour < 18 ? 'home.greeting.afternoon' : 'home.greeting.evening';
    const greeting = t(greetingKey);
    const displayName = user?.username || t('common.guest');
    const locale = language === 'zh-CN' ? 'zh-CN' : 'en-US';
    const dateLabel = now.toLocaleDateString(locale, { month: 'short', day: 'numeric' });

    const todayTasksWithTime = getHomePageTasks();
    const completedTasks = todayTasksWithTime.filter(t => t.completed).length;
    const totalTasks = todayTasksWithTime.length;
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) : 0;

    // Determine active focus (first uncompleted high priority, or just first uncompleted)
    const activeFocusTask = todayTasksWithTime.find(t => !t.completed && t.priority === 'high')
        || todayTasksWithTime.find(t => !t.completed);

    return (
        <WebHomeLayout>
            {/* Main Scroll Content Wrapper */}
            <View className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto px-8 pt-12 pb-32">

                {/* 1. Header Section */}
                <View className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <View className="flex flex-col gap-1">
                        <Text className="text-3xl lg:text-4xl font-extrabold tracking-tight" style={{ color: Colors.textMain }}>
                            {greeting}, {displayName}
                        </Text>
                        <Text className="text-lg font-medium" style={{ color: Colors.textSubtle }}>
                            {t('web.home.tagline')}
                        </Text>
                    </View>
                    <View className="px-5 py-2.5 rounded-2xl border shadow-sm flex-row items-center gap-3" style={{ backgroundColor: Colors.surface, borderColor: 'rgba(255,255,255,0.5)' }}>
                        <Ionicons name="chatbox-ellipses-outline" size={20} color={Colors.primary} />
                        <Text className="text-sm font-semibold" style={{ color: Colors.textMain }}>"{t('web.home.quote')}"</Text>
                        <View className="h-4 w-px mx-2" style={{ backgroundColor: '#E5E7EB' }} />
                        <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: Colors.textSubtle }}>{dateLabel}</Text>
                    </View>
                </View>

                {/* 2. Top Stats Grid (3 Cols) */}
                <View className="flex-row gap-6 w-full flex-wrap">
                    {/* Weekly Progress */}
                    <View className="flex-1 min-w-[300px] p-5 rounded-3xl border shadow-sm flex-row items-center gap-5 relative overflow-hidden"
                        style={{ backgroundColor: Colors.surface, borderColor: 'rgba(255,255,255,0.5)' }}>
                        <View className="relative size-16 shrink-0" style={{ width: 64, height: 64 }}>
                            <Svg width={64} height={64} viewBox="0 0 36 36" style={{ transform: [{ rotate: '-90deg' }] }}>
                                <Path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F3F4F6" strokeWidth="3" />
                                <Path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={Colors.primary} strokeWidth="3" strokeDasharray="68, 100" strokeLinecap="round" />
                            </Svg>
                            <View className="absolute inset-0 flex items-center justify-center" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                                <Text className="text-sm font-bold" style={{ color: Colors.textMain }}>68%</Text>
                            </View>
                        </View>
                        <View>
                            <Text className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: Colors.textSubtle }}>{t('web.home.weeklyProgress')}</Text>
                            <Text className="text-lg font-bold leading-tight" style={{ color: Colors.textMain }}>{t('web.home.weeklyStatus.onTrack')}</Text>
                            <Text className="text-xs mt-0.5" style={{ color: Colors.textSubtle }}>{t('web.home.weeklyStatus.better')}</Text>
                        </View>
                    </View>

                    {/* Daily Goal */}
                    <View className="flex-1 min-w-[300px] p-5 rounded-3xl border shadow-sm flex-col justify-center gap-2"
                        style={{ backgroundColor: Colors.surface, borderColor: 'rgba(255,255,255,0.5)' }}>
                        <View className="flex-row items-center justify-between mb-1">
                            <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: Colors.textSubtle }}>{t('web.home.dailyGoal')}</Text>
                            <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: Colors.primary + '1A' }}>
                                <Text className="text-sm font-bold" style={{ color: Colors.primary }}>{completedTasks} / {Math.max(totalTasks, 8)}</Text>
                            </View>
                        </View>
                        <View className="w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: '#F3F4F6' }}>
                            <View className="h-full rounded-full" style={{ width: `${Math.max(progress * 100, 5)}%`, backgroundColor: Colors.primary }} />
                        </View>
                        <Text className="text-xs mt-1" style={{ color: Colors.textSubtle }}>
                            {t('web.home.tasksRemainingPrefix')}{Math.max(0, (totalTasks || 8) - completedTasks)}{t('web.home.tasksRemainingSuffix')}
                        </Text>
                    </View>

                    {/* Active Focus (Orange Card) - Connected to TimerStore */}
                    <LinearGradient
                        colors={[Colors.primary, '#D62F0A']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        className="flex-1 min-w-[300px] p-5 rounded-3xl shadow-lg flex-row items-center justify-between relative overflow-hidden"
                    >
                        <View className="absolute right-0 top-0 size-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" style={{ width: 128, height: 128 }} />
                        <View>
                            <View className="flex-row items-center gap-1 mb-1">
                                <View className={`size-2 rounded-full ${status === 'running' ? 'bg-green-400' : 'bg-gray-300'}`} style={{ width: 8, height: 8 }} />
                                <Text className="text-white/80 text-xs font-bold uppercase tracking-wider">{t('web.home.activeFocus')}</Text>
                            </View>
                            <Text className="text-lg font-bold mb-1 text-white" numberOfLines={1}>
                                {activeFocusTask ? activeFocusTask.title : t('home.empty.title')}
                            </Text>
                            <Text className="text-2xl font-mono font-bold tracking-wider text-white">
                                {formatTime(timeLeft)}
                            </Text>
                            <View className="flex-row items-center gap-2 mt-3">
                                <Pressable
                                    onPress={() => {
                                        if (!canAdjustTimer) return;
                                        setMode('countdown');
                                    }}
                                    className="px-2 py-1 rounded-full"
                                    style={{ backgroundColor: mode === 'countdown' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)', opacity: canAdjustTimer ? 1 : 0.5 }}
                                >
                                    <Text className="text-[10px] font-bold text-white">倒计时</Text>
                                </Pressable>
                                <Pressable
                                    onPress={() => {
                                        if (!canAdjustTimer) return;
                                        setMode('countup');
                                    }}
                                    className="px-2 py-1 rounded-full"
                                    style={{ backgroundColor: mode === 'countup' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)', opacity: canAdjustTimer ? 1 : 0.5 }}
                                >
                                    <Text className="text-[10px] font-bold text-white">正计时</Text>
                                </Pressable>
                            </View>
                            {mode === 'countdown' && (
                                <View className="flex-row items-center gap-2 mt-3 flex-wrap">
                                    {durationOptions.map((minutes) => {
                                        const seconds = minutes * 60;
                                        const isActive = duration === seconds;
                                        return (
                                            <Pressable
                                                key={minutes}
                                                onPress={() => {
                                                    if (!canAdjustTimer) return;
                                                    setDuration(seconds);
                                                }}
                                                className="px-2 py-1 rounded-full"
                                                style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)', opacity: canAdjustTimer ? 1 : 0.5 }}
                                            >
                                                <Text className="text-[10px] font-bold text-white">{minutes}m</Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                        <View className="flex-row items-center gap-3">
                            <Pressable
                                onPress={() => reset()}
                                className="size-10 rounded-full bg-white/20 flex items-center justify-center"
                                style={{ width: 40, height: 40 }}
                            >
                                <Ionicons name="refresh" size={18} color="white" />
                            </Pressable>
                            <Pressable
                                onPress={handleToggleTimer}
                                className="size-12 rounded-full bg-white flex items-center justify-center shadow-lg transform transition-transform hover:scale-105"
                                style={{ width: 48, height: 48 }}
                            >
                                <Ionicons name={status === 'running' ? "pause" : "play"} size={24} color={Colors.primary} />
                            </Pressable>
                        </View>
                    </LinearGradient>
                </View>

                {/* 3. Main Split Content (Left: Tasks, Right: AI/Image) */}
                <View className="flex-row flex-wrap lg:flex-nowrap gap-6 w-full">

                    {/* Left: Today's Focus */}
                    <View className="w-full lg:flex-[2] bg-white rounded-3xl shadow-sm border flex-col" style={{ borderColor: 'rgba(255,255,255,0.5)', minWidth: 400 }}>
                        <View className="p-6 border-b flex-row items-center justify-between" style={{ borderColor: '#F0EAE8' }}>
                            <View>
                                <Text className="text-2xl font-bold" style={{ color: Colors.textMain }}>{t('home.focus.title')}</Text>
                                <Text className="text-sm mt-1" style={{ color: Colors.textSubtle }}>
                                    {t('web.home.aiPrioritizedPrefix')}{totalTasks}{t('web.home.aiPrioritizedSuffix')}
                                </Text>
                            </View>
                            <View className="flex-row items-center gap-2">
                                <View className="px-3 py-1 rounded-full flex-row items-center gap-1" style={{ backgroundColor: Colors.primary + '1A' }}>
                                    <Ionicons name="sparkles" size={14} color={Colors.primary} />
                                    <Text className="text-xs font-bold" style={{ color: Colors.primary }}>{t('web.home.aiSorted')}</Text>
                                </View>
                                <Pressable className="size-9 rounded-full hover:bg-gray-50 flex items-center justify-center" style={{ width: 36, height: 36 }}>
                                    <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textSubtle} />
                                </Pressable>
                            </View>
                        </View>

                        <View className="p-6 flex-col gap-4">

                            {/* Real Tasks Mapping */}
                            {todayTasksWithTime.length > 0 ? (
                                todayTasksWithTime.map((task) => (
                                    <Pressable key={task.id} className="flex-row items-start gap-4 p-5 rounded-2xl border cursor-pointer hover:shadow-md transition-all"
                                        onPress={() => toggleTask(task.id)}
                                        style={{ backgroundColor: task.priority === 'high' ? '#FFF8F6' : 'white', borderColor: task.completed ? '#F0EAE8' : (task.priority === 'high' ? Colors.primary + '1A' : '#E0D6D4') }}>
                                        <View className={`mt-1 size-6 rounded-lg border-2 flex items-center justify-center ${task.completed ? 'bg-primary border-primary' : 'border-[#D6CCC9]'}`}
                                            style={{ width: 24, height: 24, backgroundColor: task.completed ? Colors.primary : 'transparent', borderColor: task.completed ? Colors.primary : (task.priority === 'high' ? Colors.primary + '4D' : '#D6CCC9') }}>
                                            {task.completed && <Ionicons name="checkmark" size={16} color="white" />}
                                        </View>
                                        <View className="flex-1">
                                            <View className="flex-row items-start justify-between">
                                                <Text className={`font-semibold text-lg leading-tight ${task.completed ? 'line-through text-gray-400' : ''}`} style={{ color: task.completed ? Colors.textSubtle : Colors.textMain }}>{task.title}</Text>
                                                {task.priority === 'high' && !task.completed && (
                                                    <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: Colors.primary }}>
                                                        <Text className="text-[10px] font-bold text-white uppercase tracking-wide">{t('web.tasks.highPriority')}</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <View className="flex-row items-center gap-4 mt-2">
                                                <View className="flex-row items-center gap-1">
                                                    <Ionicons name="time-outline" size={14} color={Colors.textSubtle} />
                                                    <Text className="text-xs font-medium" style={{ color: Colors.textSubtle }}>{task.time || task.timestamp?.split(' ')[1] || t('calendar.today')}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </Pressable>
                                ))
                            ) : (
                                <View className="py-12 items-center justify-center">
                                    <Text className="text-text-muted">{t('home.empty.title')}</Text>
                                    <Text className="text-xs text-text-muted mt-1">{t('home.empty.subtitle')}</Text>
                                </View>
                            )}

                            <Pressable className="w-full mt-2 py-3 rounded-xl border-2 border-dashed flex-row items-center justify-center gap-2 hover:border-primary transition-colors"
                                style={{ borderColor: '#E0D6D4' }}>
                                <Ionicons name="add" size={20} color={Colors.textSubtle} />
                                <Text className="font-bold text-sm" style={{ color: Colors.textSubtle }}>{t('web.home.addNewTask')}</Text>
                            </Pressable>
                        </View>
                    </View>

                    {/* Right: AI Assistant / Insight */}
                    <View className="w-full lg:flex-1 h-full min-w-[300px]">
                        <View className="bg-white rounded-3xl shadow-sm border relative overflow-hidden flex-col h-full" style={{ borderColor: 'rgba(255,255,255,0.5)' }}>
                            <View className="h-32 w-full relative bg-gray-200">
                                {/* Fallback Gradient Image */}
                                <LinearGradient colors={['#FFECD2', '#FCB69F']} style={{ width: '100%', height: '100%' }} />
                                <View className="absolute inset-0 bg-gradient-to-t from-white to-black/30" />
                                <View className="absolute bottom-4 left-6 flex-row items-center gap-2 z-10">
                                    <View className="size-8 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30" style={{ width: 32, height: 32 }}>
                                        <Ionicons name="bulb" size={18} color="white" />
                                    </View>
                                    <Text className="text-xl font-bold text-white shadow-sm">{t('web.home.aiAssistant')}</Text>
                                </View>
                            </View>

                            <View className="p-6 flex-col gap-6 flex-1">
                                <View>
                                    <View className="flex-row items-center gap-1 mb-2">
                                        <Ionicons name="time-outline" size={14} color={Colors.textSubtle} />
                                        <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: Colors.textSubtle }}>{t('web.home.insight.title')}</Text>
                                    </View>
                                    <View className="p-4 rounded-2xl border" style={{ backgroundColor: '#F5F0EF', borderColor: '#EBE5E3' }}>
                                        <Text className="text-sm leading-relaxed font-medium" style={{ color: Colors.textMain }}>
                                            {t('web.home.insight.text')}
                                        </Text>
                                    </View>
                                </View>
                                <View>
                                    <View className="flex-row items-center gap-1 mb-2">
                                        <Ionicons name="flashlight-outline" size={14} color={Colors.textSubtle} />
                                        <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: Colors.textSubtle }}>{t('web.home.suggestedAction.title')}</Text>
                                    </View>
                                    <View className="p-4 rounded-2xl border" style={{ backgroundColor: Colors.primary + '0D', borderColor: Colors.primary + '1A' }}>
                                        <Text className="text-sm leading-relaxed mb-3" style={{ color: Colors.textMain }}>
                                            {t('web.home.suggestedAction.text')}
                                        </Text>
                                        <Pressable className="w-full py-2 rounded-lg shadow-sm flex items-center justify-center" style={{ backgroundColor: Colors.primary }}>
                                            <Text className="text-xs font-bold text-white">{t('web.home.suggestedAction.cta')}</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* 4. Habit Tracker */}
                <View className="bg-white rounded-3xl p-6 shadow-sm border" style={{ borderColor: 'rgba(255,255,255,0.5)' }}>
                    <View className="flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <Text className="text-lg font-bold flex-row items-center gap-2" style={{ color: Colors.textMain }}>
                            <Ionicons name="leaf" size={20} color={Colors.primary} />
                            {' '}{t('web.home.habitTracker')}
                        </Text>
                        <View className="flex-row gap-1">
                            {[t('web.habit.day.mon'), t('web.habit.day.tue'), t('web.habit.day.wed'), t('web.habit.day.thu'), t('web.habit.day.fri'), t('web.habit.day.sat'), t('web.habit.day.sun')].map((day, i) => (
                                <View key={i} className="size-8 rounded-full flex items-center justify-center" style={{ width: 32, height: 32, backgroundColor: i === 0 ? Colors.primary : '#F5F0EF' }}>
                                    <Text className="text-xs font-bold" style={{ color: i === 0 ? 'white' : Colors.textSubtle }}>{day}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                    <View className="flex-row flex-wrap gap-4">
                        {habits.map((habit, i) => (
                            <Pressable key={i} onPress={() => toggleHabit(i)} className="flex-1 min-w-[200px] flex-row items-center gap-3 p-3 rounded-xl border border-transparent hover:border-[#E0D6D4] transition-colors" style={{ backgroundColor: habit.completed ? '#ECFDF5' : '#F9F7F6' }}>
                                <View className="size-10 rounded-full flex items-center justify-center" style={{ width: 40, height: 40, backgroundColor: habit.completed ? '#10B981' : habit.bg }}>
                                    <Ionicons name={habit.completed ? 'checkmark' : habit.icon as any} size={20} color={habit.completed ? 'white' : habit.color} />
                                </View>
                                <View>
                                    <Text className="font-bold text-sm" style={{ color: Colors.textMain }}>{t(habit.name)}</Text>
                                    <View className="w-24 h-1.5 rounded-full mt-1" style={{ backgroundColor: '#E5E7EB' }}>
                                        <View className="h-full rounded-full transition-all duration-500" style={{ width: habit.w as any, backgroundColor: habit.completed ? '#10B981' : habit.color }} />
                                    </View>
                                </View>
                            </Pressable>
                        ))}
                    </View>
                </View>

            </View>

            {/* Global Chat Input */}
            <WebChatInput
                onSendText={handleSendText}
                onSendAudio={(uri) => console.log('Send Audio:', uri)}
            />

            {/* Global Loading Overlay */}
            {isProcessing && (
                <View className="absolute inset-0 bg-black/20 flex items-center justify-center z-50">
                    <View className="bg-white p-6 rounded-3xl items-center shadow-xl">
                        <ActivityIndicator size="large" color={Colors.primary} />
                        <Text className="mt-4 font-bold text-gray-700">{t('record.processing')}</Text>
                    </View>
                </View>
            )}
        </WebHomeLayout>
    );
}
