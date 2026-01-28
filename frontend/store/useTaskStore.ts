/**
 * 任务状态管理
 * 管理当前任务列表和历史记录
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Task {
    id: string;
    title: string;
    time?: string;
    timestamp?: string;
    location?: string;
    suggestion?: string;
    priority: 'low' | 'normal' | 'high';
    completed: boolean;
    createdAt: string;
    audioPath?: string;  // 本地音频文件路径
    subtasks?: { id: string; title: string; completed: boolean }[];
    isOverdue?: boolean; // 仅用于 UI 展示
}

export interface TaskRecord {
    id: number;
    rawText: string;
    tasks: Task[];
    rawAiResponse?: any;
    createdAt: string;
}

interface TaskState {
    // 今日任务
    todayTasks: Task[];

    // 历史记录
    records: TaskRecord[];

    // 是否正在加载
    isLoading: boolean;

    // Actions
    addTask: (task: Omit<Task, 'id' | 'completed' | 'createdAt' | 'subtasks'> & { subtasks?: string[] }) => void;
    toggleTask: (taskId: string) => void;
    toggleSubtask: (taskId: string, subtaskId: string) => void;
    deleteTask: (taskId: string) => void;
    updateTask: (taskId: string, updates: Partial<Task>) => void;
    addRecord: (record: Omit<TaskRecord, 'id'>) => void;
    setTodayTasks: (tasks: Task[]) => void;
    setLoading: (loading: boolean) => void;
    clearTodayTasks: () => void;
    clearRecords: () => void;

    // Calendar helpers
    getTodayTasksWithTime: () => Task[];
    getHomePageTasks: () => Task[];
    getTasksByDate: (date: string) => Task[];
    getAllTaskDates: () => string[];
}

// 生成唯一 ID
const generateId = () => Math.random().toString(36).substring(2, 11);

export const useTaskStore = create<TaskState>()(
    persist(
        (set, get) => ({
            todayTasks: [],
            records: [],
            isLoading: false,

            addTask: (task) => {
                const newTask: Task = {
                    ...task,
                    id: generateId(),
                    completed: false,
                    subtasks: (task.subtasks || []).map(t => ({
                        id: generateId(),
                        title: t,
                        completed: false
                    })),
                    createdAt: new Date().toISOString(),
                };

                set((state) => {
                    const updatedTasks = [...state.todayTasks, newTask].sort((a, b) => {
                        const t1 = a.timestamp || '9999-99-99'; // 无时间戳排最后
                        const t2 = b.timestamp || '9999-99-99';
                        return t1.localeCompare(t2);
                    });

                    return {
                        todayTasks: updatedTasks,
                    };
                });
            },

            toggleTask: (taskId) => {
                set((state) => ({
                    todayTasks: state.todayTasks.map((task) =>
                        task.id === taskId ? { ...task, completed: !task.completed } : task
                    ),
                }));
            },

            toggleSubtask: (taskId, subtaskId) => {
                set((state) => ({
                    todayTasks: state.todayTasks.map((task) => {
                        if (task.id !== taskId) return task;
                        return {
                            ...task,
                            subtasks: (task.subtasks || []).map(sub =>
                                sub.id === subtaskId ? { ...sub, completed: !sub.completed } : sub
                            )
                        };
                    }),
                }));
            },



            deleteTask: (taskId) => {
                set((state) => ({
                    todayTasks: state.todayTasks.filter((task) => task.id !== taskId),
                }));
            },

            addRecord: (record) => {
                const newRecord: TaskRecord = {
                    ...record,
                    id: Date.now(),
                };
                set((state) => ({
                    records: [newRecord, ...state.records].slice(0, 100), // 最多保留100条
                }));
            },

            setTodayTasks: (tasks) => set({ todayTasks: tasks }),

            setLoading: (loading) => set({ isLoading: loading }),

            updateTask: (taskId, updates) => {
                set((state) => ({
                    todayTasks: state.todayTasks.map((task) =>
                        task.id === taskId ? { ...task, ...updates } : task
                    ),
                }));
            },

            clearTodayTasks: () => set({ todayTasks: [] }),
            clearRecords: () => set({ records: [] }),

            // Calendar helpers
            getTodayTasksWithTime: () => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

                return get().todayTasks.filter(task => {
                    if (!task.timestamp) return false;
                    const taskDate = task.timestamp.split(' ')[0]; // Extract YYYY-MM-DD from "YYYY-MM-DD HH:MM:SS"
                    return taskDate === todayStr;
                }).sort((a, b) => {
                    const t1 = a.timestamp || '';
                    const t2 = b.timestamp || '';
                    return t1.localeCompare(t2);
                });
            },

            getTasksByDate: (targetDate: string) => { // targetDate format: YYYY-MM-DD
                return get().todayTasks.filter(task => {
                    if (!task.timestamp) return false;
                    const taskDate = task.timestamp.split(' ')[0];
                    return taskDate === targetDate;
                }).sort((a, b) => {
                    const t1 = a.timestamp || '';
                    const t2 = b.timestamp || '';
                    return t1.localeCompare(t2);
                });
            },

            getHomePageTasks: () => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayStr = today.toISOString().split('T')[0];

                // 1. Find overdue tasks (date < today && !completed)
                // We need to iterate all todayTasks (which functions as "all current active tasks" in this simple store?)
                // Actually the store name 'todayTasks' is misleading if it holds all tasks. 
                // Looking at addTask, it adds to 'todayTasks'. So 'todayTasks' is actually 'allTasks'.
                // Let's assume 'todayTasks' holds ALL tasks for now based on addTask implementation.

                const allTasks = get().todayTasks;

                const overdue = allTasks.filter(task => {
                    if (!task.timestamp || task.completed) return false;
                    const taskDate = task.timestamp.split(' ')[0];
                    return taskDate < todayStr;
                });

                const todayMatches = allTasks.filter(task => {
                    if (!task.timestamp) return false;
                    const taskDate = task.timestamp.split(' ')[0];
                    return taskDate === todayStr;
                });

                // Sort both by time
                const sortByTime = (a: Task, b: Task) => (a.timestamp || '').localeCompare(b.timestamp || '');

                return [
                    ...overdue.sort(sortByTime).map(t => ({ ...t, isOverdue: true })),
                    ...todayMatches.sort(sortByTime)
                ];
            },

            getAllTaskDates: () => {
                const dates = new Set<string>();
                get().todayTasks.forEach(task => {
                    if (task.timestamp) {
                        const taskDate = task.timestamp.split(' ')[0];
                        dates.add(taskDate);
                    }
                });
                return Array.from(dates).sort();
            },
        }),
        {
            name: 'project-flow-tasks',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
