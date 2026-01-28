import React, { useState, useRef } from 'react';
import { View, TextInput, Pressable, ActivityIndicator, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useAuthStore } from '../../store/useAuthStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import * as ImagePicker from 'expo-image-picker';
import { compressImage } from '../../utils/imageUtils';
import { useBanCheck } from '../../hooks/useBanCheck';
import { useConfigStore } from '../../store/useConfigStore';
import { useDialogStore } from '../../store/useDialogStore';

export const WebChatInput = ({ onSendText, onSendAudio }: { onSendText: (text: string) => void, onSendAudio?: (uri: string) => void }) => {
    const [inputValue, setInputValue] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const { t } = useLanguageStore();
    const { checkBanStatus } = useBanCheck();
    const { showDialog } = useDialogStore();

    // Timer ref
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const handleSend = () => {
        if (!inputValue.trim()) return;
        if (!checkBanStatus()) return;

        onSendText(inputValue);
        setInputValue('');
    };

    const handleImageUpload = async () => {
        if (!checkBanStatus()) return;

        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 1, // Start high, let compressImage handle loop
            });

            if (!result.canceled && result.assets[0]) {
                setIsUploading(true);
                // Compress logic
                const compressed = await compressImage(result.assets[0].uri);
                console.log('Compressed Image:', compressed);

                // For now, just show a dialog or send placeholder logic 
                // In real app, this would upload to server or pass base64 to LLM
                // Since user asked for "Pre-processing", we assume upload logic is separate or merged with text

                showDialog({
                    title: t('web.chat.imageProcessedTitle'),
                    message: `${t('web.chat.imageProcessedPrefix')}${((compressed.base64?.length || 0) * 0.75 / 1024).toFixed(2)} KB${t('web.chat.imageProcessedSuffix')}`,
                    actions: [{ label: t('common.confirm'), variant: 'primary' }]
                });

                setIsUploading(false);
            }
        } catch (error) {
            console.error(error);
            setIsUploading(false);
            showDialog({
                title: t('common.error'),
                message: t('web.chat.imageProcessFailed'),
                actions: [{ label: t('common.confirm'), variant: 'primary' }]
            });
        }
    };

    const startRecording = () => {
        if (!checkBanStatus()) return;
        setIsRecording(true);
        setRecordingDuration(0);

        timerRef.current = setInterval(() => {
            setRecordingDuration(prev => prev + 1);
        }, 1000);

        // Actual Audio recording logic would go here (using expo-audio / expo-av)
        // For UI demo:
        console.log('Start Web Recording...');
    };

    const stopRecording = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);
        console.log('Stop Web Recording...');
        // onSendAudio(mockUri);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <View className="absolute bottom-6 left-4 right-4 lg:left-1/2 lg:-translate-x-1/2 lg:w-[600px] z-30">
            <View
                className="rounded-full p-2 flex-row items-center gap-2 border backdrop-blur-xl transition-all shadow-lg"
                style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    shadowColor: 'rgba(0,0,0,0.15)',
                    shadowOffset: { width: 0, height: 20 },
                    shadowOpacity: 1,
                    shadowRadius: 60
                }}
            >
                {/* Image Upload Button */}
                <Pressable
                    onPress={handleImageUpload}
                    disabled={isUploading}
                    className="size-10 rounded-full items-center justify-center shrink-0 hover:bg-primary/10 hover:text-primary transition-colors"
                    style={{ width: 40, height: 40, backgroundColor: '#F5F0EF' }}
                >
                    {isUploading ? (
                        <ActivityIndicator size="small" color={Colors.textSubtle} />
                    ) : (
                        <Ionicons name="add" size={24} color={Colors.textSubtle} />
                    )}
                </Pressable>

                {/* Text Input */}
                <TextInput
                    className="flex-1 bg-transparent border-none focus:ring-0 font-medium text-base h-10 px-2 outline-none" // outline-none for web
                    style={{ color: Colors.textMain }}
                    placeholder={t('input.placeholder') || "What's on your mind? Type or speak..."}
                    placeholderTextColor={Colors.textSubtle}
                    value={inputValue}
                    onChangeText={setInputValue}
                    onSubmitEditing={handleSend}
                    editable={!isRecording}
                />

                {/* Right Actions */}
                <View className="flex-row items-center gap-2">
                    {/* Recording Timer (Left of Mic) */}
                    {isRecording && (
                        <Text className="text-primary font-bold mr-2">
                            {formatTime(recordingDuration)}
                        </Text>
                    )}

                    {/* Mic / Send Button */}
                    {inputValue.length > 0 ? (
                        <Pressable
                            onPress={handleSend}
                            className="size-10 rounded-full items-center justify-center shrink-0 shadow-lg shadow-primary/30 transition-colors hover:bg-primary/90"
                            style={{ width: 40, height: 40, backgroundColor: Colors.primary }}
                        >
                            <Ionicons name="arrow-up" size={20} color="white" />
                        </Pressable>
                    ) : (
                        <Pressable
                            onPress={isRecording ? stopRecording : startRecording}
                            className={`size-10 rounded-full items-center justify-center shrink-0 shadow-lg shadow-primary/30 transition-colors ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-primary hover:bg-primary/90'}`}
                            style={{ width: 40, height: 40, backgroundColor: isRecording ? '#ef4444' : Colors.primary }}
                        >
                            <Ionicons name={isRecording ? "square" : "mic"} size={20} color="white" />
                        </Pressable>
                    )}
                </View>
            </View>
        </View>
    );
};
