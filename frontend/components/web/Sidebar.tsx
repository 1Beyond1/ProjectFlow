import React, { useState } from 'react';
import { View, Text, Pressable, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useAuthStore } from '../../store/useAuthStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import { useRouter, usePathname } from 'expo-router';

export const Sidebar = () => {
    const { user, isLoggedIn, logout } = useAuthStore();
    const { t } = useLanguageStore();
    const router = useRouter();
    const pathname = usePathname();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const menuItems = [
        { icon: 'home', label: t('nav.home'), route: '/' },
        { icon: 'calendar', label: t('nav.calendar'), route: '/calendar' },
        { icon: 'checkmark-circle', label: t('nav.tasks'), route: '/tasks' },
        { icon: 'bar-chart', label: t('nav.analytics'), route: '/stats' },
    ];

    const handleProfileClick = () => {
        setIsMenuOpen(!isMenuOpen);
    };

    const handleLogout = () => {
        logout();
        setIsMenuOpen(false);
        router.replace('/auth/login');
    };

    const handleLogin = () => {
        setIsMenuOpen(false);
        router.push('/auth/login');
    };

    const handleSettings = () => {
        setIsMenuOpen(false);
        router.push('/settings');
    };

    return (
        <View className="hidden lg:flex w-24 xl:w-72 flex-col justify-between bg-white h-full border-r border-[#EFE8E6] py-8 px-4 z-20 shadow-sm shrink-0" style={{ height: '100%' }}>
            <View className="flex flex-col gap-10 items-center xl:items-start w-full">
                {/* Logo */}
                <View className="flex-row items-center gap-3 xl:ml-2">
                    <View className="size-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30 shrink-0" style={{ width: 40, height: 40, backgroundColor: Colors.primary }}>
                        <Ionicons name="flower" size={24} color="white" />
                    </View>
                    <Text className="hidden xl:block text-xl font-extrabold tracking-tight" style={{ color: Colors.textMain }}>FlowRemind</Text>
                </View>

                {/* Nav */}
                <View className="w-full">
                    <View className="flex flex-col gap-4 w-full">
                        {menuItems.map((item, index) => {
                            const isHome = item.route === '/';
                            const isActive = isHome
                                ? pathname === '/'
                                : pathname.startsWith(item.route);

                            return (
                                <Pressable
                                    key={index}
                                    onPress={() => router.push(item.route as any)}
                                    className={`flex-row items-center justify-center xl:justify-start gap-4 p-3 rounded-2xl transition-all ${isActive ? 'bg-primary/10' : 'hover:bg-[#F5F0EF]'}`}
                                    style={isActive ? { backgroundColor: Colors.primary + '1A' } : {}}
                                >
                                    <Ionicons
                                        name={(isActive ? item.icon : item.icon + '-outline') as any}
                                        size={24}
                                        color={isActive ? Colors.primary : Colors.textSubtle}
                                    />
                                    <Text
                                        className="hidden xl:block font-bold text-base"
                                        style={{ color: isActive ? Colors.primary : Colors.textSubtle }}
                                    >
                                        {item.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            </View>

            {/* Bottom Profile & Popover */}
            <View className="w-full relative">
                {/* Popover Menu */}
                {isMenuOpen && (
                    <View
                        className="absolute bottom-16 left-0 w-full bg-white rounded-2xl shadow-xl border border-[#EFE8E6] p-2 z-50 mb-2"
                        style={{ shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 }}
                    >
                        {isLoggedIn ? (
                            <>
                                <View className="px-4 py-3 border-b border-[#F5F0EF] mb-2">
                                    <Text className="font-bold text-text-main">{user?.username}</Text>
                                    <Text className="text-xs text-text-muted">{user?.tier === 'vip' ? t('account.tier.vip') : t('account.tier.free')}</Text>
                                </View>
                                <Pressable onPress={handleSettings} className="flex-row items-center gap-3 p-3 rounded-xl hover:bg-[#F5F0EF]">
                                    <Ionicons name="settings-outline" size={20} color={Colors.textSubtle} />
                                    <Text style={{ color: Colors.textMain }}>{t('settings.title')}</Text>
                                </Pressable>
                                <Pressable onPress={handleLogout} className="flex-row items-center gap-3 p-3 rounded-xl hover:bg-[#FFF0F0]">
                                    <Ionicons name="log-out-outline" size={20} color="#FF4D4D" />
                                    <Text style={{ color: '#FF4D4D' }}>{t('settings.account.logout')}</Text>
                                </Pressable>
                            </>
                        ) : (
                            <>
                                <Pressable onPress={handleLogin} className="flex-row items-center gap-3 p-3 rounded-xl hover:bg-[#F5F0EF]">
                                    <Ionicons name="log-in-outline" size={20} color={Colors.primary} />
                                    <Text style={{ color: Colors.textMain }}>{t('common.loginRegister')}</Text>
                                </Pressable>
                                <Pressable onPress={handleSettings} className="flex-row items-center gap-3 p-3 rounded-xl hover:bg-[#F5F0EF]">
                                    <Ionicons name="settings-outline" size={20} color={Colors.textSubtle} />
                                    <Text style={{ color: Colors.textMain }}>{t('settings.title')}</Text>
                                </Pressable>
                            </>
                        )}
                    </View>
                )}

                {/* Profile Bar */}
                <Pressable
                    onPress={handleProfileClick}
                    className="flex-row items-center justify-between xl:justify-start gap-3 p-3 rounded-2xl cursor-pointer hover:bg-[#F5F0EF] transition-colors border border-transparent hover:border-[#EFE8E6]"
                    style={isMenuOpen ? { backgroundColor: '#F5F0EF' } : {}}
                >
                    <View
                        className="size-10 rounded-full border-2 border-white shadow-sm overflow-hidden bg-cover bg-center shrink-0"
                        style={{ width: 40, height: 40, backgroundColor: Colors.sand }}
                    >
                        {user?.avatar_url ? (
                            <Image source={{ uri: user.avatar_url }} style={{ width: 40, height: 40 }} />
                        ) : (
                            <View className="w-full h-full items-center justify-center bg-primary/20">
                                <Text className="text-primary font-bold">{user?.username?.[0]?.toUpperCase() || 'G'}</Text>
                            </View>
                        )}
                    </View>

                    <View className="hidden xl:flex flex-1 flex-row items-center justify-between overflow-hidden">
                        <View className="overflow-hidden mr-2">
                            <Text className="text-sm font-bold truncate" numberOfLines={1} style={{ color: Colors.textMain }}>
                                {user?.username || t('common.guest')}
                            </Text>
                            <Text className="text-xs truncate" numberOfLines={1} style={{ color: Colors.textSubtle }}>
                                {isLoggedIn ? (user?.tier === 'vip' ? t('account.tier.vip') : t('account.tier.free')) : t('account.status.notLoggedIn')}
                            </Text>
                        </View>
                        <Ionicons name={isMenuOpen ? "chevron-down" : "settings-outline"} size={20} color={Colors.textSubtle} />
                    </View>
                </Pressable>
            </View>
        </View>
    );
};
