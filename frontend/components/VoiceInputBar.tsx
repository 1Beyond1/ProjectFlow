/**
 * 语音输入条组件
 * 底部固定的输入区域，支持文字输入和语音录制
 */
import React, { useState, useEffect } from 'react';
import { View, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useTaskStore } from '../store/useTaskStore';
import { useConfigStore } from '../store/useConfigStore';
import { processAudio, processText, processImage, cancelCurrentRequest } from '../services/api';
import { useDebugStore, ProcessingPhase } from '../store/useDebugStore';
import { RecordButton } from './RecordButton';
import { useLanguageStore } from '../store/useLanguageStore';
import { useDialogStore } from '../store/useDialogStore';

export function VoiceInputBar() {
    const [textInput, setTextInput] = useState('');
    const [isInternalProcessing, setIsInternalProcessing] = useState(false);
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
        const showSubscription = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
            setKeyboardVisible(true);
        });
        const hideSubscription = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
            setKeyboardVisible(false);
        });

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    const {
        isRecording,
        isPreparing,
        duration,
        error,
        startRecording,
        stopRecording,
        clearError,
    } = useAudioRecorder();

    const { addTask, addRecord, setLoading } = useTaskStore();
    const { sttApiKey, llmApiKey } = useConfigStore();
    const { t, language } = useLanguageStore();
    const { showDialog } = useDialogStore();

    const sanitizeServerMessage = (message: string) => {
        if (language === 'en' && /[\u4e00-\u9fff]/.test(message)) {
            return t('alert.processFailed.unknown');
        }
        return message;
    };

    // 格式化时长
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getResizeAction = (width: number, height: number, longEdge: number) => {
        if (width >= height) {
            return { resize: { width: longEdge } };
        }
        return { resize: { height: longEdge } };
    };

    const getFileSize = async (uri: string) => {
        const response = await fetch(uri);
        const blob = await response.blob();
        return blob.size;
    };

    const preprocessImage = async (uri: string, width: number, height: number) => {
        const first = await manipulateAsync(
            uri,
            [getResizeAction(width, height, 1600)],
            { compress: 0.7, format: SaveFormat.JPEG }
        );
        let size = await getFileSize(first.uri);
        if (size <= 500 * 1024) return first.uri;

        const second = await manipulateAsync(
            first.uri,
            [getResizeAction(first.width, first.height, 1280)],
            { compress: 0.7, format: SaveFormat.JPEG }
        );
        size = await getFileSize(second.uri);
        if (size <= 500 * 1024) return second.uri;

        return null;
    };

    // 通用处理结果方法
    const handleResult = (result: any, source: 'audio' | 'text' | 'image') => {
        if (result.success && result.ai_result) {
            // 添加任务
            result.ai_result.tasks.forEach((task: any) => {
                addTask({
                    title: task.title,
                    time: task.time || undefined,
                    timestamp: task.timestamp || undefined,
                    location: task.location || undefined,
                    suggestion: task.suggestion || undefined,
                    priority: task.priority || 'normal',
                    subtasks: task.subtasks || [],
                    audioPath: source === 'audio' ? result.raw_text : undefined,
                });
            });

            // 添加记录
            addRecord({
                rawText: result.raw_text,
                tasks: result.ai_result.tasks.map((t: any, i: number) => ({
                    id: `${Date.now()}-${i}`,
                    title: t.title,
                    time: t.time || undefined,
                    location: t.location || undefined,
                    suggestion: t.suggestion || undefined,
                    priority: t.priority || 'normal',
                    completed: false,
                    subtasks: (t.subtasks || []).map((sub: string, subIndex: number) => ({
                        id: `${Date.now()}-${i}-${subIndex}`,
                        title: sub,
                        completed: false
                    })),
                    createdAt: new Date().toISOString(),
                })),
                rawAiResponse: result,
                createdAt: new Date().toISOString(),
            });


            // 不显示成功提示，避免打断用户
        } else {
            if (result.error === 'Request cancelled') return; // 忽略取消请求的错误
            const errorMessage = result.error ? sanitizeServerMessage(result.error) : t('alert.processFailed.unknown');
            showDialog({
                title: t('alert.processFailed.title'),
                message: errorMessage,
                actions: [{ label: t('common.confirm'), variant: 'primary' }],
            });
        }
    };

    // 处理音频
    const handleAudioProcess = async (audioUri: string) => {
        setIsInternalProcessing(true);
        setLoading(true);

        try {
            const result = await processAudio(audioUri);
            handleResult(result, 'audio');
        } catch (error) {
            const errorMessage = error instanceof Error ? sanitizeServerMessage(error.message) : t('alert.audioProcessFailed');
            showDialog({
                title: t('common.error'),
                message: errorMessage,
                actions: [{ label: t('common.confirm'), variant: 'primary' }],
            });
        } finally {
            setIsInternalProcessing(false);
            setLoading(false);
        }
    };

    // 处理文字输入提交
    const handleTextSubmit = async () => {
        const text = textInput.trim();
        if (!text) return;



        setIsInternalProcessing(true);
        setLoading(true);
        setTextInput(''); // 立即清空，提升体验

        try {
            const result = await processText(text);
            handleResult(result, 'text');
        } catch (error) {
            const errorMessage = error instanceof Error ? sanitizeServerMessage(error.message) : t('alert.textProcessFailed');
            showDialog({
                title: t('common.error'),
                message: errorMessage,
                actions: [{ label: t('common.confirm'), variant: 'primary' }],
            });
            setTextInput(text); // 失败恢复输入
        } finally {
            setIsInternalProcessing(false);
            setLoading(false);
        }
    };

    const handleImagePress = async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
            showDialog({
                title: t('common.tip'),
                message: t('alert.permissionDenied'),
                actions: [{ label: t('common.confirm'), variant: 'primary' }],
            });
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 1,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) return;

        const asset = result.assets[0];
        if (!asset.uri || !asset.width || !asset.height) {
            showDialog({
                title: t('common.error'),
                message: t('alert.imageInvalid'),
                actions: [{ label: t('common.confirm'), variant: 'primary' }],
            });
            return;
        }

        setIsInternalProcessing(true);
        setLoading(true);

        // 初始化 Debug 状态
        const debug = useDebugStore.getState();
        debug.reset();
        debug.setPhase(ProcessingPhase.Uploading);
        debug.addLog(t('api.log.processImage.start') || 'Starting image processing...');
        debug.setProgress(10);

        try {
            const processedUri = await preprocessImage(asset.uri, asset.width, asset.height);
            if (!processedUri) {
                showDialog({
                    title: t('common.error'),
                    message: t('alert.imageTooLarge'),
                    actions: [{ label: t('common.confirm'), variant: 'primary' }],
                });
                return;
            }

            debug.addLog('图片预处理完成，准备上传...');
            debug.setProgress(20);

            debug.addLog('正在调用后端接口...');
            const apiResult = await processImage(processedUri);
            handleResult(apiResult, 'image');
        } catch (error) {
            const errorMessage = error instanceof Error ? sanitizeServerMessage(error.message) : t('alert.processFailed.unknown');
            showDialog({
                title: t('common.error'),
                message: errorMessage,
                actions: [{ label: t('common.confirm'), variant: 'primary' }],
            });
        } finally {
            setIsInternalProcessing(false);
            setLoading(false);

            // Reset debug state if not completed/error
            const debug = useDebugStore.getState();
            if (debug.currentPhase !== ProcessingPhase.Completed && debug.currentPhase !== ProcessingPhase.Error) {
                debug.setPhase(ProcessingPhase.Idle);
            }
        }
    };

    // 处理录音按钮点击
    const handleRecordPress = async () => {
        const debug = useDebugStore.getState();


        if (isRecording) {
            // 停止录音并处理
            setIsInternalProcessing(true);  // 立即显示加载状态
            setLoading(true);
            debug.setPhase(ProcessingPhase.Compressing);
            debug.addLog(t('log.record.stopProcessing'));

            const audioUri = await stopRecording();
            if (audioUri) {
                await handleAudioProcess(audioUri);
            } else {
                setIsInternalProcessing(false);
                setLoading(false);
            }
        } else {
            // 开始录音
            debug.reset();
            debug.setPhase(ProcessingPhase.Recording);
            debug.addLog(t('log.record.start'));
            await startRecording();
        }
    };

    // 显示错误
    useEffect(() => {
        if (error) {
            showDialog({
                title: t('alert.recordingError'),
                message: sanitizeServerMessage(error),
                actions: [{ label: t('common.confirm'), variant: 'primary' }],
            });
            clearError();
        }
    }, [error, clearError, t, language]);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            className="absolute bottom-0 left-0 w-full z-20"
        >
            <View className="px-4" style={{ paddingBottom: isKeyboardVisible ? 12 : 110 }}>
                <View className="flex-row items-center" style={{ gap: 12 }}>
                    <TouchableOpacity
                        className="w-12 h-12 rounded-full items-center justify-center border"
                        style={{ backgroundColor: '#FFF0E0', borderColor: '#E6E1D6' }}
                        onPress={handleImagePress}
                        disabled={isInternalProcessing || isPreparing || isRecording}
                    >
                        <Ionicons name="add" size={24} color={Colors.primary} />
                    </TouchableOpacity>

                    <View
                        className="flex-1 flex-row items-center rounded-full p-1.5 pr-2"
                        style={{ backgroundColor: Colors.inputBg }}
                    >
                        {/* 文字输入框 */}
                        <View className="pl-4 flex-1">
                            <TextInput
                                className="text-base text-textMain max-h-[100px]"
                                style={{
                                    textAlignVertical: 'center',
                                    paddingVertical: 0,
                                    includeFontPadding: false
                                }}
                                placeholder={t('input.placeholder')}
                                placeholderTextColor={Colors.textSubtle + 'B0'}
                                value={textInput}
                                onChangeText={setTextInput}
                                multiline
                                blurOnSubmit={false}
                                returnKeyType="send"
                                onSubmitEditing={handleTextSubmit}
                                editable={!isRecording && !isInternalProcessing && !isPreparing}
                            />
                        </View>

                        {/* 发送按钮 (有文字时) */}
                        {textInput.length > 0 && !isInternalProcessing && (
                            <Pressable
                                className="w-10 h-10 rounded-full items-center justify-center ml-2 bg-primary"
                                onPress={handleTextSubmit}
                            >
                                <Ionicons name="arrow-up" size={24} color="white" />
                            </Pressable>
                        )}

                        {/* 取消按钮 (处理中) */}
                        {isInternalProcessing && (
                            <TouchableOpacity
                                className="w-10 h-10 rounded-full items-center justify-center ml-2 bg-red-500"
                                onPress={cancelCurrentRequest}
                            >
                                <ActivityIndicator size="small" color="white" className="absolute" />
                                <View className="absolute inset-0 items-center justify-center">
                                    <Ionicons name="stop" size={10} color="white" />
                                </View>
                            </TouchableOpacity>
                        )}

                        {/* 语音按钮 (仅在无文字且未处理时显示) */}
                        {textInput.length === 0 && !isInternalProcessing && (
                            <View className="ml-2">
                                <RecordButton
                                    isRecording={isRecording}
                                    isPreparing={isPreparing}
                                    isProcessing={isInternalProcessing}
                                    duration={duration}
                                    onPress={handleRecordPress}
                                />
                            </View>
                        )}
                    </View>
                </View>
            </View>
        </KeyboardAvoidingView>
    );

}
