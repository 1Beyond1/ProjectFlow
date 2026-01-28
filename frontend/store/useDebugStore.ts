/**
 * 调试状态管理
 * 用于监控 AI 处理流程的状态、进度和日志
 */
import { create } from 'zustand';

export enum ProcessingPhase {
    Idle = 'Idle',
    Recording = 'Recording',
    Compressing = 'Compressing',
    Uploading = 'Uploading',
    ProcessingSTT = 'ProcessingSTT',
    ProcessingLLM = 'ProcessingLLM',
    Completed = 'Completed',
    Error = 'Error',
}

export interface DebugState {
    currentPhase: ProcessingPhase;
    progress: number; // 0-100
    logs: string[];
    isMonitorOpen: boolean;

    // Actions
    setPhase: (phase: ProcessingPhase) => void;
    setProgress: (progress: number) => void;
    addLog: (message: string) => void;
    clearLogs: () => void;
    reset: () => void;
    setMonitorOpen: (isOpen: boolean) => void;
}

export const useDebugStore = create<DebugState>((set) => ({
    currentPhase: ProcessingPhase.Idle,
    progress: 0,
    logs: [],
    isMonitorOpen: false,

    setPhase: (phase) => set({ currentPhase: phase }),

    setProgress: (progress) => set({ progress }),

    addLog: (message) => set((state) => ({
        logs: [`[${new Date().toLocaleTimeString()}] ${message}`, ...state.logs]
    })),

    clearLogs: () => set({ logs: [] }),

    reset: () => set({
        currentPhase: ProcessingPhase.Idle,
        progress: 0,
        logs: [],
    }),

    setMonitorOpen: (isOpen) => set({ isMonitorOpen: isOpen }),
}));
