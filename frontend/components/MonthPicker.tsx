import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguageStore } from '../store/useLanguageStore';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface MonthPickerProps {
    visible: boolean;
    selectedDate: string; // YYYY-MM-DD
    onSelectDate: (date: string) => void;
    onClose: () => void;
    taskDates: string[];
}

export function MonthPicker({ visible, selectedDate, onSelectDate, onClose, taskDates }: MonthPickerProps) {
    const { t } = useLanguageStore();
    const touchStartX = React.useRef(0); // For swipe handling

    // Internal state for browsing months without changing selection immediately if desired, 
    // or just sync with parent. Let's start with browsing state initialized to selectedDate
    const [browseDate, setBrowseDate] = useState(() => new Date(selectedDate + 'T00:00:00'));

    // Reset browse date when modal opens to current selected date
    React.useEffect(() => {
        if (visible) {
            setBrowseDate(new Date(selectedDate + 'T00:00:00'));
        }
    }, [visible, selectedDate]);

    const year = browseDate.getFullYear();
    const month = browseDate.getMonth();

    const monthLabel = useMemo(() => {
        const { language } = useLanguageStore.getState();
        if (language === 'zh-CN') {
            return `${year}年 ${month + 1}月`;
        }
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return `${months[month]} ${year}`;
    }, [month, year]);

    const weekLabels = useMemo(() => {
        const { language } = useLanguageStore.getState();
        if (language === 'zh-CN') {
            return ['日', '一', '二', '三', '四', '五', '六'];
        }
        return ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    }, []);

    const days = useMemo(() => {
        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDayOfWeek = firstDayOfMonth.getDay(); // 0-6

        const result = [];
        // Add empty placeholders for start padding
        for (let i = 0; i < startDayOfWeek; i++) {
            result.push(null);
        }
        // Add actual days
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(year, month, i);
            const yearStr = date.getFullYear();
            const monthStr = String(date.getMonth() + 1).padStart(2, '0');
            const dayStr = String(date.getDate()).padStart(2, '0');
            const dateStr = `${yearStr}-${monthStr}-${dayStr}`;
            result.push({
                day: i,
                dateString: dateStr,
                isSelected: dateStr === selectedDate,
                hasTask: taskDates.includes(dateStr)
            });
        }
        return result;
    }, [year, month, selectedDate, taskDates]);

    const changeMonth = (delta: number) => {
        // Simple animation
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const newDate = new Date(browseDate);
        newDate.setMonth(newDate.getMonth() + delta);
        setBrowseDate(newDate);
    };

    const handleJumpToToday = () => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        onSelectDate(todayStr);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    style={styles.card}
                    onPress={(e) => e.stopPropagation()}
                >
                    <View
                        onTouchStart={(e) => {
                            // Record start X
                            touchStartX.current = e.nativeEvent.pageX;
                        }}
                        onTouchEnd={(e) => {
                            const touchEndX = e.nativeEvent.pageX;
                            const startX = touchStartX.current;
                            if (startX - touchEndX > 50) {
                                changeMonth(1); // Swipe Left -> Next Month
                            } else if (touchEndX - startX > 50) {
                                changeMonth(-1); // Swipe Right -> Prev Month
                            }
                        }}
                    >
                        {/* Header */}
                        <View style={styles.header}>
                            <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navButton}>
                                <Ionicons name="chevron-back" size={20} color="#856b66" />
                            </TouchableOpacity>
                            <Text style={styles.monthTitle}>{monthLabel}</Text>
                            <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navButton}>
                                <Ionicons name="chevron-forward" size={20} color="#856b66" />
                            </TouchableOpacity>
                        </View>

                        {/* Weekday Headers */}
                        <View style={styles.weekRow}>
                            {weekLabels.map((d, i) => (
                                <Text key={i} style={styles.weekText}>{d}</Text>
                            ))}
                        </View>

                        {/* Days Grid */}
                        <View style={styles.grid}>
                            {days.map((item, index) => {
                                if (!item) {
                                    return <View key={`empty-${index}`} style={styles.dayCell} />;
                                }
                                return (
                                    <TouchableOpacity
                                        key={item.dateString}
                                        style={[
                                            styles.dayCell,
                                            item.isSelected && styles.selectedDayCell
                                        ]}
                                        onPress={() => {
                                            onSelectDate(item.dateString);
                                            onClose();
                                        }}
                                    >
                                        <Text style={[
                                            styles.dayText,
                                            item.isSelected && styles.selectedDayText
                                        ]}>{item.day}</Text>

                                        {/* Task Dot */}
                                        {item.hasTask && (
                                            <View style={[
                                                styles.dot,
                                                item.isSelected ? styles.selectedDot : styles.normalDot
                                            ]} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Footer */}
                        <View style={styles.footer}>
                            <TouchableOpacity
                                style={styles.jumpButton}
                                onPress={handleJumpToToday}
                            >
                                <Text style={styles.jumpText}>
                                    {t('calendar.picker.jumpToToday')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(32, 21, 18, 0.6)', // dark overlay
        alignItems: 'center',
        justifyContent: 'center',
    },
    card: {
        width: '85%',
        maxWidth: 340,
        backgroundColor: '#FDFBF7',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    navButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.03)',
    },
    monthTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#171312',
    },
    weekRow: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    weekText: {
        flex: 1,
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '700',
        color: '#856b66',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 24,
    },
    dayCell: {
        width: '14.28%', // 100% / 7
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
        borderRadius: 20,
    },
    selectedDayCell: {
        backgroundColor: '#d24d32',
        shadowColor: '#d24d32',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
        transform: [{ scale: 1.1 }],
    },
    dayText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#171312',
    },
    selectedDayText: {
        color: 'white',
        fontWeight: 'bold',
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 4,
        position: 'absolute',
        bottom: 6,
    },
    normalDot: {
        backgroundColor: '#d24d32',
    },
    selectedDot: {
        backgroundColor: 'white',
        opacity: 0.8,
    },
    footer: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
        paddingTop: 16,
        alignItems: 'center',
    },
    jumpButton: {
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 20,
        backgroundColor: 'rgba(210, 77, 50, 0.1)',
    },
    jumpText: {
        color: '#d24d32',
        fontSize: 14,
        fontWeight: '700',
    },
});
