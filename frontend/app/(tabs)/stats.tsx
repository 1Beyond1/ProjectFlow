import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, useColorScheme, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTaskStore } from '../../store/useTaskStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import { useDialogStore } from '../../store/useDialogStore';
import { useConfigStore } from '../../store/useConfigStore';
import { Colors } from '../../constants/Colors';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import WebStatsScreen from '../../components/web_screens/WebStatsScreen';

type Period = 'weekly' | 'monthly';

interface AnalysisResult {
    categories: Array<{ name: string; count: number; color: string }>;
    insights: string;
    generated_at: string;
}

const MobileStatsScreen = () => {
    const insets = useSafeAreaInsets();
    const { todayTasks } = useTaskStore();
    const { user } = useAuthStore();
    const { t } = useLanguageStore();
    const { showDialog } = useDialogStore();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const [period, setPeriod] = useState<Period>('weekly');
    const [weeklyAnalysis, setWeeklyAnalysis] = useState<AnalysisResult | null>(null);
    const [monthlyAnalysis, setMonthlyAnalysis] = useState<AnalysisResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const isVip = user?.tier?.toLowerCase() === 'vip';

    // Calculate date range
    const { startDate, endDate, dateRange } = useMemo(() => {
        const end = new Date();
        const start = new Date();

        if (period === 'weekly') {
            start.setDate(end.getDate() - 6); // Last 7 days
        } else {
            start.setDate(end.getDate() - 29); // Last 30 days
        }

        const range: Date[] = [];
        const current = new Date(start);
        while (current <= end) {
            range.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }

        return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
            dateRange: range
        };
    }, [period]);

    // Filter tasks in period
    const periodTasks = useMemo(() => {
        return todayTasks.filter((task: any) => {
            if (!task.timestamp) return false;
            const taskDate = new Date(task.timestamp.split(' ')[0]);
            return taskDate >= new Date(startDate) && taskDate <= new Date(endDate);
        });
    }, [todayTasks, startDate, endDate]);

    // Calculate Flow Score
    const flowScore = useMemo(() => {
        const total = periodTasks.length;
        if (total === 0) return 0;
        const completed = periodTasks.filter((t: any) => t.completed).length;
        return Math.round((completed / total) * 100);
    }, [periodTasks]);

    const scoreLabel = flowScore >= 85 ? 'Excellent' : flowScore >= 70 ? 'Good' : flowScore >= 50 ? 'Average' : 'Needs Work';

    // Calculate daily stats for chart
    const dailyStats = useMemo(() => {
        if (period === 'weekly') {
            return dateRange.map(date => {
                const dateStr = date.toISOString().split('T')[0];
                const dayTasks = periodTasks.filter(t => t.timestamp?.startsWith(dateStr));
                const completed = dayTasks.filter(t => t.completed).length;
                const uncompleted = dayTasks.length - completed;
                const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' })[0];
                const isToday = dateStr === new Date().toISOString().split('T')[0];

                return { date: dateStr, completed, uncompleted, dayLabel, isToday };
            });
        } else {
            // Monthly: aggregate by weeks to avoid rendering error
            const weeks: any[] = [];
            const weekSize = Math.ceil(dateRange.length / 5);

            for (let i = 0; i < dateRange.length; i += weekSize) {
                const weekDates = dateRange.slice(i, i + weekSize);
                const weekTasks = weekDates.flatMap(date => {
                    const dateStr = date.toISOString().split('T')[0];
                    return periodTasks.filter(t => t.timestamp?.startsWith(dateStr));
                });

                const completed = weekTasks.filter(t => t.completed).length;
                const uncompleted = weekTasks.length - completed;
                const dayLabel = `W${Math.floor(i / weekSize) + 1}`;
                const isToday = weekDates.some(d => d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]);

                weeks.push({ date: weekDates[0].toISOString().split('T')[0], completed, uncompleted, dayLabel, isToday });
            }

            return weeks;
        }
    }, [dateRange, periodTasks, period]);

    const currentAnalysis = period === 'weekly' ? weeklyAnalysis : monthlyAnalysis;

    const handleAnalyze = async () => {
        setIsAnalyzing(true);

        try {
            const response = await fetch(`${useConfigStore.getState().apiUrl}/api/analyze-tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${useAuthStore.getState().accessToken}`,
                },
                body: JSON.stringify({
                    tasks: periodTasks.map((t: any) => ({
                        title: t.title,
                        timestamp: t.timestamp,
                        completed: t.completed,
                        priority: t.priority,
                        location: t.location,
                    })),
                    period,
                    start_date: startDate,
                    end_date: endDate,
                }),
            });

            if (!response.ok) throw new Error('Analysis failed');

            const result: AnalysisResult = await response.json();

            if (period === 'weekly') {
                setWeeklyAnalysis(result);
            } else {
                setMonthlyAnalysis(result);
            }
        } catch (error) {
            showDialog({
                title: 'Error',
                message: 'Failed to analyze tasks. Please try again.',
                actions: [{ label: t('common.confirm'), variant: 'primary' }],
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? Colors.backgroundDark : Colors.background,
        },
        header: {
            paddingHorizontal: 24,
            paddingBottom: 16,
            backgroundColor: isDark ? Colors.backgroundDark : Colors.background,
            zIndex: 20,
        },
        headerContent: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        headerTitle: {
            fontSize: 28, // ~text-3xl
            fontWeight: 'bold',
            color: isDark ? '#FFFFFF' : Colors.textMain,
        },
        segmentControl: {
            flexDirection: 'row',
            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#EAE4DD',
            padding: 4,
            borderRadius: 12,
        },
        segmentButton: {
            paddingHorizontal: 16,
            paddingVertical: 6,
            borderRadius: 8,
        },
        segmentButtonActive: {
            backgroundColor: isDark ? '#2c2421' : '#FFFFFF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 2,
            elevation: 2,
        },
        segmentText: {
            fontSize: 14,
            fontWeight: '500',
            color: Colors.textSubtle,
        },
        segmentTextActive: {
            fontWeight: 'bold',
            color: isDark ? '#FFFFFF' : Colors.textMain,
        },
        card: {
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
            padding: 24,
            borderRadius: 24,
            marginBottom: 24,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 2,
            overflow: 'hidden',
        },
        cardTitle: {
            fontSize: 18,
            fontWeight: 'bold',
            color: isDark ? '#FFFFFF' : Colors.textMain,
            marginBottom: 24,
            textAlign: 'center',
        },
        chartHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 24,
        },
        vipContainer: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
        },
        vipCard: {
            padding: 32,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: 'rgba(204, 105, 51, 0.2)',
            alignItems: 'center',
            width: '100%',
        },
        vipButton: {
            backgroundColor: Colors.primary,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 999,
            marginTop: 16,
        },
        analyzeButton: {
            paddingVertical: 16,
            borderRadius: 16,
            alignItems: 'center',
            backgroundColor: Colors.primary,
        },
        analyzeButtonDisabled: {
            backgroundColor: Colors.textSubtle + '80',
        },
        analyzeButtonText: {
            color: '#FFFFFF',
            fontWeight: 'bold',
            fontSize: 16,
        },
    });

    if (!isVip) {
        return (
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <View style={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 16 }}>
                    <Text style={styles.headerTitle}>统计</Text>
                </View>

                <View style={styles.vipContainer}>
                    <LinearGradient
                        colors={isDark ? [Colors.primary + '33', '#2a2422'] : [Colors.primary + '1A', '#fff7ed']} // from-primary/10 to-orange-50 equiv
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.vipCard}
                    >
                        <View style={{ alignItems: 'center', marginBottom: 16 }}>
                            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary + '33', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                                <Ionicons name="analytics" size={32} color={Colors.primary} />
                            </View>
                            <Text style={{ fontSize: 24, fontWeight: 'bold', color: isDark ? '#FFFFFF' : Colors.textMain, marginBottom: 8 }}>VIP 专属功能</Text>
                            <Text style={{ fontSize: 14, color: Colors.textSubtle, textAlign: 'center', lineHeight: 21 }}>
                                统计分析功能仅对 VIP 用户开放。升级以解锁深度洞察和 AI 分析。
                            </Text>
                        </View>

                        <Pressable
                            style={styles.vipButton}
                            onPress={() => {
                                showDialog({
                                    title: '升级 VIP',
                                    message: '解锁统计分析、AI 洞察等高级功能',
                                    actions: [
                                        { label: '取消', variant: 'secondary' },
                                        { label: '了解更多', variant: 'primary' },
                                    ],
                                });
                            }}
                        >
                            <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>升级 VIP</Text>
                        </Pressable>
                    </LinearGradient>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 32 }]}>
                <View style={styles.headerContent}>
                    <Text style={styles.headerTitle}>统计</Text>

                    <View style={styles.segmentControl}>
                        <Pressable
                            style={[styles.segmentButton, period === 'weekly' && styles.segmentButtonActive]}
                            onPress={() => setPeriod('weekly')}
                        >
                            <Text style={[styles.segmentText, period === 'weekly' && styles.segmentTextActive]}>
                                本周
                            </Text>
                        </Pressable>
                        <Pressable
                            style={[styles.segmentButton, period === 'monthly' && styles.segmentButtonActive]}
                            onPress={() => setPeriod('monthly')}
                        >
                            <Text style={[styles.segmentText, period === 'monthly' && styles.segmentTextActive]}>
                                本月
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>

            <ScrollView
                style={{ flex: 1, paddingHorizontal: 24 }}
                contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Flow Score */}
                <View style={styles.card}>
                    <LinearGradient
                        colors={['transparent', Colors.primary + '33', 'transparent']} // via-primary/20
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4 }}
                    />
                    <Text style={styles.cardTitle}>心流分数</Text>

                    <View style={{ alignItems: 'center', marginBottom: 8 }}>
                        <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
                            <Svg width={160} height={160} viewBox="0 0 100 100">
                                <Circle
                                    cx="50"
                                    cy="50"
                                    r="42"
                                    stroke="#F2EFE9"
                                    strokeWidth="8"
                                    fill="none"
                                />
                                <Circle
                                    cx="50"
                                    cy="50"
                                    r="42"
                                    stroke={Colors.primary}
                                    strokeWidth="8"
                                    fill="none"
                                    strokeDasharray="264"
                                    strokeDashoffset={264 - (264 * flowScore) / 100}
                                    strokeLinecap="round"
                                    transform="rotate(-90 50 50)"
                                />
                            </Svg>
                            <View style={{ position: 'absolute', alignItems: 'center' }}>
                                <Text style={{ fontSize: 48, fontWeight: 'bold', color: isDark ? '#FFFFFF' : Colors.textMain }}>{flowScore}</Text>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.secondary, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>{scoreLabel}</Text>
                            </View>
                        </View>
                    </View>

                    <Text style={{ fontSize: 14, color: Colors.textSubtle, textAlign: 'center', marginTop: 8, lineHeight: 21 }}>
                        {period === 'weekly' ? '过去 7 天' : '过去 30 天'}完成了 <Text style={{ color: Colors.primary, fontWeight: 'bold' }}>{periodTasks.filter((t: any) => t.completed).length}</Text> 个任务
                    </Text>
                </View>

                {/* Task Completion Chart */}
                <View style={styles.card}>
                    <View style={styles.chartHeader}>
                        <View>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#FFFFFF' : Colors.textMain }}>任务完成度</Text>
                            <Text style={{ fontSize: 12, color: Colors.textSubtle, marginTop: 4 }}>
                                {period === 'weekly' ? '最近 7 天' : '最近 30 天'}
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 24, fontWeight: 'bold', color: isDark ? '#FFFFFF' : Colors.textMain }}>{periodTasks.length}</Text>
                            <Text style={{ fontSize: 12, color: Colors.secondary, fontWeight: '500' }}>任务总数</Text>
                        </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-between', height: 208, gap: period === 'weekly' ? 12 : 4 }}>
                        {dailyStats.map((day, i) => {
                            const maxHeight = period === 'weekly' ? 100 : 50;
                            const completedHeight = Math.max((day.completed / Math.max(...dailyStats.map(d => d.completed + d.uncompleted))) * maxHeight, 0);
                            const uncompletedHeight = Math.max((day.uncompleted / Math.max(...dailyStats.map(d => d.completed + d.uncompleted))) * maxHeight, 0);

                            return (
                                <View key={i} style={{ flex: 1, flexDirection: 'column', alignItems: 'center' }}>
                                    <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center', width: '100%' }}>
                                        <View
                                            style={{
                                                width: '100%',
                                                borderTopLeftRadius: 8,
                                                borderTopRightRadius: 8,
                                                backgroundColor: day.isToday ? Colors.primary : Colors.primary + '4D',
                                                height: `${completedHeight}%`
                                            }}
                                        />
                                    </View>
                                    <Text style={{
                                        paddingVertical: 8,
                                        fontSize: 10,
                                        fontWeight: 'bold',
                                        color: day.isToday ? Colors.primary : Colors.textSubtle,
                                        textAlign: 'center'
                                    }}>
                                        {day.dayLabel}
                                    </Text>
                                    <View style={{ flex: 1, alignItems: 'flex-start', justifyContent: 'center', width: '100%' }}>
                                        <View
                                            style={{
                                                width: '100%',
                                                borderBottomLeftRadius: 8,
                                                borderBottomRightRadius: 8,
                                                backgroundColor: day.isToday ? Colors.sand : Colors.sand + '99',
                                                height: `${uncompletedHeight}%`
                                            }}
                                        />
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </View>

                {/* Distribution */}
                {currentAnalysis && (
                    <View style={styles.card}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#FFFFFF' : Colors.textMain, marginBottom: 20 }}>任务分布</Text>
                        <View style={{ gap: 20 }}>
                            {currentAnalysis.categories.map((cat, i) => (
                                <View key={i}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color }} />
                                            <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#FFFFFF' : Colors.textMain }}>{cat.name}</Text>
                                        </View>
                                        <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.textSubtle }}>{cat.count} 个任务</Text>
                                    </View>
                                    <View style={{ height: 8, width: '100%', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F2EFE9', borderRadius: 4, overflow: 'hidden' }}>
                                        <View
                                            style={{
                                                height: '100%',
                                                borderRadius: 4,
                                                backgroundColor: cat.color,
                                                width: `${(cat.count / periodTasks.length) * 100}%`
                                            }}
                                        />
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* AI Deep Dive */}
                {currentAnalysis && (
                    <LinearGradient
                        colors={['#2a2422', '#201512']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ padding: 20, borderRadius: 24, marginBottom: 16, overflow: 'hidden', position: 'relative' }}
                    >
                        <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: Colors.primary + '33', opacity: 0.5 }} />
                        <View style={{ position: 'absolute', bottom: 0, left: 0, width: 128, height: 128, borderRadius: 64, backgroundColor: '#f973161A', opacity: 0.5 }} />

                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, position: 'relative', zIndex: 10 }}>
                            <View style={{ padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                                <Ionicons name="bulb" size={22} color="white" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#ffccbc', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, opacity: 0.8 }}>
                                    AI 深度分析
                                </Text>
                                <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 21, fontWeight: '500', marginBottom: 12 }}>
                                    {currentAnalysis.insights}
                                </Text>
                                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                                    生成于 {currentAnalysis.generated_at} · 基于 {startDate} 至 {endDate} 的数据
                                </Text>
                            </View>
                        </View>
                    </LinearGradient>
                )}

                {/* Analyze Button */}
                <Pressable
                    style={[styles.analyzeButton, isAnalyzing && styles.analyzeButtonDisabled]}
                    onPress={handleAnalyze}
                    disabled={isAnalyzing}
                >
                    {isAnalyzing ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.analyzeButtonText}>
                            {currentAnalysis ? '重新进行 AI 分析' : '进行 AI 分析'}
                        </Text>
                    )}
                </Pressable>
            </ScrollView>
        </View>
    );
};

export default function StatsScreen() {
    const { width } = useWindowDimensions();
    const isDesktop = width >= 768;

    if (isDesktop && Platform.OS === 'web') {
        return <WebStatsScreen />;
    }

    return <MobileStatsScreen />;
}
