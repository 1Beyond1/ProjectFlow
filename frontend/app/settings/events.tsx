import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTaskStore, Task } from '../../store/useTaskStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import { Colors } from '../../constants/Colors';
import { DateTimeWheelPicker } from '../../components/DateTimeWheelPicker';

export default function EventsManagementScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useLanguageStore();
    const { todayTasks, deleteTask, updateTask } = useTaskStore();
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    // Edit Modal State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);

    // View Mode inside Modal: 'form' | 'datePicker' | 'timePicker'
    const [modalViewMode, setModalViewMode] = useState<'form' | 'datePicker' | 'timePicker'>('form');

    // Form State
    const [editTitle, setEditTitle] = useState('');
    const [editDate, setEditDate] = useState(''); // YYYY-MM-DD
    const [editTime, setEditTime] = useState(''); // HH:MM
    const [hasTime, setHasTime] = useState(true); // Toggle for "No specific time"
    const [editLocation, setEditLocation] = useState('');
    const [editPriority, setEditPriority] = useState<'low' | 'normal' | 'high'>('normal');

    // Sort all tasks by date (newest first)
    const sortedTasks = useMemo(() => {
        return [...todayTasks].sort((a, b) => {
            const t1 = a.timestamp || '9999-99-99';
            const t2 = b.timestamp || '9999-99-99';
            return t2.localeCompare(t1);
        });
    }, [todayTasks]);

    const handleTaskPress = (taskId: string) => {
        if (isSelectionMode) {
            const newSet = new Set(selectedTasks);
            if (newSet.has(taskId)) {
                newSet.delete(taskId);
                if (newSet.size === 0) setIsSelectionMode(false);
            } else {
                newSet.add(taskId);
            }
            setSelectedTasks(newSet);
        } else {
            // Edit mode
            const task = todayTasks.find(t => t.id === taskId);
            if (task) {
                setEditingTask(task);
                setEditTitle(task.title);

                // Parse timestamp
                const ts = task.timestamp || '';
                if (ts) {
                    const [d, tStr] = ts.includes(' ') ? ts.split(' ') : [ts, ''];
                    setEditDate(d);
                    if (tStr) {
                        setEditTime(tStr.substring(0, 5));
                        setHasTime(true);
                    } else {
                        setEditTime('09:00'); // Default if toggled on
                        setHasTime(false);
                    }
                } else {
                    const now = new Date();
                    setEditDate(now.toISOString().split('T')[0]);
                    setEditTime('09:00');
                    setHasTime(false);
                }

                setEditLocation(task.location || '');
                setEditPriority(task.priority);

                // Ensure form mode
                setModalViewMode('form');

                setEditModalVisible(true);
            }
        }
    };

    const handleCloseModal = () => {
        setEditModalVisible(false);
        setEditingTask(null);
        setEditTitle('');
        setEditDate('');
        setEditTime('');
        setHasTime(true);
        setEditLocation('');
        setEditPriority('normal');
        setModalViewMode('form');
    };

    const handleSaveEdit = () => {
        if (editingTask && editTitle.trim() && editDate) {
            let newTimestamp = editDate;
            let timeVal = undefined;

            if (hasTime) {
                newTimestamp = `${editDate} ${editTime}:00`;
                timeVal = editTime;
            }

            updateTask(editingTask.id, {
                title: editTitle.trim(),
                timestamp: newTimestamp,
                time: timeVal,
                location: editLocation.trim(),
                priority: editPriority
            });

            handleCloseModal();
        }
    };

    const handleLongPress = (taskId: string) => {
        if (!isSelectionMode) {
            setIsSelectionMode(true);
            setSelectedTasks(new Set([taskId]));
        }
    };

    const handleDeleteSelected = () => {
        Alert.alert(
            t('common.delete'),
            t('settings.events.confirmDelete'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: () => {
                        selectedTasks.forEach(id => deleteTask(id));
                        setIsSelectionMode(false);
                        setSelectedTasks(new Set());
                    }
                }
            ]
        );
    };

    const toggleSelectionMode = () => {
        if (isSelectionMode) {
            setIsSelectionMode(false);
            setSelectedTasks(new Set());
        } else {
            setIsSelectionMode(true);
        }
    };

    const renderPriorityChip = (p: 'low' | 'normal' | 'high') => {
        const isSelected = editPriority === p;
        const labels = {
            low: t('event.priority.low'),
            normal: t('event.priority.normal'),
            high: t('event.priority.high')
        };
        const colors = {
            low: isSelected ? 'bg-green-100 border-green-500' : 'bg-gray-50 border-gray-200',
            normal: isSelected ? 'bg-blue-100 border-blue-500' : 'bg-gray-50 border-gray-200',
            high: isSelected ? 'bg-red-100 border-red-500' : 'bg-gray-50 border-gray-200',
        };
        const textColors = {
            low: isSelected ? 'text-green-700' : 'text-gray-500',
            normal: isSelected ? 'text-blue-700' : 'text-gray-500',
            high: isSelected ? 'text-red-700' : 'text-gray-500',
        };

        return (
            <TouchableOpacity
                onPress={() => setEditPriority(p)}
                className={`px-4 py-2 rounded-full border ${colors[p]} mr-2`}
            >
                <Text className={`font-medium ${textColors[p]}`}>{labels[p]}</Text>
            </TouchableOpacity>
        );
    };

    // Render content based on view mode
    const renderModalContent = () => {
        if (modalViewMode === 'datePicker') {
            return (
                <View className="items-center w-full">
                    <Text className="text-xl font-bold mb-6 text-[#171312]">选择日期</Text>

                    <DateTimeWheelPicker
                        value={editDate}
                        mode="date"
                        onChange={(d) => setEditDate(d)}
                    />

                    <View className="w-full mt-6">
                        <TouchableOpacity
                            className="bg-[#d24d32] py-3 rounded-xl w-full items-center"
                            onPress={() => setModalViewMode('form')}
                        >
                            <Text className="text-white font-bold text-base">{t('common.confirm')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }

        if (modalViewMode === 'timePicker') {
            return (
                <View className="items-center w-full">
                    <Text className="text-xl font-bold mb-6 text-[#171312]">选择时间</Text>

                    <DateTimeWheelPicker
                        value={editTime}
                        mode="time"
                        onChange={(t) => setEditTime(t)}
                    />

                    <View className="w-full mt-6">
                        <TouchableOpacity
                            className="bg-[#d24d32] py-3 rounded-xl w-full items-center"
                            onPress={() => setModalViewMode('form')}
                        >
                            <Text className="text-white font-bold text-base">{t('common.confirm')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }

        return (
            <View className="w-full">
                <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-xl font-bold text-[#171312]">{t('settings.events.editTitle')}</Text>
                    <TouchableOpacity onPress={handleCloseModal}>
                        <Ionicons name="close" size={24} color="#856b66" />
                    </TouchableOpacity>
                </View>

                {/* Title Input */}
                <View className="mb-4">
                    <Text className="text-sm font-semibold text-[#856b66] mb-1">{t('event.field.title')}</Text>
                    <TextInput
                        className="bg-[#FDFBF7] p-4 rounded-xl text-base text-[#171312] border border-gray-100"
                        value={editTitle}
                        onChangeText={setEditTitle}
                    />
                </View>

                {/* Priority Selection */}
                <View className="mb-4">
                    <Text className="text-sm font-semibold text-[#856b66] mb-2">{t('event.field.priority')}</Text>
                    <View className="flex-row">
                        {renderPriorityChip('low')}
                        {renderPriorityChip('normal')}
                        {renderPriorityChip('high')}
                    </View>
                </View>

                {/* Date Selection */}
                <View className="mb-4">
                    <Text className="text-sm font-semibold text-[#856b66] mb-1">日期</Text>
                    <Pressable
                        className="bg-[#FDFBF7] p-4 rounded-xl border border-gray-100 items-center flex-row justify-between"
                        onPress={() => setModalViewMode('datePicker')}
                    >
                        <Text className="text-base font-bold text-[#171312]">
                            {editDate || '选择日期'}
                        </Text>
                        <Ionicons name="calendar-outline" size={20} color="#856b66" />
                    </Pressable>
                </View>

                {/* Time Toggle & Selection */}
                <View className="mb-4">
                    <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-sm font-semibold text-[#856b66]">具体时间</Text>
                        <Switch
                            value={hasTime}
                            onValueChange={setHasTime}
                            trackColor={{ false: '#eee', true: '#d24d32' }}
                            thumbColor="white"
                        />
                    </View>

                    {hasTime && (
                        <Pressable
                            className="bg-[#FDFBF7] p-4 rounded-xl border border-gray-100 items-center flex-row justify-between"
                            onPress={() => setModalViewMode('timePicker')}
                        >
                            <Text className="text-base font-bold text-[#171312]">
                                {editTime || '选择时间'}
                            </Text>
                            <Ionicons name="time-outline" size={20} color="#856b66" />
                        </Pressable>
                    )}
                </View>

                {/* Location Input */}
                <View className="mb-6">
                    <Text className="text-sm font-semibold text-[#856b66] mb-1">{t('event.field.location')}</Text>
                    <TextInput
                        className="bg-[#FDFBF7] p-3 rounded-xl text-base text-[#171312] border border-gray-100"
                        value={editLocation}
                        onChangeText={setEditLocation}
                        placeholder={t('common.unset')}
                    />
                </View>

                {/* Buttons */}
                <View className="flex-row gap-3">
                    <TouchableOpacity
                        className="flex-1 py-3 rounded-xl bg-gray-100 items-center"
                        onPress={handleCloseModal}
                    >
                        <Text className="font-bold text-gray-600">{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        className="flex-1 py-3 rounded-xl bg-[#d24d32] items-center"
                        onPress={handleSaveEdit}
                    >
                        <Text className="font-bold text-white">{t('common.save')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View className="flex-1 bg-[#FDFBF7]">
            {/* Header */}
            <View
                className="flex-row items-center justify-between px-6 pt-4 pb-4 bg-[#FDFBF7] border-b border-gray-100"
                style={{ paddingTop: insets.top }}
            >
                <Pressable onPress={() => router.back()} className="p-2 -ml-2">
                    <Ionicons name="arrow-back" size={24} color={Colors.textMain} />
                </Pressable>
                <Text className="text-xl font-bold text-[#171312]">
                    {isSelectionMode ? `${selectedTasks.size} ${t('settings.events.select')}` : t('settings.events.title')}
                </Text>
                <Pressable onPress={toggleSelectionMode} className="p-2 -mr-2">
                    <Text className="text-[#d24d32] font-medium">
                        {isSelectionMode ? t('settings.events.cancelSelect') : t('settings.events.select')}
                    </Text>
                </Pressable>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
                {sortedTasks.map(task => (
                    <Pressable
                        key={task.id}
                        onPress={() => handleTaskPress(task.id)}
                        onLongPress={() => handleLongPress(task.id)}
                        className={`flex-row items-center p-4 mb-3 rounded-2xl bg-white shadow-sm border ${selectedTasks.has(task.id) ? 'border-[#d24d32] bg-[#d24d32]/5' : 'border-transparent'
                            }`}
                    >
                        {isSelectionMode && (
                            <View className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${selectedTasks.has(task.id) ? 'border-[#d24d32] bg-[#d24d32]' : 'border-gray-300'
                                }`}>
                                {selectedTasks.has(task.id) && <Ionicons name="checkmark" size={12} color="white" />}
                            </View>
                        )}
                        <View className="flex-1">
                            <Text className={`font-bold text-base ${task.completed ? 'text-gray-400 line-through' : 'text-[#171312]'}`}>
                                {task.title}
                            </Text>
                            <View className="flex-row items-center mt-1">
                                <Text className="text-sm text-gray-500 mr-3">
                                    {task.timestamp ? task.timestamp.split(' ')[0] : t('common.unset')}
                                </Text>
                                <Text className="text-sm text-gray-500 mr-3">
                                    {task.timestamp?.split(' ')[1]?.substring(0, 5) || t('event.allDay')}
                                </Text>
                                {task.priority === 'high' && (
                                    <View className="bg-red-100 px-2 py-0.5 rounded text-xs">
                                        <Text className="text-red-600 text-[10px] font-bold">!!!</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                        <Ionicons name="create-outline" size={20} color="#CCCCCC" />
                    </Pressable>
                ))}
            </ScrollView>

            {/* Bottom Action Bar */}
            {isSelectionMode && (
                <View
                    className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 shadow-lg"
                    style={{ paddingBottom: insets.bottom + 16 }}
                >
                    <Pressable
                        className="bg-[#d24d32] rounded-xl py-3 items-center"
                        onPress={handleDeleteSelected}
                    >
                        <Text className="text-white font-bold text-base">{t('settings.events.deleteSelected')}</Text>
                    </Pressable>
                </View>
            )}

            {/* Combined Edit Modal */}
            <Modal
                transparent
                visible={editModalVisible}
                animationType="fade"
                onRequestClose={handleCloseModal}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    className="flex-1 items-center justify-center bg-black/50 px-6"
                >
                    <View className="w-full bg-white rounded-3xl p-6 shadow-xl space-y-4">
                        {renderModalContent()}
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}
