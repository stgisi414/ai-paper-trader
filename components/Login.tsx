import React from 'react';
import { GoogleAuthProvider, signInWithPopup, getAuth, User } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../src/firebaseConfig';
import Card from '../../components/common/Card';
import { useNavigate } from 'react-router-dom';
import { INITIAL_CASH } from '../../constants';

const Login: React.FC = () => {
    const auth = getAuth();
    const navigate = useNavigate();

    const handleGoogleSignIn = async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            // After successful sign-in, create a user document in Firestore
            await createUserDocument(user);

            navigate('/');
        } catch (error) {
            console.error("Error signing in with Google", error);
        }
    };

    const createUserDocument = async (user: User) => {
        if (!user) return;
    
        const userDocRef = doc(db, 'users', user.uid);
    
        // Check if the document already exists
        const docSnap = await getDoc(userDocRef);
    
        if (!docSnap.exists()) {
            // Document doesn't exist, so create it
            try {
                await setDoc(userDocRef, {
                    displayName: user.displayName,
                    email: user.email,
                    photoURL: user.photoURL,
                });
                console.log("User document created in Firestore for user:", user.uid);

                // Create initial portfolio and transactions documents
                const portfolioDocRef = doc(db, 'users', user.uid, 'data', 'portfolio');
                const transactionsDocRef = doc(db, 'users', user.uid, 'data', 'transactions');
                const initialPortfolio = {
                    cash: INITIAL_CASH,
                    holdings: [],
                    optionHoldings: [],
                    initialValue: INITIAL_CASH,
                };
                await setDoc(portfolioDocRef, initialPortfolio);
                await setDoc(transactionsDocRef, { transactions: [] });

            } catch (error) {
                console.error("Error creating user document:", error);
            }
        } else {
            console.log("User document already exists for user:", user.uid);
        }
    };
    

    return (
        <div className="flex justify-center items-center" style={{ height: 'calc(100vh - 200px)' }}>
            <Card className="text-center">
                <h1 className="text-2xl font-bold mb-4">Login to Paper Trader</h1>
                <p className="text-night-500 mb-6">Sign in to save your portfolio, watchlist, and trades.</p>
                <button
                    onClick={handleGoogleSignIn}
                    className="bg-brand-blue text-white font-bold py-3 px-8 rounded-md hover:bg-blue-600 transition-colors"
                >
                    Sign in with Google
                </button>
            </Card>
        </div>
    );
};

export default Login;