/**
 * 音频录制 Hook
 * 使用 expo-av 进行音频录制，配置为低比特率 AAC 格式
 */
import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { useLanguageStore } from '../store/useLanguageStore';

export interface RecordingState {
    isRecording: boolean;
    isPreparing: boolean;
    duration: number;
    audioUri: string | null;
    error: string | null;
}

export function useAudioRecorder() {
    const { t } = useLanguageStore();
    const [state, setState] = useState<RecordingState>({
        isRecording: false,
        isPreparing: false,
        duration: 0,
        audioUri: null,
        error: null,
    });

    const recordingRef = useRef<Audio.Recording | null>(null);
    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // 请求录音权限
    const requestPermission = useCallback(async () => {
        try {
            const { granted } = await Audio.requestPermissionsAsync();
            if (!granted) {
                setState(prev => ({
                    ...prev,
                    error: t('error.microphonePermission'),
                }));
                return false;
            }
            return true;
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: t('error.permissionRequestFailed'),
            }));
            return false;
        }
    }, [t]);

    // 开始录音
    const startRecording = useCallback(async () => {
        try {
            setState(prev => ({ ...prev, isPreparing: true, error: null }));

            // 检查权限
            const hasPermission = await requestPermission();
            if (!hasPermission) {
                setState(prev => ({ ...prev, isPreparing: false }));
                return;
            }

            // 配置音频模式
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            // 录音配置 - 适配 STT API (WAV/WebM)
            const recordingOptions: Audio.RecordingOptions = {
                android: {
                    extension: '.webm',
                    outputFormat: Audio.AndroidOutputFormat.WEBM || 6,
                    audioEncoder: Audio.AndroidAudioEncoder.AAC, // WebM 容器通常支持
                    sampleRate: 16000,
                    numberOfChannels: 1,
                    bitRate: 32000,
                },
                ios: {
                    extension: '.wav',
                    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
                    audioQuality: Audio.IOSAudioQuality.HIGH,
                    sampleRate: 16000,
                    numberOfChannels: 1,
                    bitRate: 128000, // 16kHz * 16bit = 256kbps
                    linearPCMBitDepth: 16,
                    linearPCMIsBigEndian: false,
                    linearPCMIsFloat: false,
                },
                web: {
                    mimeType: 'audio/webm',
                    bitsPerSecond: 32000,
                },
            };

            // 创建并开始录音
            const { recording } = await Audio.Recording.createAsync(recordingOptions);
            recordingRef.current = recording;

            // 开始计时
            const startTime = Date.now();
            durationIntervalRef.current = setInterval(() => {
                setState(prev => ({
                    ...prev,
                    duration: Math.floor((Date.now() - startTime) / 1000),
                }));
            }, 1000);

            setState(prev => ({
                ...prev,
                isRecording: true,
                isPreparing: false,
                duration: 0,
                audioUri: null,
            }));

        } catch (error) {
            console.error('Failed to start recording:', error);
            setState(prev => ({
                ...prev,
                isPreparing: false,
                error: t('error.recordingStartFailed'),
            }));
        }
    }, [requestPermission, t]);

    // 停止录音
    const stopRecording = useCallback(async () => {
        try {
            // 停止计时
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
                durationIntervalRef.current = null;
            }

            if (!recordingRef.current) {
                setState(prev => ({ ...prev, isRecording: false }));
                return null;
            }

            // 停止录音
            await recordingRef.current.stopAndUnloadAsync();
            const uri = recordingRef.current.getURI();
            recordingRef.current = null;

            // 恢复音频模式
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
            });

            setState(prev => ({
                ...prev,
                isRecording: false,
                audioUri: uri,
            }));

            return uri;

        } catch (error) {
            console.error('Failed to stop recording:', error);
            setState(prev => ({
                ...prev,
                isRecording: false,
                error: t('error.recordingStopFailed'),
            }));
            return null;
        }
    }, [t]);

    // 取消录音
    const cancelRecording = useCallback(async () => {
        try {
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
                durationIntervalRef.current = null;
            }

            if (recordingRef.current) {
                await recordingRef.current.stopAndUnloadAsync();
                recordingRef.current = null;
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
            });

            setState({
                isRecording: false,
                isPreparing: false,
                duration: 0,
                audioUri: null,
                error: null,
            });

        } catch (error) {
            console.error('Failed to cancel recording:', error);
        }
    }, []);

    // 清除错误
    const clearError = useCallback(() => {
        setState(prev => ({ ...prev, error: null }));
    }, []);

    return {
        ...state,
        startRecording,
        stopRecording,
        cancelRecording,
        clearError,
    };
}
