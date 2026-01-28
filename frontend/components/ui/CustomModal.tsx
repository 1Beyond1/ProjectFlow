import React from 'react';
import { Modal, Text, View, Pressable, StyleSheet, Dimensions, Platform } from 'react-native';
import { Colors } from '../../constants/Colors';
import { BlurView } from 'expo-blur';

export interface ModalAction {
    label: string;
    onPress?: () => void;
    variant?: 'primary' | 'secondary' | 'destructive';
}

interface CustomModalProps {
    visible: boolean;
    title: string;
    message?: string;
    actions: ModalAction[];
    onClose?: () => void;
}

export const CustomModal: React.FC<CustomModalProps> = ({
    visible,
    title,
    message,
    actions,
    onClose
}) => {
    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.centeredView}>
                {/* Backdrop with Blur */}
                {Platform.OS === 'web' ? (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' } as any]} />
                ) : (
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                )}

                <View style={styles.modalView}>
                    <Text style={styles.modalTitle}>{title}</Text>
                    {message && <Text style={styles.modalText}>{message}</Text>}

                    <View style={styles.actionsContainer}>
                        {actions.map((action, index) => (
                            <Pressable
                                key={index}
                                style={({ pressed }) => [
                                    styles.button,
                                    getActionStyle(action.variant),
                                    pressed && { opacity: 0.8 }
                                ]}
                                onPress={() => {
                                    action.onPress?.();
                                    onClose?.();
                                }}
                            >
                                <Text style={[
                                    styles.textStyle,
                                    getActionTextStyle(action.variant)
                                ]}>
                                    {action.label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const getActionStyle = (variant?: string) => {
    switch (variant) {
        case 'primary':
            return { backgroundColor: Colors.primary }; // #ec3f18
        case 'destructive':
            return { backgroundColor: '#ef4444' }; // Red
        case 'secondary':
        default:
            return { backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E5E5E5' };
    }
};

const getActionTextStyle = (variant?: string) => {
    switch (variant) {
        case 'primary':
        case 'destructive':
            return { color: 'white' };
        case 'secondary':
        default:
            return { color: Colors.textMain };
    }
};

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalView: {
        width: Platform.OS === 'web' ? 400 : '85%',
        maxWidth: '90%',
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 10,
    },
    modalTitle: {
        marginBottom: 12,
        textAlign: 'center',
        fontSize: 20,
        fontWeight: 'bold',
        color: Colors.textMain,
    },
    modalText: {
        marginBottom: 24,
        textAlign: 'center',
        fontSize: 15,
        color: Colors.textSubtle,
        lineHeight: 22,
    },
    actionsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        width: '100%',
        flexWrap: 'wrap',
    },
    button: {
        borderRadius: 12,
        paddingHorizontal: 20,
        paddingVertical: 12,
        minWidth: 100,
        elevation: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textStyle: {
        fontWeight: 'bold',
        textAlign: 'center',
        fontSize: 15,
    },
});
