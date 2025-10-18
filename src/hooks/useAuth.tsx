import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { getAuth, onAuthStateChanged, User as FirebaseAuthUser } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, onSnapshot, getDoc, increment, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '../../src/firebaseConfig';
import { User as UserType } from '../types';

// Define usage limits for the free/basic tier
const MAX_LITE_CALLS = 30;
const MAX_PRO_CALLS = 3;

// Define the shape of the user data we get from Firestore
interface UserSettings {
  fontSize: 'small' | 'medium' | 'large';
  // AI Usage and Subscription data
  isPro: boolean;
  maxUsed: number;
  liteUsed: number;
  lastUsageReset?: Timestamp;
}

interface AuthContextType {
  user: FirebaseAuthUser | null;
  loading: boolean;
  userSettings: UserSettings;
  updateFontSize: (size: UserSettings['fontSize']) => Promise<void>;
  // Functions for subscription modal
  isSubscriptionModalOpen: boolean;
  subscriptionModalReason: string;
  openSubscriptionModal: (reason?: string) => void;
  closeSubscriptionModal: () => void;
  // Functions for AI usage metering
  checkUsage: (model: 'max' | 'lite') => boolean;
  logUsage: (model: 'max' | 'lite') => Promise<void>;
  onLimitExceeded: (model: 'max' | 'lite') => void;
}

const DEFAULT_SETTINGS: UserSettings = {
    fontSize: 'medium',
    isPro: false,
    maxUsed: 0,
    liteUsed: 0,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseAuthUser | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const auth = getAuth();

  // State for controlling the subscription modal
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [subscriptionModalReason, setSubscriptionModalReason] = useState('');

  const openSubscriptionModal = useCallback((reason: string = '') => {
    setSubscriptionModalReason(reason);
    setIsSubscriptionModalOpen(true);
  }, []);

  const closeSubscriptionModal = useCallback(() => {
    setIsSubscriptionModalOpen(false);
    setSubscriptionModalReason('');
  }, []);

  // Authentication Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        setUser(authUser);
        const userDocRef = doc(db, 'users', authUser.uid);
        const docSnap = await getDoc(userDocRef);
        if (!docSnap.exists()) {
          // Create user document with defaults if it doesn't exist
          await setDoc(userDocRef, {
            displayName: authUser.displayName,
            email: authUser.email,
            photoURL: authUser.photoURL,
            ...DEFAULT_SETTINGS,
            lastUsageReset: serverTimestamp(),
          }, { merge: true });
        }
      } else {
        setUser(null);
        setUserSettings(DEFAULT_SETTINGS);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);

  // User Document/Settings/Subscription Listener
  useEffect(() => {
    if (!user) {
      setUserSettings(DEFAULT_SETTINGS);
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const customerDocRef = doc(db, 'customers', user.uid); // Path for Stripe data

    const handleUsageReset = async (settings: UserSettings) => {
        const now = new Date();
        const lastReset = settings.lastUsageReset?.toDate() ?? new Date(0);
        // Check if the last reset was in a previous month
        if (lastReset.getFullYear() < now.getFullYear() || lastReset.getMonth() < now.getMonth()) {
            console.log("Monthly AI usage reset triggered for user:", user.uid);
            const batch = writeBatch(db);
            batch.update(userDocRef, {
                liteUsed: 0,
                maxUsed: 0,
                lastUsageReset: serverTimestamp()
            });
            await batch.commit();
        }
    };


    // Listen to user settings
    const unsubUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserType; // Using UserType from types.ts
        const newSettings: UserSettings = {
            fontSize: data.fontSize || 'medium',
            isPro: userSettings.isPro, // Preserve isPro from customer listener
            maxUsed: data.maxUsed || 0,
            liteUsed: data.liteUsed || 0,
            lastUsageReset: data.lastUsageReset,
        };
        setUserSettings(prev => ({ ...prev, ...newSettings }));
        handleUsageReset(newSettings);

        // Apply font size
        const root = document.documentElement;
        if (root) {
            let size = '16px';
            if (newSettings.fontSize === 'small') size = '14px';
            else if (newSettings.fontSize === 'large') size = '18px';
            root.style.fontSize = size;
        }
      }
    }, (error) => console.error("Error fetching user settings:", error));

    // Listen to Stripe subscription status
    const unsubCustomer = onSnapshot(customerDocRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            // The extension creates a 'subscriptions' subcollection. We check for an active subscription.
            const subscriptions = data.subscriptions as any[];
            const isPro = subscriptions?.some(sub => ['active', 'trialing'].includes(sub.status)) ?? false;
            setUserSettings(prev => ({ ...prev, isPro }));
            console.log(`[useAuth] User: ${user.uid} | Pro Status: ${isPro}`);
        } else {
            setUserSettings(prev => ({ ...prev, isPro: false }));
             console.log(`[useAuth] User: ${user.uid} | No customer record found. Setting Pro status to false.`);
        }
    }, (error) => console.error("Error fetching customer subscription:", error));


    return () => {
      unsubUser();
      unsubCustomer();
    };
  }, [user]);


  const updateFontSize = useCallback(async (size: UserSettings['fontSize']) => {
    if (!user) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, { fontSize: size }, { merge: true });
    } catch (error) {
      console.error("Failed to update font size:", error);
    }
  }, [user]);

  // --- AI USAGE METERING LOGIC ---

  const onLimitExceeded = useCallback((model: 'max' | 'lite') => {
      const modelName = model === 'max' ? 'Signatex Max' : 'Signatex Lite';
      openSubscriptionModal(`You have exceeded your monthly limit for ${modelName} calls.`);
  }, [openSubscriptionModal]);


  const checkUsage = useCallback((model: 'max' | 'lite'): boolean => {
      if (userSettings.isPro) return true; // Pro users have unlimited access

      if (model === 'lite') {
          return userSettings.liteUsed < MAX_LITE_CALLS;
      }
      if (model === 'max') {
          return userSettings.maxUsed < MAX_PRO_CALLS;
      }
      return false;
  }, [userSettings]);

  const logUsage = useCallback(async (model: 'max' | 'lite') => {
      if (!user || userSettings.isPro) return; // Don't log for pro users

      const userDocRef = doc(db, 'users', user.uid);
      const fieldToIncrement = model === 'lite' ? 'liteUsed' : 'maxUsed';

      try {
          await setDoc(userDocRef, {
              [fieldToIncrement]: increment(1)
          }, { merge: true });
      } catch (error) {
          console.error(`Failed to log usage for ${model} model:`, error);
      }
  }, [user, userSettings.isPro]);

  // ---

  const value = useMemo(() => ({
    user,
    loading,
    userSettings,
    updateFontSize,
    isSubscriptionModalOpen,
    subscriptionModalReason,
    openSubscriptionModal,
    closeSubscriptionModal,
    checkUsage,
    logUsage,
    onLimitExceeded,
  }), [user, loading, userSettings, updateFontSize, isSubscriptionModalOpen, subscriptionModalReason, openSubscriptionModal, closeSubscriptionModal, checkUsage, logUsage, onLimitExceeded]);

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
