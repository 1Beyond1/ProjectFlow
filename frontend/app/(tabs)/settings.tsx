import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, LayoutAnimation, UIManager } from 'react-native';
import { useConfigStore } from '../../store/useConfigStore';
import { useTaskStore } from '../../store/useTaskStore';
import { useDebugStore, ProcessingPhase } from '../../store/useDebugStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import { useDialogStore } from '../../store/useDialogStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { router } from 'expo-router';
import { testConnection, processText, cancelCurrentRequest, fetchWithAuth } from '../../services/api';
import { AccountSection } from '../../components/AccountSection';

type ModelEntry = {
    id: string;
    name: string;
    vendor?: string;
    tier?: 'free' | 'vip';
    tiers?: string[];
    is_default?: boolean;
    available?: boolean;
    tag?: string;
};

type ModelLimits = { limit: number; remaining: number };

type ModelResponse = {
    tier: string;
    models: {
        llm: ModelEntry[];
        vision: ModelEntry[];
        stt: ModelEntry[];
    };
    limits: {
        text: ModelLimits;
        vision: ModelLimits;
        stt: ModelLimits;
    };
};

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SettingsScreen() {
    const config = useConfigStore();
    const { records, clearRecords } = useTaskStore();
    const { language, setLanguage, autoDetect, setAutoDetect, t } = useLanguageStore();
    const { showDialog } = useDialogStore();
    const { accessToken, user, logout } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [modelData, setModelData] = useState<ModelResponse | null>(null);
    const [isModelLoading, setModelLoading] = useState(false);
    // 开发者选项折叠状态
    const [isDeveloperExpanded, setDeveloperExpanded] = useState(false);

    const toggleDeveloperPanel = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setDeveloperExpanded(!isDeveloperExpanded);
    };

    // 调试状态
    const debug = useDebugStore();

    // 测试文本处理
    const handleTestText = async () => {
        if (!debug.isMonitorOpen) debug.setMonitorOpen(true);
        await processText(t('settings.monitor.simulate.text'));
    };

    const formatRemaining = (value: number) => (value < 0 ? t('common.unlimited') : `${value}`);

    const loadModels = async () => {
        if (!config.apiUrl) return;
        setModelLoading(true);
        try {
            const response = await fetchWithAuth(`${config.apiUrl.replace(/\/$/, '')}/api/models`, {
                headers: {
                    'Accept': 'application/json',
                    'X-Device-ID': config.deviceId || 'unknown-device',
                },
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                if (payload?.code === 'ACCOUNT_BANNED' || payload?.detail === '账户已被封禁') {
                    logout();
                    showDialog({
                        title: t('alert.accountBanned.title'),
                        message: t('alert.accountBanned.message'),
                        actions: [{ label: t('common.confirm'), variant: 'primary' }],
                    });
                    return;
                }
                showDialog({
                    title: t('common.error'),
                    message: payload?.detail || t('alert.processFailed.unknown'),
                    actions: [{ label: t('common.confirm'), variant: 'primary' }],
                });
                return;
            }

            setModelData(payload as ModelResponse);
        } catch (error) {
            showDialog({
                title: t('common.error'),
                message: error instanceof Error ? error.message : t('alert.processFailed.unknown'),
                actions: [{ label: t('common.confirm'), variant: 'primary' }],
            });
        } finally {
            setModelLoading(false);
        }
    };

    useEffect(() => {
        loadModels();
    }, [config.apiUrl, accessToken, user?.tier]);

    useEffect(() => {
        if (!modelData) return;
        const defaultLlm = modelData.models.llm.find((m) => m.is_default)?.id;
        const defaultVision = modelData.models.vision.find((m) => m.is_default)?.id;
        const defaultStt = modelData.models.stt.find((m) => m.is_default)?.id;

        if (defaultLlm && !modelData.models.llm.some((m) => m.id === config.llmModel)) {
            config.setLlmModel(defaultLlm);
        }
        if (defaultVision && !modelData.models.vision.some((m) => m.id === config.visionModel)) {
            config.setVisionModel(defaultVision);
        }
        if (defaultStt && !modelData.models.stt.some((m) => m.id === config.sttModel)) {
            config.setSttModel(defaultStt);
        }
    }, [modelData]);

    // 获取阶段对应的颜色
    const getPhaseColor = () => {
        switch (debug.currentPhase) {
            case ProcessingPhase.Error: return Colors.error;
            case ProcessingPhase.Completed: return Colors.success;
            default: return Colors.primary;
        }
    };

    // 获取阶段描述
    const getPhaseText = () => {
        switch (debug.currentPhase) {
            case ProcessingPhase.Idle: return t('settings.monitor.status.waiting');
            case ProcessingPhase.Recording: return t('settings.monitor.status.recording');
            case ProcessingPhase.Compressing: return t('settings.monitor.status.compressing');
            case ProcessingPhase.Uploading: return t('settings.monitor.status.uploading');
            case ProcessingPhase.ProcessingSTT: return t('settings.monitor.status.processingStt');
            case ProcessingPhase.ProcessingLLM: return t('settings.monitor.status.processingLlm');
            case ProcessingPhase.Completed: return t('settings.monitor.status.completed');
            case ProcessingPhase.Error: return t('settings.monitor.status.error');
            default: return '';
        }
    };

    const handleTestConnection = async () => {
        setLoading(true);
        const result = await testConnection();
        setLoading(false);

        showDialog({
            title: result.success ? t('settings.alert.connection.success') : t('settings.alert.connection.failure'),
            message: result.message,
            actions: [{ label: t('common.confirm'), variant: 'primary' }],
        });
    };

    const handleReset = () => {
        showDialog({
            title: t('settings.alert.reset.title'),
            message: t('settings.alert.reset.message'),
            actions: [
                { label: t('common.cancel'), variant: 'secondary' },
                { label: t('common.confirm'), variant: 'destructive', onPress: config.resetConfig },
            ],
        });
    };

    const handleSave = () => {
        showDialog({
            title: t('settings.alert.save.title'),
            message: t('settings.alert.save.message'),
            actions: [{ label: t('common.confirm'), variant: 'primary' }],
        });
    };

    const renderTierTag = (entry: ModelEntry) => {
        const tiers = entry.tiers && entry.tiers.length > 0 ? entry.tiers : (entry.tier ? [entry.tier] : ['free']);
        return (
            <View className="flex-row items-center" style={{ gap: 6 }}>
                {tiers.map((tier) => {
                    const label = tier === 'vip' ? t('common.tag.vip') : t('common.tag.free');
                    const color = tier === 'vip' ? '#D6A14D' : '#5B8C5A';
                    return (
                        <View key={tier} className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}20` }}>
                            <Text className="text-xs font-semibold" style={{ color }}>{label}</Text>
                        </View>
                    );
                })}
            </View>
        );
    };

    const renderModelGroup = (
        title: string,
        models: ModelEntry[],
        selectedId: string,
        onSelect: (id: string) => void
    ) => (
        <View className="mb-4">
            <Text className="text-sm font-semibold text-[#8C847E] mb-2">{title}</Text>
            <View style={{ gap: 8 }}>
                {models.map((model) => {
                    const isSelected = selectedId === model.id;
                    const isAvailable = model.available !== false;
                    return (
                        <TouchableOpacity
                            key={model.id}
                            className="bg-[#F8F6F1] p-3 rounded-xl border"
                            style={{
                                borderColor: isSelected ? Colors.primary : '#E6E1D6',
                                opacity: isAvailable ? 1 : 0.5,
                            }}
                            onPress={() => {
                                if (!isAvailable) {
                                    showDialog({
                                        title: t('alert.permissionDeniedTitle'),
                                        message: t('alert.permissionDeniedMessage'),
                                        actions: [
                                            { label: t('common.cancel'), variant: 'secondary' },
                                            { label: t('common.upgradeVip'), variant: 'primary' },
                                        ],
                                    });
                                    return;
                                }
                                onSelect(model.id);
                            }}
                        >
                            <View className="flex-row items-center justify-between">
                                <View style={{ gap: 6 }}>
                                    <Text className="text-base font-semibold text-[#2C2420]">{model.name}</Text>
                                    <View className="flex-row items-center" style={{ gap: 6 }}>
                                        {renderTierTag(model)}
                                        <View className="px-2 py-0.5 rounded-full bg-[#EFE9DF]">
                                            <Text className="text-xs text-[#8C847E]">{model.vendor || 'Vendor'}</Text>
                                        </View>
                                        {model.tag && (
                                            <View className="px-2 py-0.5 rounded-full bg-[#d24d32]/10">
                                                <Text className="text-xs text-[#d24d32] font-medium">{model.tag}</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                                {isSelected && (
                                    <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1, backgroundColor: '#FDFBF7' }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 100 }}
                keyboardShouldPersistTaps="handled"
            >
                <View className="p-6 pt-12" style={{ gap: 16 }}>
                    <View className="flex-row items-center mb-4">
                        {Platform.OS === 'web' && (
                            <TouchableOpacity
                                onPress={() => router.back()}
                                className="mr-4 p-2 -ml-2 rounded-full active:bg-gray-100"
                            >
                                <Ionicons name="arrow-back" size={24} color={Colors.textMain} />
                            </TouchableOpacity>
                        )}
                        <Text className="text-3xl font-bold text-[#2C2420]">{t('settings.title')}</Text>
                    </View>



                    {/* 账户管理 */}
                    <AccountSection />

                    {/* 语言设置 */}
                    <View className="bg-white p-4 rounded-2xl border border-[#E6E1D6]">
                        <View className="flex-row items-center mb-4">
                            <Ionicons name="language-outline" size={24} color={Colors.primary} />
                            <Text className="text-lg font-semibold text-[#2C2420] ml-2">{t('settings.language')}</Text>
                        </View>
                        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                            <TouchableOpacity
                                className={`px-4 py-2 rounded-full ${autoDetect ? 'bg-primary' : 'bg-[#F5F5F5]'}`}
                                style={autoDetect ? { backgroundColor: Colors.primary } : {}}
                                onPress={() => setAutoDetect(true)}
                            >
                                <Text className={autoDetect ? 'text-white font-medium' : 'text-[#8C847E]'}>{t('settings.language.auto')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className={`px-4 py-2 rounded-full ${!autoDetect && language === 'zh-CN' ? 'bg-primary' : 'bg-[#F5F5F5]'}`}
                                style={!autoDetect && language === 'zh-CN' ? { backgroundColor: Colors.primary } : {}}
                                onPress={() => setLanguage('zh-CN')}
                            >
                                <Text className={!autoDetect && language === 'zh-CN' ? 'text-white font-medium' : 'text-[#8C847E]'}>简体中文</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className={`px-4 py-2 rounded-full ${!autoDetect && language === 'en' ? 'bg-primary' : 'bg-[#F5F5F5]'}`}
                                style={!autoDetect && language === 'en' ? { backgroundColor: Colors.primary } : {}}
                                onPress={() => setLanguage('en')}
                            >
                                <Text className={!autoDetect && language === 'en' ? 'text-white font-medium' : 'text-[#8C847E]'}>English</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Event Management (Moved here as requested) */}
                    <TouchableOpacity
                        className="bg-white p-4 rounded-2xl flex-row items-center justify-between border border-[#E6E1D6]"
                        onPress={() => router.push('/settings/events')}
                    >
                        <View className="flex-row items-center">
                            <View className="w-10 h-10 rounded-full bg-[#E0E7FF] items-center justify-center mr-3">
                                <Ionicons name="list" size={20} color="#4338CA" />
                            </View>
                            <View>
                                <Text className="text-lg font-bold text-[#2C2420]">{t('settings.events.title')}</Text>
                                <Text className="text-sm text-[#8C847E]">{t('settings.events.subtitle')}</Text>
                            </View>
                        </View>
                        <Ionicons name="chevron-forward" size={24} color={Colors.textSubtle} />
                    </TouchableOpacity>

                    {/* 模型设置 */}
                    <View className="bg-white p-4 rounded-2xl border border-[#E6E1D6]">
                        <View className="flex-row items-center justify-between mb-4">
                            <View className="flex-row items-center">
                                <Ionicons name="layers-outline" size={24} color={Colors.primary} />
                                <Text className="text-lg font-semibold text-[#2C2420] ml-2">{t('settings.models.title')}</Text>
                            </View>
                            <TouchableOpacity onPress={loadModels} className="px-3 py-1 rounded-full border border-[#E6E1D6]">
                                <Text className="text-xs font-semibold text-[#8C847E]">{t('common.refresh')}</Text>
                            </TouchableOpacity>
                        </View>

                        {isModelLoading ? (
                            <View className="py-6 items-center">
                                <ActivityIndicator color={Colors.primary} />
                            </View>
                        ) : modelData ? (
                            <View>
                                {renderModelGroup(t('settings.models.group.llm'), modelData.models.llm, config.llmModel, config.setLlmModel)}
                                {renderModelGroup(t('settings.models.group.vision'), modelData.models.vision, config.visionModel, config.setVisionModel)}
                                {renderModelGroup(t('settings.models.group.stt'), modelData.models.stt, config.sttModel, config.setSttModel)}

                                <View className="bg-[#F8F6F1] p-3 rounded-xl border border-[#E6E1D6]">
                                    <Text className="text-sm font-semibold text-[#2C2420] mb-2">{t('settings.models.remaining.title')}</Text>
                                    <View className="flex-row justify-between mb-1">
                                        <Text className="text-xs text-[#8C847E]">{t('settings.models.remaining.text')}</Text>
                                        <Text className="text-xs text-[#2C2420]">{formatRemaining(modelData.limits.text.remaining)}</Text>
                                    </View>
                                    <View className="flex-row justify-between mb-1">
                                        <Text className="text-xs text-[#8C847E]">{t('settings.models.remaining.vision')}</Text>
                                        <Text className="text-xs text-[#2C2420]">{formatRemaining(modelData.limits.vision.remaining)}</Text>
                                    </View>
                                    <View className="flex-row justify-between">
                                        <Text className="text-xs text-[#8C847E]">{t('settings.models.remaining.stt')}</Text>
                                        <Text className="text-xs text-[#2C2420]">{formatRemaining(modelData.limits.stt.remaining)}</Text>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <Text className="text-sm text-[#8C847E]">{t('settings.models.empty')}</Text>
                        )}
                    </View>

                    {/* 开发者选项折叠面板 */}
                    <TouchableOpacity
                        className="bg-white p-4 rounded-2xl flex-row items-center justify-between border border-[#E6E1D6]"
                        onPress={toggleDeveloperPanel}
                    >
                        <View className="flex-row items-center">
                            <View className="w-10 h-10 rounded-full bg-[#FFF0E0] items-center justify-center mr-3">
                                <Ionicons name="code-slash" size={20} color={Colors.primary} />
                            </View>
                            <View>
                                <Text className="text-lg font-bold text-[#2C2420]">{t('settings.developer')}</Text>
                                <Text className="text-sm text-[#8C847E]">{t('settings.developer.subtitle')}</Text>
                            </View>
                        </View>
                        <Ionicons
                            name={isDeveloperExpanded ? "chevron-up" : "chevron-down"}
                            size={24}
                            color={Colors.textSubtle}
                        />
                    </TouchableOpacity>

                    {/* 开发者选项内容 (可折叠) */}
                    {isDeveloperExpanded && (
                        <View style={{ gap: 16 }}>
                            {/* 系统状态监控按钮 */}
                            <TouchableOpacity
                                className="bg-white p-4 rounded-xl flex-row items-center justify-between border border-[#E6E1D6]"
                                onPress={() => debug.setMonitorOpen(true)}
                            >
                                <View className="flex-row items-center">
                                    <View className="w-8 h-8 rounded-full bg-[#E8F5E9] items-center justify-center mr-3">
                                        <Ionicons name="pulse" size={18} color={Colors.success} />
                                    </View>
                                    <Text className="text-lg font-bold text-[#2C2420]">{t('settings.developer.monitor')}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={Colors.textSubtle} />
                            </TouchableOpacity>

                            {/* 后端服务配置 (只读) */}
                            <View className="bg-white p-4 rounded-2xl shadow-sm border border-[#E6E1D6]">
                                <View className="flex-row items-center mb-4">
                                    <Ionicons name="server-outline" size={24} color={Colors.primary} />
                                    <Text className="text-lg font-semibold text-[#2C2420] ml-2">{t('settings.developer.backendInfo')}</Text>
                                </View>
                                <View className="bg-[#F8F6F1] p-4 rounded-xl mb-4">
                                    <View className="flex-row justify-between mb-2">
                                        <Text className="text-[#8C847E]">{t('settings.api.url')}</Text>
                                        <Text className="font-mono text-[#2C2420]">{config.apiUrl || t('common.unset')}</Text>
                                    </View>
                                    <Text className="text-xs text-[#DA5D35] mt-2">
                                        {t('settings.developer.backendInfo.note')}
                                    </Text>
                                </View>
                                <View className="bg-[#F8F6F1] p-4 rounded-xl">
                                    <Text className="text-[#8C847E] mb-2 font-medium">{t('settings.developer.managed.title')}</Text>
                                    <Text className="text-sm text-[#2C2420] leading-5">
                                        {t('settings.developer.managed.description')}
                                    </Text>
                                </View>
                            </View>

                            {/* 操作按钮 */}
                            <View className="flex-row space-x-3 mt-4" style={{ gap: 12 }}>
                                <TouchableOpacity
                                    className="flex-1 bg-[#F5F5F5] py-4 rounded-3xl items-center flex-row justify-center border border-[#E0E0E0]"
                                    onPress={handleReset}
                                >
                                    <Ionicons name="refresh" size={20} color="#757575" />
                                    <Text className="text-[#757575] font-bold ml-2 text-lg">{t('common.reset')}</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    className="flex-1 bg-white py-4 rounded-3xl items-center flex-row justify-center border border-[#E6E1D6]"
                                    onPress={handleTestConnection}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <ActivityIndicator color={Colors.primary} />
                                    ) : (
                                        <>
                                            <Ionicons name="flash-outline" size={20} color={Colors.primary} />
                                            <Text className="text-[#DA5D35] font-bold ml-2 text-lg">{t('settings.api.test')}</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View >

                            <TouchableOpacity
                                className="bg-[#DA5D35] py-4 rounded-3xl items-center flex-row justify-center shadow-sm mt-2"
                                onPress={handleSave}
                            >
                                <Ionicons name="save-outline" size={20} color="white" />
                                <Text className="text-white font-bold ml-2 text-lg">{t('settings.api.save')}</Text>
                            </TouchableOpacity>
                            {/* 交互日志 */}
                            <View className="mb-8">
                                <View className="flex-row justify-between items-center mb-4">
                                    <Text className="text-xl font-bold text-[#2C2420]">{t('settings.debug.logs.title')}</Text>
                                    <TouchableOpacity onPress={clearRecords} className="bg-[#f0eadd] px-3 py-1.5 rounded-full border border-[#d6d0c0]">
                                        <View className="flex-row items-center">
                                            <Ionicons name="trash-outline" size={14} color="#DA5D35" />
                                            <Text className="text-[#DA5D35] text-xs font-bold ml-1">{t('settings.debug.logs.clear')}</Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                                {records && records.length > 0 ? (
                                    records.map((record: any) => (
                                        <View key={record.id} className="bg-white p-4 rounded-xl mb-4 border border-[#E6E1D6]">
                                            <Text className="text-xs text-[#8C847E] mb-2">
                                                {new Date(record.createdAt).toLocaleString()}
                                            </Text>
                                            <Text className="font-bold text-[#2C2420] mb-2">{t('settings.debug.logs.input')}: {record.rawText}</Text>

                                            {record.rawAiResponse && (
                                                <View className="bg-[#F8F6F1] p-2 rounded-lg mt-2">
                                                    <Text className="text-xs text-[#8C847E] font-mono">
                                                        {JSON.stringify(record.rawAiResponse, null, 2)}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    ))
                                ) : (
                                    <Text className="text-[#8C847E]">{t('settings.debug.logs.empty')}</Text>
                                )}
                            </View>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* 系统状态监控 Modal */}
            <Modal
                visible={debug.isMonitorOpen}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => debug.setMonitorOpen(false)}
            >
                <View className="flex-1 bg-[#FAF9F6] p-6 pt-12">
                    <View className="flex-row justify-between items-center mb-8">
                        <Text className="text-2xl font-bold text-[#2C2420]">{t('settings.monitor.title')}</Text>
                        <TouchableOpacity
                            onPress={() => debug.setMonitorOpen(false)}
                            className="bg-gray-200 p-2 rounded-full"
                        >
                            <Ionicons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>

                    {/* 状态总览 */}
                    <View className="bg-white p-6 rounded-2xl shadow-sm mb-6 border border-[#E6E1D6] items-center">
                        <View className="w-16 h-16 rounded-full mb-4 items-center justify-center" style={{ backgroundColor: getPhaseColor() + '20' }}>
                            <Ionicons name="pulse" size={32} color={getPhaseColor()} />
                        </View>
                        <Text className="text-xl font-bold mb-2" style={{ color: getPhaseColor() }}>
                            {getPhaseText()}
                        </Text>

                        {/* 进度条 */}
                        <View className="w-full h-3 bg-gray-100 rounded-full mt-4 overflow-hidden">
                            <View
                                className="h-full rounded-full"
                                style={{
                                    width: `${debug.progress}%`,
                                    backgroundColor: getPhaseColor()
                                }}
                            />
                        </View>
                        <Text className="text-xs text-gray-400 mt-2 font-mono">{debug.progress.toFixed(0)}%</Text>
                    </View>

                    {/* 控制台日志 */}
                    <View className="flex-1 bg-black rounded-xl p-4 mb-6">
                        <View className="flex-row justify-between items-center border-b border-gray-800 pb-2 mb-2">
                            <Text className="text-gray-400 text-xs">{t('settings.monitor.console.title')}</Text>
                            <TouchableOpacity onPress={debug.clearLogs} className="bg-[#2C2420] px-3 py-1.5 rounded-lg border border-gray-700">
                                <Text className="text-[#DA5D35] text-xs font-bold">{t('settings.monitor.console.clear')}</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView className="flex-1">
                            {debug.logs.length === 0 ? (
                                <Text className="text-gray-600 font-mono text-xs">{t('settings.monitor.console.empty')}</Text>
                            ) : (
                                debug.logs.map((log, index) => (
                                    <Text key={index} className="text-green-400 font-mono text-xs mb-1">
                                        {log}
                                    </Text>
                                ))
                            )}
                        </ScrollView>
                    </View>

                    {/* 快捷测试 */}
                    {/* 底部操作按钮 */}
                    {debug.currentPhase !== ProcessingPhase.Idle &&
                        debug.currentPhase !== ProcessingPhase.Completed &&
                        debug.currentPhase !== ProcessingPhase.Error ? (
                        <TouchableOpacity
                            className="bg-red-500 py-4 rounded-xl items-center flex-row justify-center"
                            onPress={cancelCurrentRequest}
                        >
                            <Ionicons name="stop-circle" size={20} color="white" />
                            <Text className="text-white font-bold ml-2">{t('settings.monitor.cancel')}</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            className="bg-[#2C2420] py-4 rounded-xl items-center flex-row justify-center"
                            onPress={handleTestText}
                        >
                            <Ionicons name="play-circle" size={20} color="white" />
                            <Text className="text-white font-bold ml-2">{t('settings.monitor.simulate')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Modal >
        </KeyboardAvoidingView >
    );
}
