import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
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

    const showNotification = useCallback((payload: NotificationPayload) => {
        setNotification(payload);
    }, []); // Correctly memoized: stable
    
    const hideNotification = useCallback(() => {
        setNotification(null);
    }, []); // Correctly memoized: stable

    const openChatWith = useCallback((user: User | null) => {
        setChatTarget(user);
    }, []); // Correctly memoized: stable

    const value = useMemo(() => ({
        notification,
        showNotification,
        hideNotification,
        openChatWith,
        chatTarget
    }), [notification, showNotification, hideNotification, openChatWith, chatTarget]);

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