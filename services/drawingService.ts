// services/drawingService.ts
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../src/firebaseConfig';
import { User } from 'firebase/auth';
import { Time } from 'lightweight-charts';

// Define the exact structure of a saved drawing for the database
interface SavedDrawing {
    p1: { time: Time; price: number; };
    p2: { time: Time; price: number; };
    angle: number;
    color: string;
}

/**
 * Loads saved drawings for a ticker from Firestore.
 * @param user The logged-in Firebase user object.
 * @param ticker The stock ticker.
 * @returns A promise that resolves to an array of saved drawings.
 */
export const loadDrawingsFromDB = async (user: User, ticker: string): Promise<SavedDrawing[]> => {
    try {
        const docRef = doc(db, 'users', user.uid, 'drawings', ticker.toUpperCase());
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // The document stores an object: { drawings: [...] }
            return (docSnap.data().drawings as SavedDrawing[]) || [];
        }
    } catch (e) {
        console.error("Error loading drawings from DB:", e);
    }
    return [];
};

/**
 * Saves all current drawings for a ticker to Firestore.
 * @param user The logged-in Firebase user object.
 * @param ticker The stock ticker.
 * @param drawings The array of drawing objects to save.
 */
export const saveDrawingsToDB = async (user: User, ticker: string, drawings: SavedDrawing[]): Promise<void> => {
    try {
        const docRef = doc(db, 'users', user.uid, 'drawings', ticker.toUpperCase());
        // Use setDoc to create/overwrite the document.
        await setDoc(docRef, { drawings: drawings });
    } catch (e) {
        console.error("Error saving drawings to DB:", e);
    }
};

// Also export the interface for type safety in the drawing tool
export type { SavedDrawing };