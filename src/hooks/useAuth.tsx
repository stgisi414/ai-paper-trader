import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { getAuth, onAuthStateChanged, User as FirebaseAuthUser } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, onSnapshot, getDoc, increment, writeBatch, Timestamp, collection, query, where, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { User as UserType } from '../../types';
import Spinner from '../../components/common/Spinner';

// Define and export usage limits for different tiers
export const FREE_LITE_LIMIT = 20;
export const FREE_MAX_LIMIT = 0;
export const STARTER_LITE_LIMIT = 50;
export const STARTER_MAX_LIMIT = 5;
export const STANDARD_LITE_LIMIT = 500;
export const STANDARD_MAX_LIMIT = 40;
export const PRO_LITE_LIMIT = 1500;
export const PRO_MAX_LIMIT = 200;

// Placeholder Price IDs - **Make sure these match SubscriptionModal.tsx and your Stripe setup**
export const STRIPE_STARTER_PRICE_ID_MONTHLY = "price_1SLVdmDWUolxMnmeVUnIH9CQ"; //
export const STRIPE_STANDARD_PRICE_ID_MONTHLY = "price_1SLVdjDWUolxMnmeiNtApN7C"; //
export const STRIPE_PRO_PRICE_ID_MONTHLY = "price_1SLVdfDWUolxMnmeJJOS0rD2"; //

type CustomUsageTier = 'unlimited' | 'custom_tier_1';

export type AiLevel = 'beginner' | 'intermediate' | 'advanced';

// Define the shape of the user data we get from Firestore
interface UserSettings {
  fontSize: 'small' | 'medium' | 'large';
  aiLevel: AiLevel;
  isPro: boolean;
  activePriceId: string | null;
  maxUsed: number;
  liteUsed: number;
  lastUsageReset?: Timestamp;
  usageTier?: CustomUsageTier | null;
  referralSource: string | null;
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
  updateAiLevel: (level: AiLevel) => Promise<void>;
  isSubscriptionModalOpen: boolean;
  subscriptionModalReason: string;
  openSubscriptionModal: (reason?: string) => void;
  closeSubscriptionModal: () => void;
  checkUsage: (model: 'max' | 'lite') => boolean;
  logUsage: (model: 'max' | 'lite') => Promise<void>;
  onLimitExceeded: (model: 'max' | 'lite') => void;
  logReferralSource: (source: string) => Promise<void>;
}

