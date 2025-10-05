// services/chatService.ts
import { collection, onSnapshot, query, orderBy, Timestamp, addDoc } from 'firebase/firestore';
import { db } from '../src/firebaseConfig';
import { User } from 'firebase/auth';

interface ChatMessage {
    id?: string;
    senderId: string;
    text: string;
    timestamp: Timestamp;
}

// Helper to determine a consistent chat room ID regardless of who initiates
const getChatRoomId = (userId1: string, userId2: string): string => {
    return [userId1, userId2].sort().join('_');
};

/**
 * Subscribes to messages in a specific chat room.
 */
export const subscribeToChat = (
    currentUserId: string, 
    targetUserId: string, 
    callback: (messages: ChatMessage[]) => void
) => {
    const chatRoomId = getChatRoomId(currentUserId, targetUserId);
    const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
    
    // Order by timestamp to get the correct message sequence
    const q = query(messagesRef, orderBy('timestamp'));

    return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        })) as ChatMessage[];
        callback(messages);
    });
};

/**
 * Sends a new message to the chat room.
 */
export const sendMessage = async (
    sender: User, 
    targetUserId: string, 
    text: string
): Promise<void> => {
    if (!text.trim()) return;

    const chatRoomId = getChatRoomId(sender.uid, targetUserId);
    const messagesRef = collection(db, 'chats', chatRoomId, 'messages');

    await addDoc(messagesRef, {
        senderId: sender.uid,
        text: text,
        timestamp: Timestamp.now(),
    });
};

// Export interfaces for ChatPanel.tsx
export type { ChatMessage };