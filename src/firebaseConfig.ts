// src/firebaseConfig.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBxhVL3_stQ6ySuXQ_HUsZ7gCzkgW0c56U",
  authDomain: "signatex-trader.firebaseapp.com",
  projectId: "signatex-trader",
  storageBucket: "signatex-trader.firebasestorage.app",
  messagingSenderId: "477475314402",
  appId: "1:477475314402:web:974732aa8ceff0ef0c9cbb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };