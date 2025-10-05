// App.tsx
import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'; // MODIFIED: Added useLocation
import { AuthProvider, useAuth } from './src/hooks/useAuth.tsx'; 
import { PortfolioProvider } from './hooks/usePortfolio';
import { WatchlistProvider } from './hooks/useWatchlist';
import Dashboard from './components/Dashboard';
import StockView from './components/StockView';
import { TrendingUpIcon, BrainCircuitIcon, BriefcaseIcon } from './components/common/Icons';
import StockPicker from './components/StockPicker';
import HistoryLedger from './components/HistoryLedger';
import Login from './src/components/Login';
import { auth } from './src/firebaseConfig';
import { signOut } from 'firebase/auth';

const App: React.FC = () => {
    return (
        <AuthProvider>
            <PortfolioProvider>
                <WatchlistProvider>
                    <HashRouter>
                        <MainApp />
                    </HashRouter>
                </WatchlistProvider>
            </PortfolioProvider>
        </AuthProvider>
    );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // MODIFIED: Allow the Dashboard ('/') page to load without a user.
        const isPublicPath = location.pathname === '/' || location.pathname === '/login' || location.pathname.startsWith('/stock/');

        if (!loading && !user && !isPublicPath) {
            navigate('/login', { state: { from: location.pathname } });
        }
    }, [user, loading, navigate, location.pathname]);

    // MODIFIED: Only render null if loading or if accessing a protected route without a user.
    if (loading || (!user && !location.pathname.startsWith('/stock/') && location.pathname !== '/login' && location.pathname !== '/')) {
        return null; 
    }

    return <>{children}</>;
};

const MainApp: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const handleSignOut = async () => {
        await signOut(auth);
        navigate('/login');
    };

    return (
        <div className="min-h-screen text-night-100">
            <header className="bg-night-800 shadow-md p-4 sticky top-0 z-10">
                <nav className="container mx-auto flex justify-between items-center">
                    <Link to="/" className="flex items-center gap-2 text-xl font-bold text-white">
                        <TrendingUpIcon className="h-6 w-6 text-brand-blue" />
                        Signatex.co
                    </Link>
                    <div className="flex gap-4">
                        {user && (
                            <>
                                <Link to="/history" className="flex items-center gap-2 text-md font-bold text-white bg-night-700 px-4 py-2 rounded-md hover:bg-night-600 transition-colors">
                                    <BriefcaseIcon className="h-5 w-5" />
                                    History
                                </Link>
                                <Link to="/picker" className="flex items-center gap-2 text-md font-bold text-white bg-brand-blue px-4 py-2 rounded-md hover:bg-blue-600 transition-colors">
                                    <BrainCircuitIcon className="h-5 w-5" />
                                    AI Stock Picker
                                </Link>
                                <button onClick={handleSignOut} className="text-md font-bold text-white">Sign Out</button>
                            </>
                        )}
                        {!user && (
                             <Link to="/login" className="text-md font-bold text-white bg-brand-blue px-4 py-2 rounded-md hover:bg-blue-600 transition-colors">
                                Login
                            </Link>
                        )}
                    </div>
                </nav>
            </header>
            <main className="container mx-auto p-4 md:p-6 lg:p-8">
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/stock/:ticker" element={<StockView />} />
                    
                    {/* FIX: Move Dashboard out of ProtectedRoute */}
                    <Route path="/" element={<Dashboard />} /> 
                    
                    {/* Protected Routes Wrapper */}
                    <Route path="/picker" element={<ProtectedRoute><StockPicker /></ProtectedRoute>} />
                    <Route path="/history" element={<ProtectedRoute><HistoryLedger /></ProtectedRoute>} />
                    
                </Routes>
            </main>
            <footer className="text-center p-4 text-night-500 text-xs border-t border-night-800 mt-8">
                <p>Disclaimer: This is a paper trading application for educational purposes only. Not financial advice.</p>
                <p>&copy; 2025 Signatex.co. Market data provided by Financial Modeling Prep.</p>
            </footer>
        </div>
    );
}

export default App;