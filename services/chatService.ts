import { collection, onSnapshot, query, orderBy, Timestamp, addDoc, doc, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../src/firebaseConfig';
import { User as FirebaseAuthUser } from 'firebase/auth';
import { User } from '../types';

export interface ChatMessage {
    id?: string;
    senderId: string;
    text: string;
    timestamp: Timestamp;
    senderDisplayName: string;
    senderPhotoURL: string;
}

const getChatRoomId = (userId1: string, userId2: string): string => {
    return [userId1, userId2].sort().join('_');
};

export const subscribeToChat = (
    currentUserId: string, 
    targetUserId: string, 
    callback: (messages: ChatMessage[]) => void
) => {
    const chatRoomId = getChatRoomId(currentUserId, targetUserId);
    const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
    
    const q = query(messagesRef, orderBy('timestamp'));

    return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        })) as ChatMessage[];
        callback(messages);
    });
};

export const sendMessage = async (
    sender: FirebaseAuthUser, 
    targetUser: User, 
    text: string
): Promise<void> => {
    if (!text.trim()) return;

    const chatRoomId = getChatRoomId(sender.uid, targetUser.uid);
    const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
    const messageTimestamp = Timestamp.now();

    // 1. Add the message to the chat room
    await addDoc(messagesRef, {
        senderId: sender.uid,
        text: text,
        timestamp: messageTimestamp,
        senderDisplayName: sender.displayName,
        senderPhotoURL: sender.photoURL,
    });

    // 2. Create a notification document for the recipient
    const notificationRef = doc(db, 'users', targetUser.uid, 'unreadMessages', sender.uid);
    await setDoc(notificationRef, {
        text: text,
        timestamp: messageTimestamp,
        sender: {
            uid: sender.uid,
            displayName: sender.displayName,
            email: sender.email,
            photoURL: sender.photoURL,
        }
    });

    // 3. Update chat history for both users to enable recent chats list
    const senderHistoryRef = doc(db, 'users', sender.uid, 'chatHistory', targetUser.uid);
    await setDoc(senderHistoryRef, {
        // These fields are about the other user (the recipient)
        displayName: targetUser.displayName,
        email: targetUser.email,
        photoURL: targetUser.photoURL,
        // These fields are about the interaction
        lastMessage: text,
        timestamp: messageTimestamp,
    }, { merge: true });

    const targetHistoryRef = doc(db, 'users', targetUser.uid, 'chatHistory', sender.uid);
    await setDoc(targetHistoryRef, {
        // These fields are about the other user (the sender)
        displayName: sender.displayName,
        email: sender.email,
        photoURL: sender.photoURL,
        // These fields are about the interaction
        lastMessage: text,
        timestamp: messageTimestamp,
    }, { merge: true });
};

export const clearUnreadMessage = async (currentUserId: string, senderId: string): Promise<void> => {
    if (!currentUserId || !senderId) return;
    try {
        const notificationRef = doc(db, 'users', currentUserId, 'unreadMessages', senderId);
        await deleteDoc(notificationRef);
    } catch (error) {
        console.error("Error clearing unread message:", error);
    }
};

const AI_CHAT_COLLECTION = 'aiChatMessages'; 

export const clearAiChatHistory = async (userId: string): Promise<void> => {
    if (!userId) return;
    try {
        const messagesRef = collection(db, 'users', userId, AI_CHAT_COLLECTION);
        const q = query(messagesRef);
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return;
        }
        
        // Use a batch to delete all documents efficiently
        const batch = writeBatch(db);
        snapshot.docs.forEach((d) => {
            batch.delete(d.ref);
        });

        await batch.commit();

    } catch (error) {
        console.error("Error clearing AI chat history:", error);
        throw new Error("Failed to clear AI chat history.");
    }
};

export type { ChatMessage };