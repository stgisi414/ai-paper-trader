import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../src/firebaseConfig';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const auth = getAuth();

  useEffect(() => {
    console.log('[DEBUG] useAuth.tsx: AuthProvider useEffect for onAuthStateChanged mounting.');
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('[DEBUG] useAuth.tsx: onAuthStateChanged callback fired.');
      if (user) {
        console.log(`[DEBUG] useAuth.tsx: User detected with UID: ${user.uid}`);
        setUser(user);
      } else {
        console.log('[DEBUG] useAuth.tsx: No user detected.');
        setUser(null);
      }
      console.log('[DEBUG] useAuth.tsx: Setting auth loading to false.');
      setLoading(false);
    });

    return () => {
        console.log('[DEBUG] useAuth.tsx: Unsubscribing from onAuthStateChanged.');
        unsubscribe();
    }
  }, [auth]);

  useEffect(() => {
    if (user) {
      console.log(`[DEBUG] useAuth.tsx: User is present, setting up lastSeen interval for UID: ${user.uid}`);
      const userDocRef = doc(db, 'users', user.uid);
      const updateLastSeen = () => {
        setDoc(userDocRef, { lastSeen: serverTimestamp() }, { merge: true });
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
  
  console.log(`[DEBUG] useAuth.tsx: AuthProvider rendering. Loading: ${loading}, User:`, user ? user.uid : 'null');

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);