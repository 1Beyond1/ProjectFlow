/**
 * 账户管理组件
 * 显示用户信息或登录/注册入口
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useAuthStore } from '../store/useAuthStore';
import { useLanguageStore } from '../store/useLanguageStore';
import { useDialogStore } from '../store/useDialogStore';

export function AccountSection() {
    const { user, isLoggedIn, isLoading, error, login, register, logout, clearError } = useAuthStore();
    const { t } = useLanguageStore();
    const { showDialog } = useDialogStore();

    const [showAuthModal, setShowAuthModal] = useState(false);
    const [isLoginMode, setIsLoginMode] = useState(true);

    // 表单状态
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [nickname, setNickname] = useState('');

    const resetForm = () => {
        setUsername('');
        setPassword('');
        setConfirmPassword('');
        setNickname('');
        clearError();
    };

    const handleAuth = async () => {
        if (isLoginMode) {
            const success = await login(username, password);
            if (success) {
                setShowAuthModal(false);
                resetForm();
            }
        } else {
            if (password !== confirmPassword) {
                showDialog({
                    title: t('common.error'),
                    message: t('account.alert.passwordMismatch'),
                    actions: [{ label: t('common.confirm'), variant: 'primary' }],
                });
                return;
            }
            if (password.length < 6) {
                showDialog({
                    title: t('common.error'),
                    message: t('account.alert.passwordLength'),
                    actions: [{ label: t('common.confirm'), variant: 'primary' }],
                });
                return;
            }
            const registeredUser = await register(username, password, nickname);
            if (registeredUser) {
                setShowAuthModal(false);
                resetForm();
                showDialog({
                    title: t('account.alert.registerSuccess'),
                    message: registeredUser.uid
                        ? `${t('account.alert.registerWelcome')} ${registeredUser.uid}`
                        : t('account.alert.registerWelcome'),
                    actions: [{ label: t('common.confirm'), variant: 'primary' }],
                });
            }
        }
    };

    const handleLogout = () => {
        showDialog({
            title: t('account.alert.logout.title'),
            message: t('account.alert.logout.message'),
            actions: [
                { label: t('common.cancel'), variant: 'secondary' },
                { label: t('common.confirm'), variant: 'destructive', onPress: logout },
            ],
        });
    };

    // 已登录状态
    if (isLoggedIn && user) {
        return (
            <TouchableOpacity
                className="bg-white p-4 rounded-2xl mb-4 border border-[#E6E1D6]"
                onPress={() => showDialog({
                    title: t('account.alert.info.title'),
                    message: `${t('account.info.uid')}: ${user.uid}\n${t('account.info.username')}: ${user.username}\n${t('account.info.nickname')}: ${user.nickname || t('account.info.nickname.unset')}\n${t('account.info.tier')}: ${user.tier === 'vip' ? t('account.tier.vip') : t('account.tier.free')}`,
                    actions: [
                        { label: t('common.close'), variant: 'secondary' },
                        { label: t('settings.account.logout'), variant: 'destructive', onPress: logout },
                    ],
                })}
            >
                <View className="flex-row items-center">
                    {/* 头像 */}
                    <View className="w-14 h-14 rounded-full bg-[#FFF0E0] items-center justify-center mr-4">
                        {user.avatar_url ? (
                            <Image
                                source={{ uri: user.avatar_url }}
                                className="w-14 h-14 rounded-full"
                            />
                        ) : (
                            <Ionicons name="person" size={28} color={Colors.primary} />
                        )}
                    </View>

                    {/* 用户信息 */}
                    <View className="flex-1">
                        <Text className="text-lg font-bold text-[#2C2420]">
                            {user.nickname || user.username}
                        </Text>
                        <Text className="text-sm text-[#8C847E]">
                            {t('account.info.uid')}: {user.uid} · {user.tier === 'vip' ? `⭐ ${t('account.tier.vip')}` : t('account.tier.free')}
                        </Text>
                    </View>

                    <Ionicons name="chevron-forward" size={20} color={Colors.textSubtle} />
                </View>
            </TouchableOpacity>
        );
    }

    // 未登录状态
    return (
        <>
            <TouchableOpacity
                className="bg-white p-4 rounded-2xl mb-4 border border-[#E6E1D6]"
                onPress={() => { setIsLoginMode(true); setShowAuthModal(true); }}
            >
                <View className="flex-row items-center">
                    <View className="w-14 h-14 rounded-full bg-[#F5F5F5] items-center justify-center mr-4">
                        <Ionicons name="person-outline" size={28} color={Colors.textSubtle} />
                    </View>
                    <View className="flex-1">
                        <Text className="text-lg font-bold text-[#2C2420]">{t('account.card.title')}</Text>
                        <Text className="text-sm text-[#8C847E]">{t('account.card.subtitle')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.textSubtle} />
                </View>
            </TouchableOpacity>

            {/* 登录/注册弹窗 */}
            <Modal
                visible={showAuthModal}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowAuthModal(false)}
            >
                <View className="flex-1 bg-[#FDFBF7] p-6 pt-12">
                    {/* 标题 */}
                    <View className="flex-row items-center justify-between mb-8">
                        <TouchableOpacity onPress={() => { setShowAuthModal(false); resetForm(); }}>
                            <Ionicons name="close" size={28} color={Colors.textMain} />
                        </TouchableOpacity>
                        <Text className="text-2xl font-bold text-[#2C2420]">
                            {isLoginMode ? t('account.modal.login') : t('account.modal.register')}
                        </Text>
                        <View style={{ width: 28 }} />
                    </View>

                    {/* 表单 */}
                    <View className="space-y-4">
                        <View>
                            <Text className="text-sm text-[#8C847E] mb-2 ml-1">
                                {isLoginMode ? t('account.field.usernameOrUid') : t('account.field.username')}
                            </Text>
                            <TextInput
                                className="bg-white p-4 rounded-xl text-base text-[#2C2420] border border-[#E6E1D6]"
                                value={username}
                                onChangeText={setUsername}
                                placeholder={isLoginMode ? t('account.placeholder.usernameOrUid') : t('account.placeholder.username')}
                                placeholderTextColor="#B0B0B0"
                                autoCapitalize="none"
                            />
                        </View>

                        {!isLoginMode && (
                            <View>
                                <Text className="text-sm text-[#8C847E] mb-2 ml-1">{t('account.field.nickname')}</Text>
                                <TextInput
                                    className="bg-white p-4 rounded-xl text-base text-[#2C2420] border border-[#E6E1D6]"
                                    value={nickname}
                                    onChangeText={setNickname}
                                    placeholder={t('account.placeholder.nickname')}
                                    placeholderTextColor="#B0B0B0"
                                />
                            </View>
                        )}

                        <View>
                            <Text className="text-sm text-[#8C847E] mb-2 ml-1">{t('account.field.password')}</Text>
                            <TextInput
                                className="bg-white p-4 rounded-xl text-base text-[#2C2420] border border-[#E6E1D6]"
                                value={password}
                                onChangeText={setPassword}
                                placeholder={t('account.placeholder.password')}
                                placeholderTextColor="#B0B0B0"
                                secureTextEntry
                            />
                        </View>

                        {!isLoginMode && (
                            <View>
                                <Text className="text-sm text-[#8C847E] mb-2 ml-1">{t('account.field.confirmPassword')}</Text>
                                <TextInput
                                    className="bg-white p-4 rounded-xl text-base text-[#2C2420] border border-[#E6E1D6]"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    placeholder={t('account.placeholder.confirmPassword')}
                                    placeholderTextColor="#B0B0B0"
                                    secureTextEntry
                                />
                            </View>
                        )}

                        {/* 错误提示 */}
                        {error && (
                            <Text className="text-red-500 text-center">{error}</Text>
                        )}

                        {/* 提交按钮 */}
                        <TouchableOpacity
                            className="bg-primary p-4 rounded-xl items-center mt-4"
                            onPress={handleAuth}
                            disabled={isLoading}
                            style={{ backgroundColor: Colors.primary }}
                        >
                            {isLoading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white font-bold text-lg">
                                    {isLoginMode ? t('account.modal.login') : t('account.modal.register')}
                                </Text>
                            )}
                        </TouchableOpacity>

                        {/* 切换登录/注册 */}
                        <TouchableOpacity
                            className="items-center py-4"
                            onPress={() => { setIsLoginMode(!isLoginMode); clearError(); }}
                        >
                            <Text className="text-[#8C847E]">
                                {isLoginMode ? t('account.switch.toRegister') : t('account.switch.toLogin')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </>
    );
}
