import React from 'react';
import { useNotification } from '../../hooks/useNotification';
import { MessageSquareIcon } from './Icons';

const NotificationPopup: React.FC = () => {
    const { notification, hideNotification, openChatWith } = useNotification();

    if (!notification) {
        return null;
    }

    const handleClick = () => {
        openChatWith(notification.sender);
        hideNotification();
    };

    return (
        <div 
            className="fixed top-20 right-6 z-50 bg-night-700 p-4 rounded-lg shadow-2xl cursor-pointer hover:bg-night-600 animate-pulse"
            onClick={handleClick}
        >
            <div className="flex items-center gap-3">
                <MessageSquareIcon className="w-6 h-6 text-brand-blue" />
                <div>
                    <p className="font-bold text-white">New message from {notification.sender.displayName}</p>
                    <p className="text-sm text-night-100 truncate max-w-xs">{notification.text}</p>
                </div>
            </div>
        </div>
    );
};

export default NotificationPopup;