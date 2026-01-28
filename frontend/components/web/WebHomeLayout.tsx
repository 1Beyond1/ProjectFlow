import React from 'react';
import { View, ScrollView } from 'react-native';
import { Sidebar } from './Sidebar';
import { Colors } from '../../constants/Colors';

export const WebHomeLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <View className="bg-background-light text-text-main font-display antialiased h-screen w-full flex-row overflow-hidden"
            style={{ backgroundColor: Colors.background, height: '100vh', width: '100%' } as any}>

            {/* Sidebar (Desktop Only) */}
            <Sidebar />

            {/* Main Content Area */}
            <View className="flex-1 relative flex flex-col h-full overflow-hidden">
                <ScrollView
                    className="flex-1 w-full"
                    contentContainerStyle={{ paddingBottom: 150 }} // Space for Chat Input
                    showsVerticalScrollIndicator={false}
                >
                    {children}
                </ScrollView>
            </View>
        </View>
    );
};
