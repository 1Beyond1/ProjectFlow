import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useDialogStore } from '../store/useDialogStore';
import { Colors } from '../constants/Colors';

export function AppDialog() {
    const { visible, title, message, actions, hideDialog } = useDialogStore();

    const handlePress = (action: { onPress?: () => void }) => {
        hideDialog();
        action.onPress?.();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={hideDialog}
        >
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
                <View
                    className="w-[85%] rounded-2xl p-5 border"
                    style={{
                        backgroundColor: '#FDFBF7',
                        borderColor: '#E6E1D6',
                        shadowColor: '#000',
                        shadowOpacity: 0.12,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 6 },
                        elevation: 6,
                    }}
                >
                    <Text className="text-lg font-bold text-[#2C2420] mb-2">{title}</Text>
                    {!!message && (
                        <Text className="text-sm text-[#8C847E] leading-5 mb-4">{message}</Text>
                    )}

                    <View className="flex-row justify-end" style={{ gap: 10 }}>
                        {actions.map((action, index) => {
                            const variant = action.variant || 'secondary';
                            const isPrimary = variant === 'primary';
                            const isDestructive = variant === 'destructive';
                            return (
                                <TouchableOpacity
                                    key={`${action.label}-${index}`}
                                    onPress={() => handlePress(action)}
                                    className="px-4 py-2 rounded-full border"
                                    style={{
                                        backgroundColor: isPrimary ? Colors.primary : '#F5F5F5',
                                        borderColor: isPrimary ? Colors.primary : '#E6E1D6',
                                    }}
                                >
                                    <Text
                                        className="text-sm font-semibold"
                                        style={{
                                            color: isPrimary ? '#FFFFFF' : isDestructive ? '#D23F3F' : '#2C2420',
                                        }}
                                    >
                                        {action.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </View>
        </Modal>
    );
}
