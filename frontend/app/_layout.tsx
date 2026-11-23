/**
 * 根布局组件
 * 配置 NativeWind 和 Expo Router
 */
import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { AppDialog } from '../components/AppDialog';

import { useEffect, useRef } from 'react';
import { useConfigStore } from '../store/useConfigStore';
import { generateUUID } from '../utils/uuid';
import { fetchModels } from '../services/api';

export default function RootLayout() {
    const hasHydrated = useConfigStore((state) => state._hasHydrated);
    const initializedRef = useRef(false);

    useEffect(() => {
        // 等待 Zustand persist 从 AsyncStorage 完成水合后再初始化 deviceId，避免覆盖持久化值
        if (!hasHydrated || initializedRef.current) return;
        initializedRef.current = true;

        const init = async () => {
            const { deviceId, setDeviceId } = useConfigStore.getState();
            let currentId = deviceId;
            if (!currentId) {
                currentId = generateUUID();
                console.log('📱 Initializing new Device ID:', currentId);
                setDeviceId(currentId);
            } else {
                console.log('📱 Current Device ID:', currentId);
            }

            console.log('🌐 Registering device with backend...');
            fetchModels().then((data: any) => {
                if (data) console.log('✅ Device registered, limits:', data.limits);
            });
        };

        init();
    }, [hasHydrated]);

    return (
        <SafeAreaProvider style={{ flex: 1 }}>
            <StatusBar style="dark" />
            <AppDialog />
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: Colors.background },
                }}
            >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
        </SafeAreaProvider>
    );
}
