import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { getAuth, onAuthStateChanged, User as FirebaseAuthUser } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, onSnapshot, getDoc, increment, writeBatch, Timestamp, collection, query, where, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User as UserType } from '../../types';

// Define and export usage limits for different tiers
export const FREE_LITE_LIMIT = 30;
export const FREE_MAX_LIMIT = 3;
export const STARTER_LITE_LIMIT = 100;
export const STARTER_MAX_LIMIT = 10;
export const STANDARD_LITE_LIMIT = 250;
export const STANDARD_MAX_LIMIT = 25;
// Pro is unlimited

// Placeholder Price IDs - **Make sure these match SubscriptionModal.tsx and your Stripe setup**
export const STRIPE_STARTER_PRICE_ID_MONTHLY = 'price_1SJiJfGYNyUbUaQ66dsLoGZ2';
export const STRIPE_STANDARD_PRICE_ID_MONTHLY = 'price_1SJiLUGYNyUbUaQ6SQmPLRu7';
export const STRIPE_PRO_PRICE_ID_MONTHLY = 'price_1SJiQCGYNyUbUaQ6csbXHGPM';


// Define the shape of the user data we get from Firestore
interface UserSettings {
  fontSize: 'small' | 'medium' | 'large';
  isPro: boolean; // True if any paid plan active
  activePriceId: string | null; // Store the active price ID
  maxUsed: number;
  liteUsed: number;
  lastUsageReset?: Timestamp;
}

interface AuthContextType {
  user: FirebaseAuthUser | null;
  loading: boolean;
  userSettings: UserSettings;
  isPro: boolean;
  activePriceId: string | null; // Expose active price ID
  liteUsed: number;
  maxUsed: number;
  updateFontSize: (size: UserSettings['fontSize']) => Promise<void>;
  isSubscriptionModalOpen: boolean;
  subscriptionModalReason: string;
  openSubscriptionModal: (reason?: string) => void;
  closeSubscriptionModal: () => void;
  checkUsage: (model: 'max' | 'lite') => boolean;
  logUsage: (model: 'max' | 'lite') => Promise<void>;
  onLimitExceeded: (model: 'max' | 'lite') => void;
}

