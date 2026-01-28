/**
 * 日历页面 - 时间轴视图
 * 显示所有日期的任务，支持日期切换
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, FlatList, Pressable, LayoutAnimation, Platform, UIManager, Dimensions, useWindowDimensions } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WeekStrip } from '../../components/WeekStrip';
import { CalendarSearch } from '../../components/CalendarSearch';
import { MonthPicker } from '../../components/MonthPicker';
import { VoiceInputBar } from '../../components/VoiceInputBar';
import { useTaskStore } from '../../store/useTaskStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import { DayTaskView } from '../../components/DayTaskView';
import WebCalendarScreen from '../../components/web_screens/WebCalendarScreen';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Reduce re-renders for renderItem
const RenderDayItem = React.memo(({ item, getTasksByDate, insets, onToggleTask }: any) => {
    const tasks = getTasksByDate(item);
    return (
        <View style={{ width: SCREEN_WIDTH }}>
            <DayTaskView
                date={item}
                tasks={tasks}
                insets={insets}
                onToggleTask={onToggleTask}
            />
        </View>
    );
}, (prev, next) => {
    return prev.item === next.item && prev.insets === next.insets;
});

const MobileCalendarScreen = () => {
    const insets = useSafeAreaInsets();
    const { getTasksByDate, getAllTaskDates, toggleTask } = useTaskStore();
    const { t } = useLanguageStore();

    // UI State
    const [searchVisible, setSearchVisible] = useState(false);
    const [pickerVisible, setPickerVisible] = useState(false);

    // 选中的日期，默认今天
    const [selectedDate, setSelectedDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0]; // YYYY-MM-DD
    });

    // Generate date range (±365 days)
    const dateList = useMemo(() => {
        const list = [];
        const base = new Date();
        const start = new Date(base);
        start.setDate(start.getDate() - 365); // 1 year back

        for (let i = 0; i < 730; i++) { // 2 years total
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            list.push(d.toISOString().split('T')[0]);
        }
        return list;
    }, []);

    // Find initial index
    const initialIndex = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const idx = dateList.findIndex(d => d === today);
        return idx >= 0 ? idx : 0;
    }, [dateList]);

    const flatListRef = useRef<FlatList>(null);

    // 所有有任务的日期
    const taskDates = useMemo(() => {
        return getAllTaskDates();
    }, [getAllTaskDates]);

    const handleDateSelect = (date: string, skipAnimation = false) => {
        if (!skipAnimation) {
            // For click-driven updates (WeekStrip/MonthPicker), scroll FlatList
            const index = dateList.findIndex(d => d === date);
            if (index !== -1) {
                // Use animated: false to prevent twitching/conflicts with onScroll
                flatListRef.current?.scrollToIndex({ index, animated: false });
            }
        }
        setSelectedDate(date);
    };

    const handleScroll = (e: any) => {
        const x = e.nativeEvent.contentOffset.x;
        const index = Math.round(x / SCREEN_WIDTH);
        if (index >= 0 && index < dateList.length) {
            const newDate = dateList[index];
            if (newDate !== selectedDate) {
                // Update selectedDate immediately when crossing the midpoint
                handleDateSelect(newDate, true);
            }
        }
    };

    const getItemLayout = (_: any, index: number) => ({
        length: SCREEN_WIDTH,
        offset: SCREEN_WIDTH * index,
        index,
    });

    const renderItem = ({ item }: { item: string }) => {
        // We pass tasks here to ensure updates propagate
        return (
            <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
                <DayTaskView
                    date={item}
                    tasks={getTasksByDate(item)}
                    insets={insets}
                    onToggleTask={toggleTask}
                />
            </View>
        );
    };

    return (
        <View className="flex-1 bg-[#FDFBF7] dark:bg-[#201512]">
            {/* Top App Bar */}
            <View
                className="flex-row items-center px-6 justify-between bg-[#FDFBF7] dark:bg-[#201512]"
                style={{ paddingTop: insets.top + 32, paddingBottom: 16 }}
            >
                <Pressable onPress={() => setPickerVisible(true)}>
                    <Text className="text-[#171312] dark:text-white text-3xl font-bold leading-tight tracking-tight">
                        {t('calendar.title')}
                    </Text>
                </Pressable>

                <View className="flex-row items-center justify-end gap-3">
                    <Pressable
                        onPress={() => {
                            const today = new Date().toISOString().split('T')[0];
                            handleDateSelect(today);
                        }}
                        className="px-3 py-1.5 rounded-full bg-[#171312] dark:bg-white active:opacity-80"
                    >
                        <Text className="text-xs font-bold text-white dark:text-[#171312]">{t('calendar.today')}</Text>
                    </Pressable>
                    <Pressable
                        onPress={() => setSearchVisible(true)}
                        className="flex items-center justify-center rounded-full w-10 h-10 bg-transparent active:bg-black/5"
                    >
                        <Ionicons name="search-outline" size={24} color="#171312" />
                    </Pressable>
                </View>
            </View>

            {/* Week Strip */}
            <WeekStrip
                selectedDate={selectedDate}
                onDateSelect={(d) => handleDateSelect(d, false)}
                taskDates={taskDates}
                onHeaderClick={() => setPickerVisible(true)}
            />

            {/* Horizontal Timeline FlatList */}
            <FlatList
                ref={flatListRef}
                data={dateList}
                renderItem={renderItem}
                keyExtractor={(item) => item}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={initialIndex}
                getItemLayout={getItemLayout}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                initialNumToRender={3}
                maxToRenderPerBatch={3}
                windowSize={5}
                className="flex-1"
            />

            {/* Modals */}
            <CalendarSearch
                visible={searchVisible}
                onClose={() => setSearchVisible(false)}
                onSelectDate={(date) => {
                    handleDateSelect(date);
                    setSearchVisible(false);
                }}
            />

            <MonthPicker
                visible={pickerVisible}
                selectedDate={selectedDate}
                onSelectDate={handleDateSelect}
                onClose={() => setPickerVisible(false)}
                taskDates={taskDates}
            />

            {/* Voice Input Bar */}
            <VoiceInputBar />
        </View>
    );
};

export default function CalendarScreen() {
    const { width } = useWindowDimensions();
    const isDesktop = width >= 768; // Tailwind md/lg breakpoint typical usage

    if (isDesktop && Platform.OS === 'web') {
        return <WebCalendarScreen />;
    }

    return <MobileCalendarScreen />;
}
