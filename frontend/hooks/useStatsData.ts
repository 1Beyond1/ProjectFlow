import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useRouter } from 'expo-router';
import { useBanCheck } from './useBanCheck';
import { pomodoroStats } from '../services/api';

export interface StatsData {
    flowScore: number;
    totalFocus: string;
    completionRate: number;
    aiStreak: number;
    weeklyTrend: number[];
    focusDistribution: {
        deepWork: number;
        collaborative: number;
        admin: number;
    };
    aiReport: {
        summary: string;
        details: string;
    };
}

export const useStatsData = () => {
    const [data, setData] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const { user, logout } = useAuthStore();
    const { checkBanStatus } = useBanCheck();
    const router = useRouter();

    useEffect(() => {
        // Security Check: If banned, redirect immediately
        if (user?.status === 'banned') {
            logout();
            router.replace('/');
            return;
        }

        const fetchStats = async () => {
            setLoading(true);
            try {
                // Fetch real stats from backend
                const response = await pomodoroStats(7); // Fetch last 7 days for trend

                if (response.success && response.data) {
                    const { summary, series } = response.data;

                    // Map backend data to UI model
                    // Note: Series from backend is [oldest ... newest]
                    // We need to match the UI expectation

                    if (summary) {
                        setData({
                            flowScore: Math.min(100, summary.completion_rate_30d * 100), // Simple score based on completion rate
                            totalFocus: `${Math.floor(summary.today_focus_sec / 60)}m`,
                            completionRate: Math.round(summary.completion_rate_30d * 100),
                            aiStreak: summary.current_streak,
                            weeklyTrend: series.focus_sec.map((s: number) => Math.round(s / 60)), // Convert to minutes
                            focusDistribution: {
                                deepWork: 70, // TODO: Real distribution needs task tags
                                collaborative: 20,
                                admin: 10
                            },
                            aiReport: {
                                summary: `You've maintained a ${summary.current_streak}-day streak!`,
                                details: `Your peak productivity hour is around ${summary.peak_hour}:00.`
                            }
                        });
                    }
                } else {
                    // Fallback mock if API fails (or offline)
                    setData({
                        flowScore: 0,
                        totalFocus: '0m',
                        completionRate: 0,
                        aiStreak: 0,
                        weeklyTrend: [0, 0, 0, 0, 0, 0, 0],
                        focusDistribution: { deepWork: 0, collaborative: 0, admin: 0 },
                        aiReport: { summary: 'No data available', details: 'Complete some tasks to see insights.' }
                    });
                }
            } catch (e) {
                console.error("Stats fetch error", e);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [user]);

    return { data, loading };
};
