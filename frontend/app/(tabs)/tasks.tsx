import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useTaskStore } from '../../store/useTaskStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import { useBanCheck } from '../../hooks/useBanCheck';
import { useDialogStore } from '../../store/useDialogStore';
import WebTasksScreen from '../../components/web_screens/WebTasksScreen';

// Mobile Tasks Component
const MobileTasksScreen = () => {
    const insets = useSafeAreaInsets();
    const { getHomePageTasks, toggleTask } = useTaskStore();
    const { t } = useLanguageStore();
    const { checkBanStatus } = useBanCheck();
    const { showDialog } = useDialogStore();

    const [activeFilter, setActiveFilter] = useState('Inbox');

    const allTasks = getHomePageTasks();
    const filteredTasks = useMemo(() => {
        const sorted = [...allTasks].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
        switch (activeFilter) {
            case 'Inbox': return sorted;
            case 'Personal': return sorted.filter(t => !t.completed);
            case 'Work': return sorted.filter(t => t.priority === 'high');
            default: return sorted;
        }
    }, [allTasks, activeFilter]);

    return (
        <View className="flex-1 bg-background" style={{ backgroundColor: Colors.background }}>
            {/* Header */}
            <View
                className="px-6 pb-4 border-b border-black/5 flex-row justify-between items-center bg-background"
                style={{ paddingTop: insets.top + 20, backgroundColor: Colors.background, borderColor: 'rgba(0,0,0,0.05)' }}
            >
                <Text className="text-3xl font-bold text-text-main" style={{ color: Colors.textMain }}>Tasks</Text>
                <Pressable className="size-10 rounded-full bg-primary items-center justify-center">
                    <Ionicons name="add" size={24} color="white" />
                </Pressable>
            </View>

            {/* Filter Chips (Mobile Only) */}
            <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, gap: 12, paddingVertical: 16 }}>
                    {['Inbox', 'Personal', 'Work', 'Ideas'].map(f => {
                        const isActive = activeFilter === f;
                        return (
                            <Pressable
                                key={f}
                                onPress={() => setActiveFilter(f)}
                                className={`px-4 py-2 rounded-full border transition-all ${isActive ? 'bg-primary border-primary' : 'bg-surface border-black/5'}`}
                                style={{
                                    backgroundColor: isActive ? Colors.primary : Colors.surface,
                                    borderColor: isActive ? Colors.primary : 'rgba(0,0,0,0.05)'
                                }}
                            >
                                <Text
                                    className={`text-sm font-bold ${isActive ? 'text-white' : 'text-text-sub'}`}
                                    style={{ color: isActive ? 'white' : Colors.textSubtle }}
                                >
                                    {f}
                                </Text>
                            </Pressable>
                        )
                    })}
                </ScrollView>
            </View>

            {/* Task List */}
            <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 100 }}>
                <View className="flex-col gap-3">
                    {filteredTasks.map(task => (
                        <View
                            key={task.id}
                            className="bg-surface p-4 rounded-2xl flex-row items-start gap-4 shadow-sm"
                            style={{ backgroundColor: Colors.surface, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 }}
                        >
                            <Pressable
                                onPress={() => {
                                    if (checkBanStatus()) toggleTask(task.id);
                                }}
                                className={`mt-0.5 size-6 rounded-lg border-2 items-center justify-center ${task.completed ? 'bg-primary border-primary' : 'border-primary/20'}`}
                            >
                                {task.completed && <Ionicons name="checkmark" size={16} color="white" />}
                            </Pressable>
                            <View className="flex-1">
                                <Text
                                    className={`text-base font-semibold ${task.completed ? 'text-text-sub line-through' : 'text-text-main'}`}
                                    style={{ color: task.completed ? Colors.textSubtle : Colors.textMain }}
                                >
                                    {task.title}
                                </Text>
                                {task.priority === 'high' && (
                                    <Text className="text-xs font-bold text-primary mt-1" style={{ color: Colors.primary }}>High Priority</Text>
                                )}
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};

export default function TasksScreen() {
    const { width } = useWindowDimensions();
    const isDesktop = width >= 768;

    if (isDesktop && Platform.OS === 'web') {
        return <WebTasksScreen />;
    }

    return <MobileTasksScreen />;
}