const DEFAULT_SETTINGS: UserSettings = {
    fontSize: 'medium',
    isPro: false,
    activePriceId: null,
    maxUsed: 0,
    liteUsed: 0,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseAuthUser | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const auth = getAuth();
  const isInitialLoadRef = useRef(true); // Ref to track initial data load

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

  // Authentication Listener (no changes needed here)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setLoading(true);
      if (authUser) {
        setUser(authUser);
        const userDocRef = doc(db, 'users', authUser.uid);
        const docSnap = await getDoc(userDocRef);
        if (!docSnap.exists()) {
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
    });
    return () => unsubscribe();
  }, [auth]);


  // User Document/Settings/Subscription Listener
  useEffect(() => {
    if (!user) {
      isInitialLoadRef.current = true; // Reset for next login
      setUserSettings(DEFAULT_SETTINGS);
      setLoading(false);
      return;
    }

    setLoading(true);
    const userDocRef = doc(db, 'users', user.uid);

    const handleUsageReset = async (settings: UserSettings) => {
        const now = new Date();
        const lastReset = settings.lastUsageReset?.toDate() ?? new Date(0);
        if (lastReset.getFullYear() < now.getFullYear() || lastReset.getMonth() < now.getMonth()) {
            console.log("Monthly AI usage reset triggered for user:", user.uid);
            await updateDoc(userDocRef, {
                liteUsed: 0,
                maxUsed: 0,
                lastUsageReset: serverTimestamp()
            });
        }
    };


    // Listen to user settings (like fontSize, usage counts)
    const unsubUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserType;
        const newSettings = {
            fontSize: data.fontSize || 'medium',
            maxUsed: data.maxUsed ?? 0,
            liteUsed: data.liteUsed ?? 0,
            lastUsageReset: data.lastUsageReset,
        };
         setUserSettings(prev => {
             const updated = { ...prev, ...newSettings };
             handleUsageReset(updated);
             return updated;
         });
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
    const subscriptionsRef = collection(db, 'customers', user.uid, 'subscriptions');
    const q = query(subscriptionsRef, where('status', 'in', ['trialing', 'active']));

    const unsubCustomer = onSnapshot(q, async (snapshot) => {
        const isActive = !snapshot.empty;
        let activePriceId: string | null = null;

        // This condition now correctly identifies a real-time transition to a paid plan,
        // ignoring the initial page load.
        if (isActive && !userSettings.isPro && !isInitialLoadRef.current) {
            console.log('[useAuth DEBUG] User transitioning to a paid plan. Resetting usage.');
            try {
                await updateDoc(doc(db, 'users', user.uid), {
                    liteUsed: 0,
                    maxUsed: 0,
                });
            } catch (error) {
                console.error("Failed to reset usage on new subscription:", error);
            }
        }

        if (isActive && snapshot.docs.length > 0) {
            const subData = snapshot.docs[0].data();
            activePriceId = subData.items?.[0]?.price?.id ?? null;
        }

        setUserSettings(prev => ({
            ...prev,
            isPro: isActive,
            activePriceId: activePriceId
        }));
         setLoading(false);
         isInitialLoadRef.current = false; // After the first run, it's no longer the initial load
    }, (error) => {
        console.error("Error fetching subscription status:", error);
        setUserSettings(prev => ({ ...prev, isPro: false, activePriceId: null }));
        setLoading(false);
    });


    return () => {
      unsubUser();
      unsubCustomer();
      isInitialLoadRef.current = true; // Reset for next user login
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

  const onLimitExceeded = useCallback((model: 'max' | 'lite') => {
      const modelName = model === 'max' ? 'Signatex Max' : 'Signatex Lite';
      openSubscriptionModal(`You have exceeded your monthly limit for ${modelName} calls. Upgrade your plan for more access.`);
  }, [openSubscriptionModal]);


  const checkUsage = useCallback((model: 'max' | 'lite'): boolean => {
      const { isPro, activePriceId, liteUsed, maxUsed } = userSettings;
      if (isPro && activePriceId === STRIPE_PRO_PRICE_ID_MONTHLY) return true;

      let liteLimit = FREE_LITE_LIMIT;
      let maxLimit = FREE_MAX_LIMIT;

      if (isPro) {
            if (activePriceId === STRIPE_STARTER_PRICE_ID_MONTHLY) {
                liteLimit = STARTER_LITE_LIMIT;
                maxLimit = STARTER_MAX_LIMIT;
            } else if (activePriceId === STRIPE_STANDARD_PRICE_ID_MONTHLY) {
                liteLimit = STANDARD_LITE_LIMIT;
                maxLimit = STANDARD_MAX_LIMIT;
            }
        }

      if (model === 'lite') return liteUsed < liteLimit;
      if (model === 'max') return maxUsed < maxLimit;
      return false;
  }, [userSettings]);


  const logUsage = useCallback(async (model: 'max' | 'lite') => {
       if (!user || (userSettings.isPro && userSettings.activePriceId === STRIPE_PRO_PRICE_ID_MONTHLY)) return;

      const userDocRef = doc(db, 'users', user.uid);
      const fieldToIncrement = model === 'lite' ? 'liteUsed' : 'maxUsed';

      try {
          // This function will now ONLY update the database.
          // The onSnapshot listener will handle updating the local state automatically,
          // which prevents the race condition and double-counting on the client.
          const batch = writeBatch(db);
          batch.update(userDocRef, { [fieldToIncrement]: increment(1) });
          await batch.commit();

      } catch (error) {
          console.error(`Failed to log usage for ${model} model:`, error);
      }
  }, [user, userSettings.isPro, userSettings.activePriceId]);


  const value = useMemo(() => ({
    user,
    loading,
    userSettings,
    isPro: userSettings.isPro,
    activePriceId: userSettings.activePriceId,
    liteUsed: userSettings.liteUsed,
    maxUsed: userSettings.maxUsed,
    updateFontSize,
    isSubscriptionModalOpen,
    subscriptionModalReason,
    openSubscriptionModal,
    closeSubscriptionModal,
    checkUsage,
    logUsage,
    onLimitExceeded,
  }), [
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
      onLimitExceeded
    ]);


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