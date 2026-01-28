import React, { useRef, useEffect, useState } from 'react';
import { View, Text, ScrollView, NativeSyntheticEvent, NativeScrollEvent, StyleSheet } from 'react-native';

interface DateTimeWheelPickerProps {
    value: string; // "YYYY-MM-DD" or "HH:MM" or "YYYY-MM-DD HH:MM"
    mode?: 'datetime' | 'date' | 'time';
    onChange: (value: string) => void;
}

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const OFFSET = ITEM_HEIGHT * 2;

export function DateTimeWheelPicker({ value, mode = 'datetime', onChange }: DateTimeWheelPickerProps) {
    // Parse value based on mode logic
    const [datePart, timePart] = value.includes(' ') ? value.split(' ') : (mode === 'time' ? ['', value] : [value, '']);

    // Defaults
    const defaultDate = new Date().toISOString().split('T')[0];
    const defaultTime = '09:00';

    const [yStr, mStr, dStr] = (datePart || defaultDate).split('-');
    const [hStr, minStr] = (timePart || defaultTime).split(':');

    const [year, setYear] = useState(parseInt(yStr, 10));
    const [month, setMonth] = useState(parseInt(mStr, 10));
    const [day, setDay] = useState(parseInt(dStr, 10));
    const [hour, setHour] = useState(parseInt(hStr, 10));
    const [minute, setMinute] = useState(parseInt(minStr, 10));

    const yearRef = useRef<ScrollView>(null);
    const monthRef = useRef<ScrollView>(null);
    const dayRef = useRef<ScrollView>(null);
    const hourRef = useRef<ScrollView>(null);
    const minuteRef = useRef<ScrollView>(null);

    // Generate data
    const years = Array.from({ length: 15 }, (_, i) => 2020 + i); // 2020-2034
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const getDaysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
    const days = Array.from({ length: getDaysInMonth(year, month) }, (_, i) => i + 1);
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = Array.from({ length: 60 }, (_, i) => i);

    useEffect(() => {
        // Initial scroll
        setTimeout(() => {
            if (mode !== 'time') {
                yearRef?.current?.scrollTo({ y: (year - 2020) * ITEM_HEIGHT, animated: false });
                monthRef?.current?.scrollTo({ y: (month - 1) * ITEM_HEIGHT, animated: false });
                dayRef?.current?.scrollTo({ y: (day - 1) * ITEM_HEIGHT, animated: false });
            }
            if (mode !== 'date') {
                hourRef?.current?.scrollTo({ y: hour * ITEM_HEIGHT, animated: false });
                minuteRef?.current?.scrollTo({ y: minute * ITEM_HEIGHT, animated: false });
            }
        }, 50);
    }, []);

    // Update days when month/year changes
    useEffect(() => {
        const maxDays = getDaysInMonth(year, month);
        if (day > maxDays) setDay(maxDays);
    }, [year, month]);

    useEffect(() => {
        // Notify change
        const d = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const t = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

        if (mode === 'date') onChange(d);
        else if (mode === 'time') onChange(t);
        else onChange(`${d} ${t}`);
    }, [year, month, day, hour, minute]);

    const createScrollHandler = (
        data: number[],
        setter: (val: number) => void
    ) => {
        return (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const y = event.nativeEvent.contentOffset.y;
            const index = Math.round(y / ITEM_HEIGHT);
            const safeIndex = Math.max(0, Math.min(index, data.length - 1));
            const newValue = data[safeIndex];
            if (newValue !== undefined) {
                setter(newValue);
            }
        };
    };

    const renderWheel = (
        data: number[],
        selected: number,
        scrollRef: React.RefObject<ScrollView | null>,
        onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void,
        width: number = 60
    ) => {
        return (
            <View style={[styles.wheelContainer, { width }]}>
                <ScrollView
                    ref={scrollRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={onScroll}
                    onScrollEndDrag={onScroll}
                    scrollEventThrottle={16}
                    contentContainerStyle={{ paddingVertical: OFFSET }}
                >
                    {data.map((value) => {
                        const isSelected = value === selected;
                        return (
                            <View key={value} style={styles.item}>
                                <Text style={[styles.itemText, isSelected && styles.selectedText]}>
                                    {String(value).padStart(2, '0')}
                                </Text>
                            </View>
                        );
                    })}
                </ScrollView>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.pickersRow}>
                {mode !== 'time' && (
                    <>
                        {renderWheel(years, year, yearRef, createScrollHandler(years, setYear), 80)}
                        <Text style={styles.separator}>-</Text>
                        {renderWheel(months, month, monthRef, createScrollHandler(months, setMonth), 50)}
                        <Text style={styles.separator}>-</Text>
                        {renderWheel(days, day, dayRef, createScrollHandler(days, setDay), 50)}
                    </>
                )}

                {mode === 'datetime' && <Text style={styles.separator}>  </Text>}

                {mode !== 'date' && (
                    <>
                        {renderWheel(hours, hour, hourRef, createScrollHandler(hours, setHour), 60)}
                        <Text style={styles.separator}>:</Text>
                        {renderWheel(minutes, minute, minuteRef, createScrollHandler(minutes, setMinute), 60)}
                    </>
                )}
            </View>

            {/* Selection indicator */}
            <View style={styles.selectionIndicator} pointerEvents="none">
                <View style={styles.selectionBorder} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: '#FDFBF7',
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
    },
    pickersRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: CONTAINER_HEIGHT,
    },
    wheelContainer: {
        height: CONTAINER_HEIGHT,
        // width handled by prop
    },
    item: {
        height: ITEM_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemText: {
        fontSize: 18,
        color: '#A8A09B',
        fontWeight: '500',
    },
    selectedText: {
        fontSize: 22,
        color: '#171312',
        fontWeight: '700',
    },
    separator: {
        fontSize: 20,
        fontWeight: '600',
        color: '#171312',
        marginHorizontal: 4,
    },
    selectionIndicator: {
        position: 'absolute',
        top: OFFSET,
        left: 0,
        right: 0,
        height: ITEM_HEIGHT,
        justifyContent: 'center',
    },
    selectionBorder: {
        height: ITEM_HEIGHT,
        borderTopWidth: 2,
        borderBottomWidth: 2,
        borderColor: '#d24d32',
        opacity: 0.25,
    },
});
