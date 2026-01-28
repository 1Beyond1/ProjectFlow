import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguageStore } from '../store/useLanguageStore';
import { useTaskStore } from '../store/useTaskStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CalendarSearchProps {
    visible: boolean;
    onClose: () => void;
    onSelectDate: (date: string) => void;
}

export function CalendarSearch({ visible, onClose, onSelectDate }: CalendarSearchProps) {
    const insets = useSafeAreaInsets();
    const { t } = useLanguageStore();
    const { todayTasks } = useTaskStore();
    const [query, setQuery] = useState('');
    const [recentSearches, setRecentSearches] = useState(['Yoga schedule', 'Design review notes']);
    const [filteredTasks, setFilteredTasks] = useState<typeof todayTasks>([]);

    useEffect(() => {
        if (!query.trim()) {
            setFilteredTasks([]);
            return;
        }

        const lowerQuery = query.toLowerCase();
        const results = todayTasks.filter(task =>
            task.title.toLowerCase().includes(lowerQuery) ||
            (task.location && task.location.toLowerCase().includes(lowerQuery)) ||
            (task.suggestion && task.suggestion.toLowerCase().includes(lowerQuery))
        );
        setFilteredTasks(results);
    }, [query, todayTasks]);

    const handleSearch = (text: string) => {
        setQuery(text);
    };

    const clearRecent = () => {
        setRecentSearches([]);
    };

    const handleResultPress = (task: typeof todayTasks[0]) => {
        if (task.timestamp) {
            const date = task.timestamp.split(' ')[0];
            onSelectDate(date);
            onClose();
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={[styles.container, { paddingTop: insets.top }]}>
                {/* Search Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                        <Ionicons name="arrow-back" size={24} color="#856b66" />
                    </TouchableOpacity>

                    <View style={styles.searchBarContainer}>
                        <Ionicons name="search" size={20} color="#856b66" style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder={t('calendar.search.placeholder')}
                            placeholderTextColor="#856b66"
                            value={query}
                            onChangeText={handleSearch}
                            autoFocus
                            returnKeyType="search"
                            onSubmitEditing={() => {
                                // Add to recent searches if not empty
                                if (query.trim()) {
                                    setRecentSearches(prev => [query, ...prev].slice(0, 5));
                                }
                            }}
                        />
                        {query.length > 0 && (
                            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearIcon}>
                                <Ionicons name="close-circle" size={18} color="#d24d32" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

                    {/* Search Results */}
                    {query.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>
                                {filteredTasks.length > 0 ? `${filteredTasks.length} Results` : 'No Results'}
                            </Text>
                            {filteredTasks.map((task) => (
                                <TouchableOpacity
                                    key={task.id}
                                    style={styles.resultCard}
                                    onPress={() => handleResultPress(task)}
                                >
                                    <View style={[styles.statusDot, task.completed && styles.statusDotCompleted]} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.resultTitle, task.completed && styles.resultTitleCompleted]}>{task.title}</Text>
                                        <Text style={styles.resultMeta}>
                                            {task.timestamp ? task.timestamp.split(' ')[0] : 'No Date'} • {task.priority}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color="#CCCCCC" />
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                    {/* Recent Searches */}
                    {query.length === 0 && recentSearches.length > 0 && (
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>{t('calendar.search.recent')}</Text>
                                <TouchableOpacity onPress={clearRecent}>
                                    <Text style={styles.clearButton}>{t('calendar.search.clear')}</Text>
                                </TouchableOpacity>
                            </View>

                            {recentSearches.map((item, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.recentItem}
                                    onPress={() => handleSearch(item)}
                                >
                                    <View style={styles.recentIcon}>
                                        <Ionicons name="time-outline" size={18} color="#856b66" />
                                    </View>
                                    <Text style={styles.recentText}>{item}</Text>
                                    <Ionicons name="chevron-forward" size={18} color="#856b66" />
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* AI Suggestions */}
                    {query.length === 0 && (
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Ionicons name="sparkles" size={18} color="#d24d32" />
                                    <Text style={styles.sectionTitle}>{t('calendar.search.suggested')}</Text>
                                </View>
                            </View>

                            <TouchableOpacity style={styles.suggestionCard}>
                                <View style={[styles.suggestionIcon, { backgroundColor: '#FFEDD5' }]}>
                                    <Ionicons name="calendar-outline" size={20} color="#C2410C" />
                                </View>
                                <View>
                                    <Text style={styles.suggestionTitle}>{t('calendar.search.suggestion.meetings.title')}</Text>
                                    <Text style={styles.suggestionDesc}>{t('calendar.search.suggestion.meetings.desc')}</Text>
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.suggestionCard}>
                                <View style={[styles.suggestionIcon, { backgroundColor: '#E0E7FF' }]}>
                                    <Ionicons name="checkbox-outline" size={20} color="#4338CA" />
                                </View>
                                <View>
                                    <Text style={styles.suggestionTitle}>{t('calendar.search.suggestion.completed.title')}</Text>
                                    <Text style={styles.suggestionDesc}>{t('calendar.search.suggestion.completed.desc')}</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FDFBF7', // background-light
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 16,
        gap: 12,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.05)',
    },
    searchBarContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        borderRadius: 16,
        paddingHorizontal: 12,
        height: 48,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: '#171312',
        fontWeight: '500',
    },
    clearIcon: {
        padding: 4,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        padding: 24,
        gap: 32,
    },
    section: {
        gap: 12,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#856b66', // text-sub
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    clearButton: {
        fontSize: 12,
        fontWeight: '500',
        color: '#d24d32', // primary
    },
    recentItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: 'white',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        gap: 12,
    },
    recentIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FDFBF7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    recentText: {
        flex: 1,
        fontSize: 14,
        fontWeight: '500',
        color: '#171312',
    },
    suggestionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'white', // gradient fallback
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(210, 77, 50, 0.1)', // primary/10
        gap: 16,
        marginBottom: 8,
    },
    suggestionIcon: {
        padding: 10,
        borderRadius: 12,
    },
    suggestionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#171312',
        marginBottom: 4,
    },
    suggestionDesc: {
        fontSize: 12,
        color: '#856b66',
    },
    resultCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'white',
        borderRadius: 16,
        gap: 12,
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#d24d32',
    },
    statusDotCompleted: {
        backgroundColor: '#4ade80',
    },
    resultTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#171312',
    },
    resultTitleCompleted: {
        textDecorationLine: 'line-through',
        color: '#856b66',
    },
    resultMeta: {
        fontSize: 12,
        color: '#856b66',
        marginTop: 4,
    },
});
