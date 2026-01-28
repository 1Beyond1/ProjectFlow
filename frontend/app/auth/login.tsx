import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useAuthStore } from '../../store/useAuthStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import { useDialogStore } from '../../store/useDialogStore';

export default function WebAuthScreen() {
    const { user, isLoggedIn, isLoading, error, login, register, clearError } = useAuthStore();
    const { t } = useLanguageStore();
    const { showDialog } = useDialogStore();
    const router = useRouter();

    const [isLoginMode, setIsLoginMode] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [nickname, setNickname] = useState('');

    // Redirect if already logged in
    useEffect(() => {
        if (isLoggedIn && user) {
            router.replace('/');
        }
    }, [isLoggedIn, user]);

    // Cleanup error on unmount or mode switch
    useEffect(() => {
        return () => clearError();
    }, []);

    const handleAuth = async () => {
        if (isLoginMode) {
            const success = await login(username, password);
            if (success) {
                // Router replace handled by useEffect
            }
        } else {
            // Register Validation
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
                showDialog({
                    title: t('account.alert.registerSuccess'),
                    message: registeredUser.uid
                        ? `${t('account.alert.registerWelcome')} ${registeredUser.uid}`
                        : t('account.alert.registerWelcome'),
                    actions: [{
                        label: t('common.confirm'),
                        variant: 'primary',
                        onPress: () => {
                            // Optionally switch to login mode or auto-login (register usually auto-logs-in in store?)
                            // If register auto-logs in, useEffect will handle redirect.
                            // If not, maybe switch to login mode.
                            // Assuming backend login is needed or store updates state.
                        }
                    }],
                });
            }
        }
    };

    const toggleMode = () => {
        setIsLoginMode(!isLoginMode);
        clearError();
        // Reset form fields? Maybe keep username
    };

    return (
        <View className="flex-1 bg-[#FDFBF7] items-center justify-center p-4">
            {/* Header / Logo */}
            <View className="absolute top-8 left-8 flex-row items-center gap-2 cursor-pointer" onTouchEnd={() => router.replace('/')}>
                <View className="size-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30" style={{ width: 40, height: 40, backgroundColor: Colors.primary }}>
                    <Ionicons name="flower" size={24} color="white" />
                </View>
                <Text className="text-xl font-extrabold tracking-tight" style={{ color: Colors.textMain }}>FlowRemind</Text>
            </View>

            <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} className="w-full max-w-md">
                <View className="bg-white p-8 rounded-3xl shadow-xl border border-[#EFE8E6] w-full">

                    <View className="items-center mb-8">
                        <View className="size-16 rounded-full bg-[#FFF0E0] items-center justify-center mb-4">
                            <Ionicons name={isLoginMode ? "log-in" : "person-add"} size={32} color={Colors.primary} />
                        </View>
                        <Text className="text-2xl font-bold text-[#2C2420]">
                            {isLoginMode ? t('account.modal.login') : t('account.modal.register')}
                        </Text>
                        <Text className="text-[#8C847E] mt-2 text-center">
                            {isLoginMode ? t('account.card.subtitle') : t('account.switch.toRegister')}
                        </Text>
                    </View>

                    <View className="space-y-4 gap-4">
                        {/* Username */}
                        <View>
                            <Text className="text-sm font-bold text-[#8C847E] mb-2 ml-1">
                                {isLoginMode ? t('account.field.usernameOrUid') : t('account.field.username')}
                            </Text>
                            <TextInput
                                className="bg-[#F9F9F9] p-4 rounded-xl text-base text-[#2C2420] border border-[#E6E1D6] focus:border-primary transition-colors outline-none"
                                value={username}
                                onChangeText={setUsername}
                                placeholder={isLoginMode ? t('account.placeholder.usernameOrUid') : t('account.placeholder.username')}
                                placeholderTextColor="#B0B0B0"
                                autoCapitalize="none"
                                style={{ outlineStyle: 'none' } as any}
                            />
                        </View>

                        {/* Nickname (Register Only) */}
                        {!isLoginMode && (
                            <View>
                                <Text className="text-sm font-bold text-[#8C847E] mb-2 ml-1">{t('account.field.nickname')}</Text>
                                <TextInput
                                    className="bg-[#F9F9F9] p-4 rounded-xl text-base text-[#2C2420] border border-[#E6E1D6] focus:border-primary transition-colors outline-none"
                                    value={nickname}
                                    onChangeText={setNickname}
                                    placeholder={t('account.placeholder.nickname')}
                                    placeholderTextColor="#B0B0B0"
                                    style={{ outlineStyle: 'none' } as any}
                                />
                            </View>
                        )}

                        {/* Password */}
                        <View>
                            <Text className="text-sm font-bold text-[#8C847E] mb-2 ml-1">{t('account.field.password')}</Text>
                            <TextInput
                                className="bg-[#F9F9F9] p-4 rounded-xl text-base text-[#2C2420] border border-[#E6E1D6] focus:border-primary transition-colors outline-none"
                                value={password}
                                onChangeText={setPassword}
                                placeholder={t('account.placeholder.password')}
                                placeholderTextColor="#B0B0B0"
                                secureTextEntry
                                style={{ outlineStyle: 'none' } as any}
                            />
                        </View>

                        {/* Confirm Password (Register Only) */}
                        {!isLoginMode && (
                            <View>
                                <Text className="text-sm font-bold text-[#8C847E] mb-2 ml-1">{t('account.field.confirmPassword')}</Text>
                                <TextInput
                                    className="bg-[#F9F9F9] p-4 rounded-xl text-base text-[#2C2420] border border-[#E6E1D6] focus:border-primary transition-colors outline-none"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    placeholder={t('account.placeholder.confirmPassword')}
                                    placeholderTextColor="#B0B0B0"
                                    secureTextEntry
                                    style={{ outlineStyle: 'none' } as any}
                                />
                            </View>
                        )}

                        {/* Error Message */}
                        {error ? (
                            <View className="bg-red-50 p-3 rounded-xl border border-red-100">
                                <Text className="text-red-500 text-center text-sm">{error}</Text>
                            </View>
                        ) : null}

                        {/* Submit Button */}
                        <TouchableOpacity
                            className="w-full py-4 rounded-xl items-center shadow-lg shadow-primary/20 mt-4 hover:opacity-90 transition-opacity"
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

                        {/* Toggle Mode */}
                        <TouchableOpacity
                            className="items-center py-2"
                            onPress={toggleMode}
                        >
                            <Text className="text-[#8C847E] hover:text-primary transition-colors cursor-pointer">
                                {isLoginMode ? t('account.switch.toRegister') : t('account.switch.toLogin')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Footer Back Link */}
                <TouchableOpacity className="mt-8 items-center" onPress={() => router.replace('/')}>
                    <Text className="text-[#8C847E] font-medium hover:text-primary transition-colors flex-row items-center gap-1">
                        <Ionicons name="arrow-back" size={16} /> {t('common.back')}
                    </Text>
                </TouchableOpacity>

            </ScrollView>
        </View>
    );
}

// Ensure styling via NativeWind
