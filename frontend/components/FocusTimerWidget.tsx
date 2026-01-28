import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, Dimensions, Animated, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useTimerStore } from '../store/useTimerStore';
import { useLanguageStore } from '../store/useLanguageStore';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

export const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const FocusTimerWidget = () => {
    const { timeLeft, status, pause, resume, stop, duration, tick, reset, mode } = useTimerStore();
    const { t } = useLanguageStore();
    const [fullScreenVisible, setFullScreenVisible] = useState(false);
    const [widgetSize, setWidgetSize] = useState({ width: 0, height: 0 });
    const [hasInitialPosition, setHasInitialPosition] = useState(false);
    const pan = useRef(new Animated.ValueXY()).current;

    // Auto-open full screen when timer starts (optional, maybe just show widget)
    // useEffect(() => {
    //     if (status === 'running' && !fullScreenVisible) setFullScreenVisible(true);
    // }, [status]);

    useEffect(() => {
        if (status !== 'running') return;
        const timer = setInterval(() => tick(), 1000);
        return () => clearInterval(timer);
    }, [status, tick]);

    useEffect(() => {
        if (hasInitialPosition || widgetSize.width === 0 || widgetSize.height === 0) return;
        const margin = 20;
        const bottomOffset = 100;
        const initialX = Math.max(0, width - widgetSize.width - margin);
        const initialY = Math.max(0, height - widgetSize.height - bottomOffset);
        pan.setValue({ x: initialX, y: initialY });
        setHasInitialPosition(true);
    }, [hasInitialPosition, widgetSize, pan]);

    const clampPosition = (x: number, y: number) => {
        const margin = 12;
        const maxX = Math.max(margin, width - widgetSize.width - margin);
        const maxY = Math.max(margin, height - widgetSize.height - margin);
        return {
            x: Math.min(Math.max(margin, x), maxX),
            y: Math.min(Math.max(margin, y), maxY),
        };
    };

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gesture) =>
                Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
            onPanResponderGrant: () => {
                pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
                pan.setValue({ x: 0, y: 0 });
            },
            onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
            onPanResponderRelease: () => {
                pan.flattenOffset();
                const current = { x: (pan.x as any)._value || 0, y: (pan.y as any)._value || 0 };
                pan.setValue(clampPosition(current.x, current.y));
            },
        })
    ).current;

    if (status === 'idle' && !fullScreenVisible) return null;

    const progress = duration > 0
        ? (mode === 'countdown' ? timeLeft / duration : Math.min(timeLeft / duration, 1))
        : 0;

    return (
        <>
            {/* Minimal Floating Widget (Bottom Right) */}
            {!fullScreenVisible && status !== 'idle' && (
                <Animated.View style={[styles.floatingContainer, { transform: pan.getTranslateTransform() }]} {...panResponder.panHandlers}>
                    <TouchableOpacity
                        style={styles.floatingContent}
                        onLayout={(event) => {
                            const { width: layoutWidth, height: layoutHeight } = event.nativeEvent.layout;
                            if (layoutWidth !== widgetSize.width || layoutHeight !== widgetSize.height) {
                                setWidgetSize({ width: layoutWidth, height: layoutHeight });
                            }
                        }}
                        onPress={() => setFullScreenVisible(true)}
                        activeOpacity={0.8}
                    >
                        <View style={styles.floatingIcon}>
                            <Ionicons name="timer" size={20} color={'#FFFFFF'} />
                        </View>
                        <Text style={styles.floatingText}>{formatTime(timeLeft)}</Text>
                        <View style={[styles.progressRing, {
                            borderRightColor: 'transparent',
                            borderBottomColor: 'transparent',
                            transform: [{ rotate: `${(1 - progress) * 360}deg` }]
                        }]} />
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* Full Screen Modal */}
            <Modal
                visible={fullScreenVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setFullScreenVisible(false)}
            >
                <View style={styles.modalContainer}>
                    {/* Background Blur */}
                    {Platform.OS === 'ios' ? (
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                    ) : (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.85)' }]} />
                    )}

                    <View style={styles.modalContent}>
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <TouchableOpacity
                                onPress={() => setFullScreenVisible(false)}
                                style={styles.minimizeBtn}
                            >
                                <Ionicons name="chevron-down" size={24} color="rgba(255,255,255,0.7)" />
                            </TouchableOpacity>
                        </View>

                        {/* Main Timer */}
                        <View style={styles.timerCircleContainer}>
                            <View style={styles.timerCircle}>
                                <Text style={styles.timerLargeText}>{formatTime(timeLeft)}</Text>
                                <Text style={styles.timerStatusText}>
                                    {status === 'paused' ? t('timer.paused') || 'Paused' : t('timer.focusing') || 'Focusing'}
                                </Text>
                            </View>
                        </View>

                        {/* Controls */}
                        <View style={styles.controlsContainer}>
                            {/* Reset */}
                            <TouchableOpacity
                                style={[styles.controlBtn, styles.resetBtn]}
                                onPress={() => reset()}
                            >
                                <Ionicons name="refresh" size={22} color={'#FFFFFF'} />
                            </TouchableOpacity>

                            {/* Stop/Give Up */}
                            <TouchableOpacity
                                style={[styles.controlBtn, styles.stopBtn]}
                                onPress={() => {
                                    stop();
                                    setFullScreenVisible(false);
                                }}
                            >
                                <Ionicons name="stop" size={24} color={'#FFFFFF'} />
                            </TouchableOpacity>

                            {/* Play/Pause */}
                            <TouchableOpacity
                                style={[styles.controlBtn, styles.mainBtn]}
                                onPress={status === 'running' ? pause : resume}
                            >
                                <Ionicons
                                    name={status === 'running' ? "pause" : "play"}
                                    size={36}
                                    color={Colors.textMain}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    floatingContainer: {
        position: 'absolute',
        left: 0,
        top: 0,
        borderRadius: 25,
        backgroundColor: Colors.textMain,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
        zIndex: 9999,
    },
    floatingContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    floatingIcon: {
        marginRight: 8,
    },
    floatingText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
        fontVariant: ['tabular-nums'],
    },
    progressRing: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        borderWidth: 2,
        borderColor: Colors.primary,
        borderRadius: 25,
    },

    // Modal Styles
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 60,
    },
    modalHeader: {
        width: '100%',
        paddingHorizontal: 20,
        alignItems: 'flex-start',
    },
    minimizeBtn: {
        padding: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    timerCircleContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    timerCircle: {
        width: 280,
        height: 280,
        borderRadius: 140,
        borderWidth: 4,
        borderColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    timerLargeText: {
        fontSize: 64,
        fontWeight: '200',
        color: '#FFFFFF',
        fontVariant: ['tabular-nums'],
    },
    timerStatusText: {
        fontSize: 18,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 10,
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    controlsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 30,
        marginBottom: 40,
    },
    controlBtn: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
    resetBtn: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    stopBtn: {
        backgroundColor: 'rgba(255,59,48,0.2)', // Red tint
        borderWidth: 1,
        borderColor: 'rgba(255,59,48,0.5)',
    },
    mainBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.primary,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
    }
});
