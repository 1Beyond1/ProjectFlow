import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useTaskStore } from '../../store/useTaskStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import { Sidebar } from '../../components/web/Sidebar'; // Reuse Sidebar
import { useBanCheck } from '../../hooks/useBanCheck';
import { useDialogStore } from '../../store/useDialogStore';

type FilterType = 'Inbox' | 'Personal' | 'Work' | 'Ideas' | 'Projects';

export default function WebTasksScreen() {
    const { getHomePageTasks, toggleTask, deleteTask, addTask } = useTaskStore();
    const { user } = useAuthStore();
    const { t } = useLanguageStore();
    const { checkBanStatus } = useBanCheck();
    const { showDialog } = useDialogStore();

    const [activeFilter, setActiveFilter] = useState<FilterType>('Inbox');
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
    const [newTaskText, setNewTaskText] = useState('');
    const filterLabels: Record<FilterType, string> = {
        Inbox: t('web.tasks.filter.inbox'),
        Personal: t('web.tasks.filter.personal'),
        Work: t('web.tasks.filter.work'),
        Ideas: t('web.tasks.filter.ideas'),
        Projects: t('web.tasks.filter.projects'),
    };

    // Fetch all tasks (assuming getHomePageTasks returns relevant ones, or filter from store)
    // For specific filters, we might need a better selector. 
    // Using getHomePageTasks() for "Inbox" simulation (Today + Overdue).
    // In a real app, `useTaskStore` would have `getTasksByFolder` or filtering logic.
    const allTasks = getHomePageTasks();

    // Mock filtering logic
    const filteredTasks = useMemo(() => {
        // Strict sorting by timestamp
        const sorted = [...allTasks].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

        switch (activeFilter) {
            case 'Inbox': return sorted;
            case 'Personal': return sorted.filter(t => !t.completed); // Mock
            case 'Work': return sorted.filter(t => t.priority === 'high'); // Mock
            default: return sorted;
        }
    }, [allTasks, activeFilter]);

    // Batch Ops
    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedTasks);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedTasks(newSet);
    };

    const handleBatchDelete = () => {
        showDialog({
            title: t('common.delete'),
            message: `${t('web.tasks.batchDeleteMessagePrefix')}${selectedTasks.size}${t('web.tasks.batchDeleteMessageSuffix')}`,
            actions: [
                { label: t('common.cancel'), variant: 'secondary' },
                {
                    label: t('common.delete'),
                    variant: 'destructive',
                    onPress: () => {
                        if (checkBanStatus()) {
                            selectedTasks.forEach(id => deleteTask(id));
                            setSelectedTasks(new Set());
                        }
                    }
                }
            ]
        });
    };

    const handleAddTask = () => {
        if (!newTaskText.trim()) return;
        if (checkBanStatus()) {
            addTask({
                title: newTaskText,
                priority: 'normal',
                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });
            setNewTaskText('');
        }
    };

    return (
        <View className="bg-background-light h-screen w-full flex-row overflow-hidden" style={{ backgroundColor: Colors.background, flex: 1, width: '100%' }}>

            <Sidebar />

            <View className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-6 relative">
                {/* Header */}
                <View className="flex-row items-center justify-between gap-4 shrink-0">
                    <View>
                        <Text className="text-2xl font-bold tracking-tight" style={{ color: Colors.textMain }}>{t('web.tasks.title')}</Text>
                        <Text className="text-sm" style={{ color: Colors.textSubtle }}>{t('web.tasks.subtitle')}</Text>
                    </View>
                    <View className="flex-row items-center gap-3">
                        <Pressable className="size-10 rounded-full border items-center justify-center hover:bg-black/5" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
                            <Ionicons name="search" size={20} color={Colors.textSubtle} />
                        </Pressable>
                        <Pressable className="h-10 px-5 bg-primary rounded-xl justify-center shadow-lg shadow-primary/20 hover:opacity-90" onPress={() => console.log('New Task Dialog')}>
                            <View className="flex-row items-center gap-2">
                                <Ionicons name="add" size={20} color="white" />
                                <Text className="text-white font-bold text-sm">{t('task.add')}</Text>
                            </View>
                        </Pressable>
                    </View>
                </View>

                <View className="flex-1 flex-row gap-6 overflow-hidden pb-20">
                    {/* Filter Sidebar */}
                    <View className="w-60 shrink-0 flex flex-col gap-6 pt-2">
                        <View className="flex flex-col gap-1">
                            <Text className="px-3 text-xs font-bold uppercase tracking-wider mb-2" style={{ color: Colors.textSubtle }}>{t('web.tasks.myLists')}</Text>

                            {['Inbox', 'Personal', 'Work', 'Ideas'].map((f) => {
                                const isActive = activeFilter === f;
                                return (
                                    <Pressable
                                        key={f}
                                        onPress={() => setActiveFilter(f as any)}
                                        className={`flex-row items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${isActive ? 'bg-white shadow-sm border-[#e5dedc]' : 'border-transparent hover:bg-black/5'}`}
                                        style={isActive ? { borderColor: '#e5dedc', backgroundColor: 'white' } : {}}
                                    >
                                        <View className="flex-row items-center gap-3">
                                            <Ionicons
                                                name={f === 'Inbox' ? 'file-tray' : f === 'Personal' ? 'person' : f === 'Work' ? 'briefcase' : 'bulb'}
                                                size={20}
                                                color={isActive ? Colors.primary : Colors.textSubtle}
                                            />
                                            <Text style={{ color: isActive ? Colors.primary : Colors.textSubtle, fontWeight: isActive ? 'bold' : 'normal' }}>{filterLabels[f as FilterType]}</Text>
                                        </View>
                                        {f === 'Inbox' && <View className="bg-primary/10 px-2 py-0.5 rounded-full"><Text className="text-xs text-primary">{allTasks.length}</Text></View>}
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>

                    {/* Main Task List */}
                    <View className="flex-1 min-w-[320px] flex flex-col bg-white rounded-2xl border border-[#e5dedc] shadow-sm overflow-hidden h-full relative" style={{ backgroundColor: Colors.surface, borderColor: 'rgba(0,0,0,0.05)' }}>

                        {/* List Header */}
                        <View className="px-6 py-4 border-b flex-row justify-between items-center z-10 bg-white" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                            <View className="flex-row items-center gap-2">
                                <Text className="font-bold text-lg" style={{ color: Colors.textMain }}>{filterLabels[activeFilter]}</Text>
                                <View className="px-2 py-0.5 rounded-full bg-[#f4f1f0]">
                                    <Text className="text-xs" style={{ color: Colors.textSubtle }}>
                                        {t('web.tasks.taskCountPrefix')}{filteredTasks.length}{t('web.tasks.taskCountSuffix')}
                                    </Text>
                                </View>
                            </View>

                            {selectedTasks.size > 0 && (
                                <Pressable onPress={handleBatchDelete} className="flex-row items-center gap-1 text-red-500 hover:opacity-80">
                                    <Ionicons name="trash" size={16} color="#ef4444" />
                                    <Text className="text-sm font-bold text-red-500">{t('common.delete')} ({selectedTasks.size})</Text>
                                </Pressable>
                            )}
                        </View>

                        <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
                            {filteredTasks.map(task => {
                                const isSelected = selectedTasks.has(task.id);
                                return (
                                    <View
                                        key={task.id}
                                        className={`group flex-row items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-primary/5 border-primary' : 'bg-[#F8F6F6] border-transparent hover:bg-white hover:shadow-md hover:border-[#e5dedc]'}`}
                                        style={{
                                            // Manual hover style simulation logic handled by CSS 'group:hover' usually, 
                                            // here relying on NativeWind web hover support or simple static styles for MVP.
                                            backgroundColor: isSelected ? Colors.primary + '0D' : '#F8F6F6',
                                            borderColor: isSelected ? Colors.primary : 'transparent',
                                            transform: [{ scale: 1 }] // Placeholder for scale animation
                                        }}
                                    >
                                        <Pressable
                                            onPress={() => toggleSelect(task.id)}
                                            className={`mt-0.5 size-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-black/20 group-hover:border-primary'}`}
                                        >
                                            {isSelected && <Ionicons name="checkmark" size={14} color="white" />}
                                        </Pressable>

                                        <View className="flex-1 flex-col gap-1">
                                            <View className="flex-row justify-between items-start">
                                                <Text className={`text-sm font-semibold transition-colors ${task.completed ? 'line-through text-gray-400' : 'text-[#181311] group-hover:text-primary'}`}>
                                                    {task.title}
                                                </Text>
                                                <Text className="text-xs text-gray-400">{task.timestamp ? task.timestamp.split(' ')[0] : t('web.tasks.anytime')}</Text>
                                            </View>
                                            {task.priority === 'high' && (
                                                <View className="flex-row gap-2 mt-2">
                                                    <View className="px-2 py-0.5 rounded-md bg-[#FDF3D8] border border-[#fdeebc]">
                                                        <Text className="text-[10px] font-bold uppercase tracking-wide text-[#9C7B2E]">{t('web.tasks.highPriority')}</Text>
                                                    </View>
                                                </View>
                                            )}
                                        </View>

                                        {/* Hover Edit Action (Visible on Group Hover in CSS) */}
                                        <Pressable onPress={() => showDialog({ title: t('common.edit'), message: t('web.tasks.editPlaceholder'), actions: [{ label: t('common.confirm'), variant: 'primary' }] })} className="opacity-0 group-hover:opacity-100">
                                            <Ionicons name="create-outline" size={18} color={Colors.textSubtle} />
                                        </Pressable>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* Detail Panel (Inbox/Details) Mock */}
                    <View className="w-80 xl:w-96 shrink-0 flex flex-col bg-white rounded-2xl border border-[#e5dedc] shadow-lg shadow-black/5 overflow-hidden">
                        <View className="flex-row items-center justify-between p-4 border-b border-[#e5dedc]">
                            <View className="flex-row items-center gap-2">
                                <Ionicons name="stats-chart" size={18} color={Colors.textSubtle} />
                                <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: Colors.textSubtle }}>{t('web.tasks.status')}</Text>
                            </View>
                        </View>
                        <View className="p-6 flex-col gap-6 items-center justify-center flex-1">
                            <Image
                                source={{ uri: "https://cdn-icons-png.flaticon.com/512/7486/7486744.png" }}
                                style={{ width: 120, height: 120, opacity: 0.5 }}
                            />
                            <Text className="text-center text-sm" style={{ color: Colors.textSubtle }}>{t('web.tasks.selectTaskHint')}</Text>
                        </View>
                    </View>

                </View>

                {/* Quick Add Bar */}
                <View className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 z-30">
                    <View className="bg-white p-2 rounded-2xl shadow-xl shadow-black/10 border border-[#e5dedc] flex-row items-center gap-2 backdrop-blur-md">
                        <Pressable className="size-10 flex items-center justify-center rounded-xl hover:bg-black/5">
                            <Ionicons name="add" size={24} color={Colors.primary} />
                        </Pressable>
                        <TextInput
                            className="flex-1 bg-transparent border-none focus:ring-0 font-medium h-10 px-2 outline-none"
                            placeholder={t('web.tasks.quickAddPlaceholder')}
                            placeholderTextColor={Colors.textSubtle + '80'}
                            value={newTaskText}
                            onChangeText={setNewTaskText}
                            onSubmitEditing={handleAddTask}
                            style={{ color: Colors.textMain }}
                        />
                        <Pressable
                            onPress={handleAddTask}
                            className="h-9 px-4 rounded-xl bg-primary items-center justify-center shadow-sm shadow-primary/20 hover:opacity-90"
                        >
                            <Text className="text-white font-bold text-sm">{t('web.tasks.enter')}</Text>
                        </Pressable>
                    </View>
                </View>

            </View>
        </View>
    );
}
