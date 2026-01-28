/**
 * 时间轴任务项组件
 * 显示单个任务在时间轴上的表现
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../store/useTaskStore';

interface TimelineItemProps {
    task: Task;
    onToggle: (taskId: string) => void;
    onPress?: (task: Task) => void;
}

export function TimelineItem({ task, onToggle, onPress }: TimelineItemProps) {
    // 提取时间部分 HH:MM from "YYYY-MM-DD HH:MM:SS"
    const timeStr = task.timestamp ? task.timestamp.split(' ')[1]?.substring(0, 5) : task.time;
    const hour = timeStr ? timeStr.split(':')[0] : '00';
    const minute = timeStr ? timeStr.split(':')[1] : '00';
    const ampm = parseInt(hour) >= 12 ? 'PM' : 'AM';
    const displayHour = parseInt(hour) > 12 ? parseInt(hour) - 12 : (parseInt(hour) === 0 ? 12 : parseInt(hour));

    // 优先级颜色
    const priorityColors = {
        high: { bg: 'bg-[#d24d32]/10', text: 'text-[#d24d32]', border: 'border-[#d24d32]' },
        normal: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-500' },
        low: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-500' },
    };

    const colors = priorityColors[task.priority];

    return (
        <View className={`group flex-row gap-4 mb-6 ${task.completed ? 'opacity-70' : ''}`}>
            {/* Time Column */}
            <View className="flex items-center w-12 pt-1">
                <Text className={`text-sm font-bold ${task.completed ? 'text-[#8da399] line-through' : 'text-[#171312] dark:text-white'}`}>
                    {displayHour}:{minute}
                </Text>
                <Text className="text-xs text-[#856b66] font-medium">{ampm}</Text>
                {/* Timeline connector - fixed height instead of h-full to prevent expansion */}
                <View className="w-[2px] bg-gray-200 dark:bg-gray-700 flex-grow mt-2 rounded-full" style={{ minHeight: 40 }} />
            </View>

            {/* Task Card */}
            <Pressable
                onPress={() => onPress?.(task)}
                className={`flex-1 p-4 rounded-2xl shadow-sm border ${task.completed
                    ? 'bg-[#FDFBF7] dark:bg-white/5 border-[#8da399]/20'
                    : `bg-white dark:bg-white/5 border-black/5 dark:border-white/5 ${task.priority === 'high' ? `border-l-4 !${colors.border}` : ''}`
                    }`}
            >
                {task.completed && (
                    <View className="flex-row items-center gap-3 mb-2">
                        <View className="flex-shrink-0 w-8 h-8 rounded-full bg-[#8da399]/20 flex items-center justify-center">
                            <Ionicons name="checkmark" size={20} color="#8da399" />
                        </View>
                    </View>
                )}

                {!task.completed && (
                    <View className="flex-row justify-between items-start mb-2">
                        <View className={`px-2.5 py-0.5 rounded-full ${colors.bg}`}>
                            <Text className={`text-xs font-medium ${colors.text}`}>
                                {task.priority === 'high' ? 'Important' : task.priority === 'normal' ? 'Work' : 'Personal'}
                            </Text>
                        </View>
                        <Pressable onPress={() => onToggle(task.id)}>
                            <Ionicons name="ellipsis-horizontal" size={20} color="#856b66" />
                        </Pressable>
                    </View>
                )}

                <Text className={`text-lg font-bold leading-tight mb-1 ${task.completed
                    ? 'text-[#171312] dark:text-gray-300 line-through'
                    : 'text-[#171312] dark:text-white'
                    }`}>
                    {task.title}
                </Text>

                {task.location && (
                    <View className="flex-row items-center gap-1">
                        <Ionicons name="location-outline" size={16} color="#856b66" />
                        <Text className="text-sm text-[#856b66]">{task.location}</Text>
                    </View>
                )}

                {task.suggestion && !task.location && (
                    <Text className="text-sm text-[#856b66]">{task.suggestion}</Text>
                )}

                {task.completed && (
                    <Text className="text-xs text-[#8da399] mt-1">
                        Completed at {timeStr}
                    </Text>
                )}
            </Pressable>
        </View>
    );
}
