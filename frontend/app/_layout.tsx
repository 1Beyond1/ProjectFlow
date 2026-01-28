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

import { useEffect } from 'react';
import { useConfigStore } from '../store/useConfigStore';
import { generateUUID } from '../utils/uuid';
import { fetchModels } from '../services/api';

export default function RootLayout() {
    const { deviceId, setDeviceId } = useConfigStore();

    useEffect(() => {
        const init = async () => {
            let currentId = deviceId;
            if (!currentId) {
                currentId = generateUUID();
                console.log('📱 Initializing new Device ID:', currentId);
                setDeviceId(currentId);
            } else {
                console.log('📱 Current Device ID:', currentId);
            }

            // 立即调用一次 API 以注册设备 ID 到后端
            // 使用 setTimeout 稍微延迟一下确保 store 更新（虽然在这里 async 应该没问题）
            setTimeout(() => {
                console.log('🌐 Registering device with backend...');
                fetchModels().then((data: any) => {
                    if (data) console.log('✅ Device registered, limits:', data.limits);
                });
            }, 1000);
        };

        init();
    }, []);

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