const DEFAULT_SETTINGS: UserSettings = {
    fontSize: 'medium',
    aiLevel: 'intermediate',
    isPro: false,
    activePriceId: null,
    maxUsed: 0,
    liteUsed: 0,
    usageTier: null,
    referralSource: null,
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
      // Don't set loading true here, let the other listener handle it
      if (authUser) {
        setUser(authUser);
        // User document creation logic remains the same
        const userDocRef = doc(db, 'users', authUser.uid);
        const docSnap = await getDoc(userDocRef);
        if (!docSnap.exists()) {
          await setDoc(userDocRef, {
            displayName: authUser.displayName,
            email: authUser.email,
            photoURL: authUser.photoURL,
            ...DEFAULT_SETTINGS,
            referralSource: null,
            lastUsageReset: serverTimestamp(),
          }, { merge: true });
        }
      } else {
        setUser(null);
        setUserSettings(DEFAULT_SETTINGS);
        setLoading(false); // *** ADDED: Ensure loading stops if user logs out or is initially null ***
      }
    });
    return () => unsubscribe();
  }, [auth]);


  // User Document/Settings/Subscription Listener
  useEffect(() => {
    if (!user) {
      isInitialLoadRef.current = true;
      setUserSettings(DEFAULT_SETTINGS);
      // If there's no user, the auth listener above should have already set loading to false.
      // setLoading(false); // Can remove this redundant call
      return;
    }

    setLoading(true); // Set loading true *when we start fetching user-specific data*
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
        const data = docSnap.data() as UserType & { usageTier?: CustomUsageTier | null }; // ADDED: Include usageTier in type assertion
        const newSettings = {
            fontSize: data.fontSize || 'medium',
            aiLevel: data.aiLevel || 'intermediate',
            maxUsed: data.maxUsed ?? 0,
            liteUsed: data.liteUsed ?? 0,
            lastUsageReset: data.lastUsageReset,
            usageTier: data.usageTier || null, // ADDED: Read the usageTier field
            referralSource: data.referralSource === undefined ? null : data.referralSource,
        };
         setUserSettings(prev => {
             const updated = { ...prev, ...newSettings };
             handleUsageReset(updated); // handleUsageReset doesn't need changes for this
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
    }, (error) => {
        console.error("Error fetching user settings:", error);
        setLoading(false); // *** ADDED: Stop loading on user settings error ***
    });


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
         setLoading(false); // *** MOVED: Set loading false after *both* user settings and subscription status have been checked ***
         isInitialLoadRef.current = false;
    }, (error) => {
        console.error("Error fetching subscription status:", error);
        setUserSettings(prev => ({ ...prev, isPro: false, activePriceId: null }));
        setLoading(false); // *** ADDED: Stop loading on subscription error ***
        isInitialLoadRef.current = false; // Also mark initial load done on error
    });


    return () => {
      unsubUser();
      unsubCustomer();
      isInitialLoadRef.current = true;
    };
  }, [user]); // Only depends on user


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

  const updateAiLevel = useCallback(async (level: AiLevel) => {
    if (!user) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, { aiLevel: level }, { merge: true });
      // Local state will update via the onSnapshot listener
    } catch (error) {
      console.error("Failed to update AI level:", error);
    }
  }, [user]);

  const checkUsage = useCallback((model: 'max' | 'lite'): boolean => {
      const { isPro, activePriceId, liteUsed, maxUsed, usageTier } = userSettings;
      if (isPro && activePriceId === STRIPE_PRO_PRICE_ID_MONTHLY) return true;

      if (usageTier === 'unlimited') {
          console.log("[Usage Check] User has 'unlimited' custom tier. Access granted.");
          return true;
      }

      // --- You could add checks for other custom tiers here if needed ---
      // Example:
      if (usageTier === 'custom_tier_1') {
           const customLiteLimit = 1000;
           const customMaxLimit = 100;
           if (model === 'lite') return liteUsed < customLiteLimit;
           if (model === 'max') return maxUsed < customMaxLimit;
           return false; // Should not happen
      }
      
      // 2. If no custom tier applies, fall back to Stripe plan logic
      console.log("[Usage Check] No overriding custom tier found. Checking Stripe plan.");
      if (isPro && activePriceId === STRIPE_PRO_PRICE_ID_MONTHLY) {
          console.log("[Usage Check] User has Stripe Pro plan (unlimited). Access granted.");
          return true; // Stripe Pro plan is also unlimited
      }

      let liteLimit = FREE_LITE_LIMIT;
      let maxLimit = FREE_MAX_LIMIT;
      let planType = 'Free';

      if (isPro) {
          if (activePriceId === STRIPE_PRO_PRICE_ID_MONTHLY) {
              // MODIFIED: Apply Pro limits instead of returning true
              liteLimit = PRO_LITE_LIMIT;
              maxLimit = PRO_MAX_LIMIT;
              planType = 'Pro';
          } else if (activePriceId === STRIPE_STANDARD_PRICE_ID_MONTHLY) {
              liteLimit = STANDARD_LITE_LIMIT;
              maxLimit = STANDARD_MAX_LIMIT;
              planType = 'Standard';
          } else if (activePriceId === STRIPE_STARTER_PRICE_ID_MONTHLY) {
              liteLimit = STARTER_LITE_LIMIT;
              maxLimit = STARTER_MAX_LIMIT;
              planType = 'Starter';
          } else {
              planType = 'Unknown Paid'; // Gets Free limits
          }
      }

      // 3. Check usage against the determined limit
      if (model === 'lite') {
          const allowed = liteUsed < liteLimit;
          console.log(`[Usage Check - ${planType}] Lite usage: ${liteUsed}/${liteLimit}. Allowed: ${allowed}`);
          return allowed;
      }
      if (model === 'max') {
          const allowed = maxUsed < maxLimit;
          console.log(`[Usage Check - ${planType}] Max usage: ${maxUsed}/${maxLimit}. Allowed: ${allowed}`);
          return allowed;
      }

      console.log("[Usage Check] Invalid model type specified.");
      return false;
  }, [userSettings]);


  const logUsage = useCallback(async (model: 'max' | 'lite') => {
      // MODIFICATION: Add check for custom 'unlimited' tier
      if (!user || userSettings.usageTier === 'unlimited') {
            return; // Don't log for custom unlimited users
      } 

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
  }, [user, userSettings.usageTier]);

  const logReferralSource = useCallback(async (source: string) => {
    if (!user) return;
    try {
        const userDocRef = doc(db, 'users', user.uid);
        // Set the field. 'Skipped' will mark it as completed so the modal doesn't show again.
        await setDoc(userDocRef, { referralSource: source.trim() }, { merge: true }); 
    } catch (error) {
        console.error("Failed to log referral source:", error);
    }
  }, [user]);

  const value = useMemo(() => ({
    user,
    loading,
    userSettings, // This now includes usageTier
    isPro: userSettings.isPro,
    activePriceId: userSettings.activePriceId,
    liteUsed: userSettings.liteUsed,
    maxUsed: userSettings.maxUsed,
    updateFontSize,
    updateAiLevel,
    isSubscriptionModalOpen,
    subscriptionModalReason,
    openSubscriptionModal,
    closeSubscriptionModal,
    checkUsage,
    logUsage,
    onLimitExceeded,
    logReferralSource,
  }), [
      user,
      loading,
      userSettings, // Includes usageTier
      updateFontSize,
      updateAiLevel,
      isSubscriptionModalOpen,
      subscriptionModalReason,
      openSubscriptionModal,
      closeSubscriptionModal,
      checkUsage, // Now uses usageTier
      logUsage,   // Now uses usageTier
      onLimitExceeded,
      logReferralSource,
    ]);


  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="flex justify-center items-center min-h-screen">
          <Spinner />
        </div>
      ) : (
        children
      )}
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