/**
 * 录音按钮组件
 * 带动画效果的麦克风按钮
 */
import React from 'react';
import { View, Pressable, Animated, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

interface RecordButtonProps {
    isRecording: boolean;
    isPreparing: boolean;
    isProcessing?: boolean;  // 正在处理音频
    duration: number;
    onPress: () => void;
}

export function RecordButton({
    isRecording,
    isPreparing,
    isProcessing = false,
    duration,
    onPress,
}: RecordButtonProps) {
    // 格式化时长显示
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <View className="flex-row items-center">
            {/* 录音时长显示 (左侧) */}
            {isRecording && (
                <View className="mr-2 px-3 py-1 rounded-full" style={{ backgroundColor: Colors.error + '20' }}>
                    <Text className="text-sm font-medium" style={{ color: Colors.error }}>
                        {formatDuration(duration)}
                    </Text>
                </View>
            )}

            {/* 按钮 */}
            <Pressable
                onPress={onPress}
                disabled={isPreparing}
                style={({ pressed }) => ({
                    opacity: pressed ? 0.8 : 1,
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
            >
                <View
                    className="h-12 w-12 rounded-full items-center justify-center shadow-md"
                    style={{
                        backgroundColor: isRecording ? Colors.error : Colors.primary,
                    }}
                >
                    {isProcessing ? (
                        <ActivityIndicator size="small" color={Colors.textLight} />
                    ) : isPreparing ? (
                        <Ionicons name="hourglass" size={22} color={Colors.textLight} />
                    ) : isRecording ? (
                        <Ionicons name="stop" size={22} color={Colors.textLight} />
                    ) : (
                        <Ionicons name="mic" size={22} color={Colors.textLight} />
                    )}
                </View>
            </Pressable>
        </View>
    );
}
