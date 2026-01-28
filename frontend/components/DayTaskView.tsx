import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TimelineItem } from './TimelineItem';
import { EdgeInsets } from 'react-native-safe-area-context';
import { useLanguageStore } from '../store/useLanguageStore';
import { Task } from '../store/useTaskStore';

interface DayTaskViewProps {
    date: string;
    tasks: Task[];
    insets: EdgeInsets;
    onToggleTask: (id: string) => void;
}

export const DayTaskView = React.memo(({ date, tasks, insets, onToggleTask }: DayTaskViewProps) => {
    const { t } = useLanguageStore();

    return (
        <ScrollView
            className="flex-1 px-6 pt-2"
            contentContainerStyle={{ paddingBottom: insets.bottom + 160 }}
            nestedScrollEnabled={true}
        >
            {tasks.length === 0 ? (
                <View className="flex-1 items-center justify-center py-20">
                    <Ionicons name="calendar-outline" size={64} color="#856b66" style={{ opacity: 0.3 }} />
                    <Text className="text-xl font-bold mt-4 text-[#171312] dark:text-white">
                        {t('calendar.noTasks.title')}
                    </Text>
                    <Text className="text-base mt-2 text-[#856b66]">
                        {t('calendar.noTasks.subtitle')}
                    </Text>
                </View>
            ) : (
                tasks.map((task) => (
                    <TimelineItem
                        key={task.id}
                        task={task}
                        onToggle={onToggleTask}
                    />
                ))
            )}

            {/* AI Insight Card */}
            {tasks.length > 3 && (
                <View className="p-4 rounded-2xl bg-gradient-to-br from-white to-[#fbf7f6] dark:from-[#2a2422] dark:to-[#201512] shadow-sm border border-[#d24d32]/10 relative overflow-hidden mb-6">
                    <View className="absolute top-0 right-0 p-3 opacity-10">
                        <Ionicons name="sparkles" size={64} color="#d24d32" />
                    </View>
                    <View className="flex-row items-start gap-3 relative z-10">
                        <View className="p-2 rounded-xl bg-[#d24d32]/10">
                            <Ionicons name="bulb-outline" size={20} color="#d24d32" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-xs font-bold text-[#d24d32] uppercase tracking-wider mb-1">
                                AI Insight
                            </Text>
                            <Text className="text-sm text-[#171312] dark:text-gray-200 leading-relaxed font-medium">
                                You have a busy day. Consider taking breaks between tasks.
                            </Text>
                        </View>
                    </View>
                </View>
            )}
        </ScrollView>
    );
});
