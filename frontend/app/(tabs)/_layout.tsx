/**
 * Tab 导航布局
 * 底部四个 Tab：首页、日历、统计、设置
 */
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { View, useWindowDimensions, Platform } from 'react-native';
import { useLanguageStore } from '../../store/useLanguageStore';

import { FocusTimerWidget } from '../../components/FocusTimerWidget';

export default function TabLayout() {
    const { t } = useLanguageStore();
    const { width } = useWindowDimensions();
    const isDesktop = width >= 1024;

    return (
        <View style={{ flex: 1 }}>
            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarActiveTintColor: Colors.primary,
                    tabBarInactiveTintColor: Colors.textSubtle + '99',
                    tabBarStyle: {
                        position: isDesktop ? undefined : 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 88,
                        backgroundColor: Colors.background + 'F5',
                        borderTopWidth: 1,
                        borderTopColor: 'rgba(0,0,0,0.05)',
                        paddingBottom: 20,
                        paddingTop: 8,
                        display: isDesktop ? 'none' : 'flex',
                    },
                    tabBarLabelStyle: {
                        fontSize: 10,
                        fontWeight: '500',
                    },
                }}
            >
                <Tabs.Screen
                    name="index"
                    options={{
                        title: t('nav.today'),
                        tabBarIcon: ({ focused, color }) => (
                            <Ionicons
                                name={focused ? 'home' : 'home-outline'}
                                size={26}
                                color={color}
                            />
                        ),
                    }}
                />

                <Tabs.Screen
                    name="tasks"
                    options={{
                        href: Platform.OS === 'web' ? '/tasks' : null,
                        title: t('nav.tasks') || 'Tasks',
                        tabBarIcon: ({ focused, color }) => (
                            <Ionicons
                                name={focused ? 'checkbox' : 'checkbox-outline'}
                                size={26}
                                color={color}
                            />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="calendar"
                    options={{
                        title: t('nav.calendar'),
                        tabBarIcon: ({ focused, color }) => (
                            <Ionicons
                                name={focused ? 'calendar' : 'calendar-outline'}
                                size={26}
                                color={color}
                            />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="stats"
                    options={{
                        title: t('nav.stats'),
                        tabBarIcon: ({ focused, color }) => (
                            <Ionicons
                                name={focused ? 'bar-chart' : 'bar-chart-outline'}
                                size={26}
                                color={color}
                            />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="settings"
                    options={{
                        title: t('nav.settings'),
                        tabBarIcon: ({ focused, color }) => (
                            <Ionicons
                                name={focused ? 'settings' : 'settings-outline'}
                                size={26}
                                color={color}
                            />
                        ),
                    }}
                />
            </Tabs>

            {/* Global Focus Timer Widget */}
            <FocusTimerWidget />
        </View>
    );
}
