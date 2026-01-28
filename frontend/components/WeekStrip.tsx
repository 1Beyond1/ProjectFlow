/**
 * 周视图日期选择器组件
 * 显示一周的日期，支持选择和滑动
 */
import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useLanguageStore } from '../store/useLanguageStore';

interface WeekStripProps {
    selectedDate: string; // YYYY-MM-DD
    onDateSelect: (date: string) => void;
    taskDates: string[]; // 有任务的日期列表
    onHeaderClick?: () => void;
}

export function WeekStrip({ selectedDate, onDateSelect, taskDates, onHeaderClick }: WeekStripProps) {
    const { t, language } = useLanguageStore();

    // Generate days for the entire selected month
    const daysInMonth = useMemo(() => {
        const selected = new Date(selectedDate + 'T00:00:00');
        const year = selected.getFullYear();
        const month = selected.getMonth();

        // Get number of days in the month
        const lastDay = new Date(year, month + 1, 0).getDate();

        const days = [];
        for (let i = 1; i <= lastDay; i++) {
            const date = new Date(year, month, i);
            // Format as YYYY-MM-DD manually to avoid timezone issues with toISOString
            const yearStr = date.getFullYear();
            const monthStr = String(date.getMonth() + 1).padStart(2, '0');
            const dayStr = String(date.getDate()).padStart(2, '0');
            const dateStr = `${yearStr}-${monthStr}-${dayStr}`;

            days.push({
                date: dateStr,
                dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
                dayNumber: i,
                hasTask: taskDates.includes(dateStr),
                isSelected: dateStr === selectedDate,
            });
        }
        return days;
    }, [selectedDate, taskDates]);

    // 当前月份显示
    const monthDisplay = useMemo(() => {
        const date = new Date(selectedDate + 'T00:00:00');
        // Use localized month format
        if (language === 'zh-CN') {
            return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
        }

        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }, [selectedDate, language]);

    const scrollViewRef = useRef<ScrollView>(null);

    // Auto-scroll to selected date on mount or change
    useEffect(() => {
        if (scrollViewRef.current && daysInMonth.length > 0) {
            const selectedIndex = daysInMonth.findIndex(d => d.isSelected);
            if (selectedIndex !== -1) {
                // Approximate width of item + gap (56 + 8 = 64)
                // Center it: index * 64 - (screenWidth / 2) + (itemWidth / 2)
                // Simplified: just ensure it's visible. 
                // Let's try centering. Assuming screen width ~350-400.
                const ITEM_WIDTH = 64;
                const offset = Math.max(0, selectedIndex * ITEM_WIDTH - 150); // 150 is approx half screen width

                // Add a small delay to ensure layout is ready
                setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ x: offset, animated: true });
                }, 100);
            }
        }
    }, [selectedDate, daysInMonth]);

    return (
        <View style={styles.container}>
            {/* Month Header - Clickable to trigger Month Picker */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onHeaderClick} activeOpacity={0.7}>
                    <Text style={styles.monthText}>
                        {monthDisplay}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Days Strip */}
            <ScrollView
                ref={scrollViewRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                decelerationRate="fast"
                snapToInterval={64} // Snap to item width + gap
            >
                {daysInMonth.map((day) => (
                    <TouchableOpacity
                        key={day.date}
                        onPress={() => onDateSelect(day.date)}
                        activeOpacity={1}
                        style={[
                            styles.dayItem,
                            day.isSelected && styles.selectedDayItem
                        ]}
                    >
                        <Text style={[
                            styles.dayName,
                            day.isSelected ? styles.selectedText : styles.normalDayName
                        ]}>
                            {day.dayName}
                        </Text>
                        <Text style={[
                            styles.dayNumber,
                            day.isSelected ? styles.selectedText : styles.normalDayNumber
                        ]}>
                            {day.dayNumber}
                        </Text>

                        {/* Dot indicator */}
                        {day.hasTask && (
                            <View style={[
                                styles.dot,
                                day.isSelected ? styles.selectedDot : styles.normalDot
                            ]} />
                        )}
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Shadow for depth - simple border line instead of gradient for now to be safe */}
            <View style={styles.separator} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingBottom: 8,
        backgroundColor: '#FDFBF7', // default light
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingHorizontal: 8,
    },
    monthText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#171312',
    },
    scrollContent: {
        gap: 8,
        paddingBottom: 8,
    },
    dayItem: {
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 56,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: 'transparent',
    },
    selectedDayItem: {
        backgroundColor: '#d24d32',
        // transform: [{ scale: 1.05 }], // Removed to prevent obscuring
        shadowColor: '#d24d32',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    dayName: {
        fontSize: 12,
        fontWeight: '500',
        marginBottom: 4,
    },
    normalDayName: {
        color: '#856b66',
    },
    dayNumber: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    normalDayNumber: {
        color: '#171312',
    },
    selectedText: {
        color: 'white',
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 4,
    },
    selectedDot: {
        backgroundColor: 'white',
    },
    normalDot: {
        backgroundColor: '#d24d32',
    },
    separator: {
        height: 1,
        backgroundColor: 'transparent', // minimal separator
    }
});
