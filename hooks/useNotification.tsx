import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User } from '../types';

export interface NotificationPayload {
    sender: User;
    text: string;
}

interface NotificationContextType {
    notification: NotificationPayload | null;
    showNotification: (payload: NotificationPayload) => void;
    hideNotification: () => void;
    openChatWith: (user: User | null) => void;
    chatTarget: User | null;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
    const [notification, setNotification] = useState<NotificationPayload | null>(null);
    const [chatTarget, setChatTarget] = useState<User | null>(null);

    const showNotification = (payload: NotificationPayload) => {
        setNotification(payload);
    };

    const hideNotification = () => {
        setNotification(null);
    };

    const openChatWith = (user: User | null) => {
        setChatTarget(user);
    };

    const value = { notification, showNotification, hideNotification, openChatWith, chatTarget };

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotification = (): NotificationContextType => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};