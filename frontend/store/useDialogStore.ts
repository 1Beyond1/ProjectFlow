import { create } from 'zustand';

export type DialogAction = {
    label: string;
    variant?: 'primary' | 'secondary' | 'destructive';
    onPress?: () => void;
};

interface DialogState {
    visible: boolean;
    title: string;
    message?: string;
    actions: DialogAction[];
    showDialog: (payload: { title: string; message?: string; actions?: DialogAction[] }) => void;
    hideDialog: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
    visible: false,
    title: '',
    message: '',
    actions: [],
    showDialog: ({ title, message, actions }) =>
        set({
            visible: true,
            title,
            message,
            actions: actions && actions.length > 0 ? actions : [{ label: 'OK', variant: 'primary' }],
        }),
    hideDialog: () =>
        set({
            visible: false,
            title: '',
            message: '',
            actions: [],
        }),
}));
