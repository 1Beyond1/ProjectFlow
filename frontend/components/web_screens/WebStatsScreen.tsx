import React from 'react';
import { View, Text, ScrollView, Dimensions, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Sidebar } from '../../components/web/Sidebar';
import { useStatsData } from '../../hooks/useStatsData';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { useDialogStore } from '../../store/useDialogStore';
import Svg, { Circle } from 'react-native-svg';
import { useLanguageStore } from '../../store/useLanguageStore';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Chart Config
const chartConfig = {
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    color: (opacity = 1) => `rgba(228, 85, 37, ${opacity})`, // Primary color
    strokeWidth: 2,
    barPercentage: 0.5,
    useShadowColorFromDataset: false,
    labelColor: (opacity = 1) => `rgba(136, 108, 99, ${opacity})`, // text-sub
};

export default function WebStatsScreen() {
    const { data, loading } = useStatsData();
    const { showDialog } = useDialogStore();
    const { t } = useLanguageStore();

    if (loading || !data) {
        return (
            <View className="flex-1 bg-background flex-row" style={{ backgroundColor: Colors.background }}>
                <Sidebar />
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            </View>
        );
    }

    const cardData = [
        { label: t('web.stats.card.flowScore.title'), value: data.flowScore, sub: '/100', trend: '+5%', desc: t('web.stats.card.flowScore.desc'), color: '#07880b' },
        { label: t('web.stats.card.totalFocus.title'), value: data.totalFocus, sub: '', trend: '+12%', desc: t('web.stats.card.totalFocus.desc'), color: '#07880b' }, // Value string needs splitting in UI?
        { label: t('web.stats.card.completionRate.title'), value: `${data.completionRate}%`, sub: '', trend: '-3%', desc: t('web.stats.card.completionRate.desc'), color: Colors.primary },
        { label: t('web.stats.card.aiStreak.title'), value: data.aiStreak, sub: t('web.stats.card.aiStreak.sub'), icon: 'flame', desc: t('web.stats.card.aiStreak.desc'), color: Colors.primary },
    ];

    const weeklyData = {
        labels: [t('home.date.weekday.mon'), t('home.date.weekday.tue'), t('home.date.weekday.wed'), t('home.date.weekday.thu'), t('home.date.weekday.fri'), t('home.date.weekday.sat'), t('home.date.weekday.sun')],
        datasets: [
            {
                data: data.weeklyTrend,
                color: (opacity = 1) => `rgba(228, 85, 37, ${opacity})`,
                strokeWidth: 2
            }
        ],
        legend: [t('web.stats.deepWorkLegend')]
    };

    const pieData = [
        { name: t('web.stats.pie.deepWork'), population: data.focusDistribution.deepWork, color: Colors.primary, legendFontColor: "#7F7F7F", legendFontSize: 12 },
        { name: t('web.stats.pie.collaborative'), population: data.focusDistribution.collaborative, color: '#8da18d', legendFontColor: "#7F7F7F", legendFontSize: 12 },
        { name: t('web.stats.pie.adminOps'), population: data.focusDistribution.admin, color: '#d4a373', legendFontColor: "#7F7F7F", legendFontSize: 12 },
    ];

    const handleCardClick = (item: any) => {
        showDialog({
            title: item.label,
            message: `${t('web.stats.dialog.currentValuePrefix')}${item.value}\n${t('web.stats.dialog.trendPrefix')}${item.trend}\n\n${item.desc}`,
            actions: [{ label: t('common.confirm'), variant: 'primary' }]
        });
    };

    return (
        <View className="bg-background-light h-screen w-full flex-row overflow-hidden" style={{ backgroundColor: Colors.background, flex: 1, width: '100%' }}>
            <Sidebar />

            <ScrollView className="flex-1 p-8" contentContainerStyle={{ paddingBottom: 50 }}>
                {/* Header */}
                <View className="flex-row justify-between items-center mb-8">
                    <Text className="text-3xl font-bold tracking-tight" style={{ color: Colors.textMain }}>{t('nav.analytics')}</Text>
                    <Pressable className="bg-white px-4 py-2.5 rounded-xl border flex-row items-center gap-3 shadow-sm hover:border-primary/50 transition-colors" style={{ borderColor: '#e5dedc' }}>
                        <Ionicons name="calendar-outline" size={20} color={Colors.textSubtle} />
                        <Text className="text-sm font-semibold" style={{ color: Colors.textSubtle }}>{t('web.stats.dateRangeSample')}</Text>
                        <Ionicons name="chevron-down" size={18} color={Colors.textSubtle} />
                    </Pressable>
                </View>

                {/* Cards Grid */}
                <View className="flex-row flex-wrap gap-6 mb-8" style={{ gap: 24 }}>
                    {cardData.map((item, index) => (
                        <Pressable
                            key={index}
                            onPress={() => handleCardClick(item)}
                            className="bg-white p-6 rounded-3xl border shadow-sm flex-col justify-between h-40 flex-1 min-w-[200px] hover:border-primary/30 transition-colors"
                            style={{ backgroundColor: Colors.surface, borderColor: '#e5dedc' }}
                        >
                            <View className="flex-row justify-between items-start">
                                <Text className="text-sm font-bold uppercase tracking-wider" style={{ color: Colors.textSubtle }}>{item.label}</Text>
                                {item.icon ? (
                                    <View className="px-2 py-1 rounded-lg flex-row items-center gap-1" style={{ backgroundColor: Colors.primary + '1A' }}>
                                        <Ionicons name={item.icon as any} size={14} color={Colors.primary} />
                                    </View>
                                ) : (
                                    <View className="px-2 py-1 rounded-lg" style={{ backgroundColor: item.color + '1A' }}>
                                        <Text className="text-xs font-bold" style={{ color: item.color }}>{item.trend}</Text>
                                    </View>
                                )}
                            </View>
                            <View>
                                <View className="flex-row items-baseline gap-2">
                                    <Text className="text-4xl font-bold" style={{ color: Colors.textMain }}>{item.value}</Text>
                                    {item.sub ? <Text className="text-lg font-medium" style={{ color: Colors.textSubtle }}>{item.sub}</Text> : null}
                                </View>
                                <Text className="text-xs mt-2" style={{ color: Colors.textSubtle }}>{item.desc}</Text>
                            </View>
                        </Pressable>
                    ))}
                </View>

                {/* Charts Area */}
                <View className="flex-row flex-wrap gap-6 mb-8" style={{ gap: 24 }}>
                    {/* Weekly Trend */}
                    <View className="flex-2 bg-white p-8 rounded-3xl border shadow-sm flex-col min-w-[500px] flex-grow" style={{ flex: 2, backgroundColor: Colors.surface, borderColor: '#e5dedc' }}>
                        <View className="mb-6">
                            <Text className="text-xl font-bold" style={{ color: Colors.textMain }}>{t('web.stats.weeklyFlowTrend')}</Text>
                            <Text className="text-sm mt-1" style={{ color: Colors.textSubtle }}>{t('web.stats.weeklyFlowTrendSubtitle')}</Text>
                        </View>
                        <LineChart
                            data={weeklyData}
                            width={Platform.OS === 'web' ? 600 : SCREEN_WIDTH - 60} // Adjust width logic for responsive
                            height={220}
                            chartConfig={chartConfig}
                            bezier
                            style={{ borderRadius: 16 }}
                            withDots={true}
                            withInnerLines={true}
                            withOuterLines={false}
                            withVerticalLines={false}
                        />
                    </View>

                    {/* Focus Distribution */}
                    <View className="flex-1 bg-white p-8 rounded-3xl border shadow-sm flex-col min-w-[300px]" style={{ flex: 1, backgroundColor: Colors.surface, borderColor: '#e5dedc' }}>
                        <View className="flex-row justify-between items-center mb-6">
                            <View>
                                <Text className="text-xl font-bold" style={{ color: Colors.textMain }}>{t('web.stats.focusDist')}</Text>
                                <Text className="text-sm mt-1" style={{ color: Colors.textSubtle }}>{t('web.stats.focusDistSubtitle')}</Text>
                            </View>
                        </View>
                        <PieChart
                            data={pieData}
                            width={300}
                            height={200}
                            chartConfig={chartConfig}
                            accessor={"population"}
                            backgroundColor={"transparent"}
                            paddingLeft={"15"}
                            center={[10, 0]}
                            absolute
                        />
                    </View>
                </View>

                {/* AI Insight Card */}
                <View className="bg-[#f3ece7] p-8 rounded-3xl border relative overflow-hidden flex-row items-start justify-between shadow-sm" style={{ backgroundColor: '#f3ece7', borderColor: '#e5dedc' }}>
                    <View className="relative z-10 flex-row gap-8 items-start w-full">
                        <View className="bg-white/80 p-4 rounded-2xl size-16 items-center justify-center shrink-0 shadow-sm border border-white/50">
                            <Ionicons name="sparkles" size={24} color={Colors.primary} />
                        </View>
                        <View className="flex-1">
                            <View className="flex-row items-center justify-between mb-4">
                                <View>
                                    <Text className="text-lg font-bold" style={{ color: Colors.textMain }}>{t('web.stats.aiReport.title')}</Text>
                                    <Text className="text-xs font-medium mt-1" style={{ color: Colors.textSubtle }}>{t('web.stats.aiReport.subtitle')}</Text>
                                </View>
                                <Pressable className="flex-row items-center gap-1">
                                    <Text className="text-sm font-bold hover:underline" style={{ color: Colors.primary }}>{t('web.stats.aiReport.viewFull')}</Text>
                                    <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
                                </Pressable>
                            </View>
                            <View className="bg-white/60 rounded-2xl p-6 border border-white/40">
                                <Text className="text-xl font-bold mb-3" style={{ color: Colors.textMain }}>
                                    {data.aiReport.summary}
                                </Text>
                                <Text className="text-base leading-relaxed" style={{ color: '#5d4d49' }}>
                                    {data.aiReport.details}
                                </Text>
                                <View className="mt-4 flex-row gap-3">
                                    <Pressable className="bg-primary px-4 py-2 rounded-lg shadow-sm hover:opacity-90">
                                        <Text className="text-xs font-bold text-white">{t('web.stats.aiReport.confirm')}</Text>
                                    </Pressable>
                                    <Pressable className="bg-white border px-4 py-2 rounded-lg hover:bg-gray-50" style={{ borderColor: '#e5dedc' }}>
                                        <Text className="text-xs font-bold" style={{ color: '#5d4d49' }}>{t('web.stats.aiReport.dismiss')}</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

            </ScrollView>
        </View>
    );
}
