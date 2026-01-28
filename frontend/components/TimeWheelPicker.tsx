import React, { useRef, useEffect } from 'react';
import { View, Text, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent, StyleSheet } from 'react-native';

interface TimeWheelPickerProps {
    value: string; // HH:MM format
    onChange: (time: string) => void;
}

const ITEM_HEIGHT = 50;
const CONTAINER_HEIGHT = ITEM_HEIGHT * 5;
const OFFSET = ITEM_HEIGHT * 2; // For centering

export function TimeWheelPicker({ value, onChange }: TimeWheelPickerProps) {
    const [hour, minute] = value.split(':').map(v => parseInt(v, 10) || 0);

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = Array.from({ length: 60 }, (_, i) => i);

    const hourScrollRef = useRef<ScrollView>(null);
    const minuteScrollRef = useRef<ScrollView>(null);

    const currentHour = useRef(hour);
    const currentMinute = useRef(minute);

    useEffect(() => {
        // Initial scroll position
        setTimeout(() => {
            hourScrollRef.current?.scrollTo({ y: hour * ITEM_HEIGHT, animated: false });
            minuteScrollRef.current?.scrollTo({ y: minute * ITEM_HEIGHT, animated: false });
        }, 100);
    }, []);

    const handleHourScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = event.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);
        const newHour = Math.max(0, Math.min(index, 23));

        if (currentHour.current !== newHour) {
            currentHour.current = newHour;
            onChange(`${String(newHour).padStart(2, '0')}:${String(currentMinute.current).padStart(2, '0')}`);
        }
    };

    const handleMinuteScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = event.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);
        const newMinute = Math.max(0, Math.min(index, 59));

        if (currentMinute.current !== newMinute) {
            currentMinute.current = newMinute;
            onChange(`${String(currentHour.current).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`);
        }
    };

    const renderWheel = (
        data: number[],
        selected: number,
        scrollRef: React.RefObject<ScrollView | null>,
        onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
    ) => {
        return (
            <View style={styles.wheelContainer}>
                <ScrollView
                    ref={scrollRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={onScroll}
                    scrollEventThrottle={16}
                    contentContainerStyle={{
                        paddingVertical: OFFSET,
                    }}
                >
                    {data.map((value) => {
                        const isSelected = value === selected;
                        return (
                            <View key={value} style={styles.item}>
                                <Text style={[
                                    styles.itemText,
                                    isSelected && styles.selectedText
                                ]}>
                                    {String(value).padStart(2, '0')}
                                </Text>
                            </View>
                        );
                    })}
                </ScrollView>

                {/* Selection indicator overlay */}
                <View style={styles.selectionIndicator} pointerEvents="none">
                    <View style={styles.selectionBorder} />
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.pickersRow}>
                {renderWheel(hours, hour, hourScrollRef, handleHourScroll)}
                <Text style={styles.separator}>:</Text>
                {renderWheel(minutes, minute, minuteScrollRef, handleMinuteScroll)}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: '#FDFBF7',
        borderRadius: 20,
        overflow: 'hidden',
    },
    pickersRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: CONTAINER_HEIGHT,
    },
    wheelContainer: {
        height: CONTAINER_HEIGHT,
        width: 80,
        position: 'relative',
    },
    item: {
        height: ITEM_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemText: {
        fontSize: 22,
        color: '#A8A09B',
        fontWeight: '500',
    },
    selectedText: {
        fontSize: 28,
        color: '#171312',
        fontWeight: '700',
    },
    separator: {
        fontSize: 28,
        fontWeight: '700',
        color: '#171312',
        marginHorizontal: 8,
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
        opacity: 0.3,
    },
});
