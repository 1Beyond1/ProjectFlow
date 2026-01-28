/**
 * 任务卡片组件
 * 显示单个任务项，支持勾选完成
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { Task, useTaskStore } from '../store/useTaskStore';
import { formatFriendlyDate } from '../utils/date';

interface TaskCardProps {
    task: Task;
    onToggle: (taskId: string) => void;
    onDelete?: (taskId: string) => void;
}

export function TaskCard({ task, onToggle, onDelete }: TaskCardProps) {
    const [expanded, setExpanded] = React.useState(true);
    const { toggleSubtask } = useTaskStore();
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;

    return (
        <View className="mb-3">
            <Pressable
                onPress={() => onToggle(task.id)}
                onLongPress={() => onDelete?.(task.id)}
                style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                })}
            >
                <View className="flex-row items-start gap-4 py-2">
                    {/* 复选框 */}
                    <View
                        className="h-6 w-6 rounded-full border-2 items-center justify-center mt-0.5"
                        style={{
                            borderColor: task.completed ? Colors.secondary : Colors.primary,
                            backgroundColor: task.completed ? Colors.secondary : 'transparent',
                        }}
                    >
                        {task.completed && (
                            <Ionicons name="checkmark" size={14} color={Colors.textLight} />
                        )}
                    </View>

                    {/* 任务内容 */}
                    <View className="flex-1">
                        <View className="flex-row justify-between items-start">
                            <Text
                                className="text-base font-medium leading-normal flex-1 mr-2"
                                style={{
                                    color: task.completed ? Colors.textSubtle : Colors.textMain,
                                    textDecorationLine: task.completed ? 'line-through' : 'none',
                                }}
                            >
                                {task.title}
                            </Text>

                            {hasSubtasks && (
                                <Pressable
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        setExpanded(!expanded);
                                    }}
                                    className="p-1"
                                >
                                    <Ionicons
                                        name={expanded ? "chevron-up" : "chevron-down"}
                                        size={20}
                                        color={Colors.textSubtle}
                                    />
                                </Pressable>
                            )}
                        </View>

                        {/* 时间和地点信息 */}
                        {(task.time || task.location || task.isOverdue) && (
                            <View className="flex-row items-center gap-3 mt-1 flex-wrap">
                                {task.isOverdue ? (
                                    <View className="flex-row items-center gap-1">
                                        <Ionicons name="alert-circle-outline" size={12} color={Colors.error} />
                                        <Text className="text-xs font-bold" style={{ color: Colors.error }}>
                                            {task.timestamp ? formatFriendlyDate(task.timestamp) : 'Overdue'}
                                        </Text>
                                    </View>
                                ) : task.time ? (
                                    <View className="flex-row items-center gap-1">
                                        <Ionicons name="time-outline" size={12} color={Colors.textSubtle} />
                                        <Text className="text-xs" style={{ color: Colors.textSubtle }}>
                                            {task.timestamp ? formatFriendlyDate(task.timestamp) : task.time}
                                        </Text>
                                    </View>
                                ) : null}

                                {task.location && (
                                    <View className="flex-row items-center gap-1">
                                        <Ionicons name="location-outline" size={12} color={Colors.primary} />
                                        <Text className="text-xs" style={{ color: Colors.primary }}>
                                            {task.location}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* AI 建议 */}
                        {task.suggestion && !task.completed && (
                            <View className="flex-row items-start gap-1 mt-1">
                                <Ionicons name="bulb-outline" size={12} color={Colors.primary} />
                                <Text className="text-xs flex-1" style={{ color: Colors.primary }}>
                                    {task.suggestion}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* 优先级指示器 */}
                    {task.priority === 'high' && !task.completed && (
                        <View className="h-2 w-2 rounded-full mt-2" style={{ backgroundColor: Colors.error }} />
                    )}
                </View>
            </Pressable>

            {/* 子任务列表 */}
            {hasSubtasks && expanded && (
                <View className="ml-12 mt-1 space-y-3">
                    {task.subtasks?.map((subtask) => (
                        <Pressable
                            key={subtask.id}
                            onPress={() => toggleSubtask(task.id, subtask.id)}
                            className="flex-row items-center gap-3"
                        >
                            <View
                                className="h-4 w-4 rounded border items-center justify-center"
                                style={{
                                    borderColor: subtask.completed ? Colors.textSubtle : Colors.textSubtle,
                                    backgroundColor: subtask.completed ? Colors.textSubtle : 'transparent',
                                }}
                            >
                                {subtask.completed && <Ionicons name="checkmark" size={10} color="white" />}
                            </View>
                            <Text
                                className="text-sm flex-1"
                                style={{
                                    color: subtask.completed ? Colors.textSubtle : Colors.textMain,
                                    textDecorationLine: subtask.completed ? 'line-through' : 'none',
                                }}
                            >
                                {subtask.title}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            )}
        </View>
    );
}
