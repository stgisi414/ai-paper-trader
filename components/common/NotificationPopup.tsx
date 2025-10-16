import React from 'react';
import { useNotification } from '../../hooks/useNotification';
import { MessageSquareIcon, XIcon } from './Icons'; // Import XIcon
import { useNavigate } from 'react-router-dom';

const NotificationPopup: React.FC = () => {
    const { notification, hideNotification, openChatWith } = useNotification();
    const navigate = useNavigate();

    if (!notification) {
        return null;
    }

    const handleActionClick = () => {
        if (notification.sender.uid === 'system' && notification.ticker) {
            navigate(`/stock/${notification.ticker}`);
        } else {
            openChatWith(notification.sender);
        }
        hideNotification();
    };

    // ADDITION: Handler for the ignore button
    const handleIgnoreClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // This is crucial to prevent the main click handler from firing
        hideNotification();
    };

    return (
        <div 
            className="fixed top-20 right-6 z-50 bg-night-700 p-4 rounded-lg shadow-2xl cursor-pointer hover:bg-night-600 animate-pulse"
            onClick={handleActionClick}
        >
            {/* FIX: Adjust layout to space out content and button */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <MessageSquareIcon className="w-6 h-6 text-brand-blue flex-shrink-0" />
                    <div>
                        <p className="font-bold text-yellow-500">{notification.sender.displayName === 'System Alert' ? 'Price Alert' : `New message from ${notification.sender.displayName}`}</p>
                        <p className="text-sm text-night-100 truncate max-w-xs">{notification.text}</p>
                    </div>
                </div>
                
                {/* ADDITION: Ignore Button */}
                <button
                    onClick={handleIgnoreClick}
                    className="p-1 -mr-2 -mt-2 rounded-full text-night-500 hover:bg-night-600 hover:text-white transition-colors flex-shrink-0"
                    aria-label="Ignore notification"
                >
                    <XIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export default NotificationPopup;