// src/components/Login.tsx
import React from 'react';
import { GoogleAuthProvider, signInWithPopup, getAuth } from 'firebase/auth';
import Card from '../../components/common/Card';
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
    const auth = getAuth();
    const navigate = useNavigate();

    const handleGoogleSignIn = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
            navigate('/');
        } catch (error) {
            console.error("Error signing in with Google", error);
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