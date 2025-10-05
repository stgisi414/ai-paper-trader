import { useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../src/firebaseConfig';
import { useAuth } from '../src/hooks/useAuth';
import { useNotification } from './useNotification';
import { User } from '../types';

interface UnreadMessageDoc {
    text: string;
    sender: User;
}

export const useUnreadListener = () => {
    const { user } = useAuth();
    const { showNotification } = useNotification();

    useEffect(() => {
        if (!user) return;

        const unreadMessagesRef = collection(db, 'users', user.uid, 'unreadMessages');
        const q = query(unreadMessagesRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' || change.type === 'modified') {
                    const data = change.doc.data() as UnreadMessageDoc;
                    if (data.sender && data.sender.uid !== user.uid) {
                        showNotification({
                            sender: data.sender,
                            text: data.text
                        });
                    }
                }
            });
        });

        return () => unsubscribe();
    }, [user, showNotification]);
};