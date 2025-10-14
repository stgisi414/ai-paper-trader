import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react'; // MODIFIED: Added useMemo
import { getAuth, onAuthStateChanged, User as FirebaseAuthUser } from 'firebase/auth'; 
import { doc, setDoc, serverTimestamp, onSnapshot, getDoc } from 'firebase/firestore'; 
import { db } from '../../src/firebaseConfig';
import { User as UserType } from '../types';

// Define the shape of the user data we get from Firestore (can be incomplete)
interface UserSettings {
  fontSize: 'small' | 'medium' | 'large';
}

interface AuthContextType {
  user: FirebaseAuthUser | null; // MODIFIED to use FirebaseAuthUser for the core user object
  loading: boolean;
  userSettings: UserSettings; // ADDITION
  updateFontSize: (size: UserSettings['fontSize']) => Promise<void>; // ADDITION
}

const DEFAULT_SETTINGS: UserSettings = { fontSize: 'medium' }; // ADDITION
// MODIFIED initial context value
const AuthContext = createContext<AuthContextType>({ user: null, loading: true, userSettings: DEFAULT_SETTINGS, updateFontSize: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseAuthUser | null>(null); // MODIFIED
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_SETTINGS); // ADDITION
  const [loading, setLoading] = useState(true);
  const auth = getAuth();

  // 1. Authentication Listener (Sets the core user object)
  useEffect(() => {
    console.log('[DEBUG] useAuth.tsx: AuthProvider useEffect for onAuthStateChanged mounting.');
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => { 
      console.log('[DEBUG] useAuth.tsx: onAuthStateChanged callback fired.');
      if (authUser) {
        console.log(`[DEBUG] useAuth.tsx: User detected with UID: ${authUser.uid}`);
        setUser(authUser);
        
        const docSnap = await getDoc(doc(db, 'users', authUser.uid));
        if (!docSnap.exists()) {
             console.log("[DEBUG] useAuth.tsx: User doc missing, forcing creation...");
             await setDoc(doc(db, 'users', authUser.uid), { 
                displayName: authUser.displayName,
                email: authUser.email,
                photoURL: authUser.photoURL,
                fontSize: 'medium', 
             }, { merge: true });
        }
      } else {
        console.log('[DEBUG] useAuth.tsx: No user detected.');
        setUser(null);
        setUserSettings(DEFAULT_SETTINGS); 
      }
      console.log('[DEBUG] useAuth.tsx: Setting auth loading to false.');
      setLoading(false);
    });

    return () => {
        console.log('[DEBUG] useAuth.tsx: Unsubscribing from onAuthStateChanged.');
        unsubscribe();
    }
  }, [auth]);

  // 2. User Document/Settings Listener (Fetches and applies settings)
  useEffect(() => {
    if (!user) { // Check user directly
      setUserSettings(DEFAULT_SETTINGS);
      return;
    }
    
    // MODIFIED: Define userDocRef inside the effect to avoid recreating the object on every render
    const userDocRef = doc(db, 'users', user.uid);

    console.log(`[DEBUG] useAuth.tsx: Attaching settings listener for UID: ${user.uid}`);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data() as UserType;
            const newSettings: UserSettings = {
                fontSize: data.fontSize || 'medium',
            };
            setUserSettings(newSettings);
            
            // CRITICAL: Apply the font size preference to the document root
            const root = document.documentElement;
            if (root) {
                let size = '16px';
                switch (newSettings.fontSize) {
                    case 'small': size = '14px'; break;
                    case 'large': size = '18px'; break;
                    case 'medium': size = '16px'; break;
                }
                root.style.fontSize = size;
            }
        }
    }, (error) => {
        console.error("Error fetching user settings:", error);
    });

    return () => {
      console.log(`[DEBUG] useAuth.tsx: Unsubscribing from settings listener for UID: ${user.uid}`);
      unsubscribe();
    }
  }, [user]); // Runs when user changes or userDocRef is available


  // 3. Last Seen Updater (Keep original functionality)
  useEffect(() => {
    if (user) {
      console.log(`[DEBUG] useAuth.tsx: User is present, setting up lastSeen interval for UID: ${user.uid}`);
      const ref = doc(db, 'users', user.uid); 
      const updateLastSeen = () => {
        setDoc(ref, { lastSeen: serverTimestamp() }, { merge: true });
      };

      updateLastSeen();
      const interval = setInterval(updateLastSeen, 60000); // Update every minute

      return () => {
        console.log(`[DEBUG] useAuth.tsx: Clearing lastSeen interval for UID: ${user.uid}`);
        clearInterval(interval);
      };
    } else {
        console.log('[DEBUG] useAuth.tsx: No user, skipping lastSeen effect.');
    }
  }, [user]);
  
  // 4. Update Function for Font Size
  const updateFontSize = useCallback(async (size: UserSettings['fontSize']) => {
    if (!user) return; 
    try {
        const userDocRef = doc(db, 'users', user.uid); 
        await setDoc(userDocRef, { fontSize: size }, { merge: true });
    } catch (error) {
        console.error("Failed to update font size preference:", error);
    }
  }, [user]); 

  const value = useMemo(() => ({
    user, 
    loading, 
    userSettings, 
    updateFontSize
  }), [user, loading, userSettings, updateFontSize]);
  
  console.log(`[DEBUG] useAuth.tsx: AuthProvider rendering. Loading: ${loading}, User:`, user ? user.uid : 'null');

  // MODIFIED: Expose new settings and update function
  return (
    <AuthContext.Provider value={{ user, loading, userSettings, updateFontSize }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);