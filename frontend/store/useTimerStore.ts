import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateUUID } from '../utils/uuid';
import { pomodoroEnd } from '../services/api';

type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';
type TimerMode = 'countdown' | 'countup';

interface PomodoroSession {
    sessionId: string;
    startTime: string; // ISO
    duration: number;
    status: 'completed' | 'interrupted';
    syncStatus: 'synced' | 'pending';
}

interface TimerState {
    timeLeft: number;
    duration: number;
    status: TimerStatus;
    mode: TimerMode;
    sessionId: string | null;
    startTime: string | null;

    // 待同步队列 (Offline Support)
    pendingSessions: PomodoroSession[];

    // Actions
    setDuration: (sec: number) => void;
    setMode: (mode: TimerMode) => void;
    start: () => void;
    pause: () => void;
    resume: () => void;
    stop: () => Promise<void>; // Interrupted
    complete: () => Promise<void>; // Completed
    tick: () => void;
    reset: () => void;

    // Sync
    syncPendingSessions: () => Promise<void>;
}

export const useTimerStore = create<TimerState>()(
    persist(
        (set, get) => ({
            timeLeft: 25 * 60,
            duration: 25 * 60,
            status: 'idle',
            mode: 'countdown',
            sessionId: null,
            startTime: null,
            pendingSessions: [],

            setDuration: (sec) => set((state) => ({
                duration: sec,
                timeLeft: state.mode === 'countdown' ? sec : 0,
            })),
            setMode: (mode) => set((state) => ({
                mode,
                status: 'idle',
                sessionId: null,
                startTime: null,
                timeLeft: mode === 'countdown' ? state.duration : 0,
            })),

            start: () => {
                const { status, duration, mode } = get();
                if (status === 'idle' || status === 'completed') {
                    set({
                        status: 'running',
                        sessionId: generateUUID(),
                        startTime: new Date().toISOString(),
                        timeLeft: mode === 'countdown' ? duration : 0
                    });
                }
            },

            pause: () => set({ status: 'paused' }),
            resume: () => set({ status: 'running' }),

            tick: () => {
                const { status, timeLeft, mode } = get();
                if (status !== 'running') return;
                if (mode === 'countdown') {
                    if (timeLeft > 0) {
                        set({ timeLeft: timeLeft - 1 });
                    } else {
                        get().complete();
                    }
                } else {
                    set({ timeLeft: timeLeft + 1 });
                }
            },
            reset: () => {
                set((state) => ({
                    status: 'idle',
                    timeLeft: state.duration,
                    sessionId: null,
                    startTime: null,
                }));
            },

            stop: async () => {
                const { sessionId, startTime, duration, timeLeft, mode } = get();
                if (!sessionId || !startTime) {
                    set({ status: 'idle', timeLeft: get().duration });
                    return;
                }

                const actualDuration = mode === 'countdown' ? (duration - timeLeft) : timeLeft;
                if (actualDuration < 60) {
                    // Too short, discard
                    set({ status: 'idle', timeLeft: get().duration, sessionId: null, startTime: null });
                    return;
                }

                const session: PomodoroSession = {
                    sessionId,
                    startTime,
                    duration: actualDuration,
                    status: 'interrupted',
                    syncStatus: 'pending'
                };

                set((state) => ({
                    status: 'idle',
                    timeLeft: state.duration,
                    sessionId: null,
                    startTime: null,
                    pendingSessions: [...state.pendingSessions, session]
                }));

                // Try sync immediately
                get().syncPendingSessions();
            },

            complete: async () => {
                const { sessionId, startTime, duration } = get();
                if (!sessionId || !startTime) return;

                const session: PomodoroSession = {
                    sessionId,
                    startTime,
                    duration: duration,
                    status: 'completed',
                    syncStatus: 'pending'
                };

                set((state) => ({
                    status: 'completed',
                    timeLeft: 0, // Stay at 0 until reset
                    sessionId: null,
                    startTime: null,
                    pendingSessions: [...state.pendingSessions, session]
                }));

                // Try sync immediately
                get().syncPendingSessions();
            },

            syncPendingSessions: async () => {
                const { pendingSessions } = get();
                if (pendingSessions.length === 0) return;

                const newPending = [...pendingSessions];
                const syncedIndices: number[] = [];

                for (let i = 0; i < newPending.length; i++) {
                    const session = newPending[i];
                    if (session.syncStatus === 'synced') continue;

                    // Upload
                    // Calculate local_date/hour from startTime (client time)
                    const d = new Date(session.startTime);
                    const local_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const local_hour = d.getHours();

                    const res = await pomodoroEnd(
                        session.sessionId,
                        session.duration,
                        session.status,
                        local_date,
                        local_hour
                    );

                    if (res.success) {
                        syncedIndices.push(i);
                    }
                }

                // Remove synced sessions or mark them synced? 
                // To keep history local, maybe mark synced. But requirement says "Client must save local record".
                // Users table only stores stats. 
                // Let's keep them but change status to synced.
                if (syncedIndices.length > 0) {
                    set((state) => {
                        const current = [...state.pendingSessions];
                        syncedIndices.forEach(idx => {
                            if (current[idx]) current[idx].syncStatus = 'synced';
                        });
                        // Optional: Clean up synced sessions older than 30 days to save space?
                        return { pendingSessions: current };
                    });
                }
            }
        }),
        {
            name: 'timer-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
