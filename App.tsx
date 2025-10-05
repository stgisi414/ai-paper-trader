// App.tsx
import React from 'react';
import { HashRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './src/hooks/useAuth.tsx';
import { PortfolioProvider } from './hooks/usePortfolio';
import { WatchlistProvider } from './hooks/useWatchlist';
import Dashboard from './components/Dashboard';
import StockView from './components/StockView';
import { TrendingUpIcon, BrainCircuitIcon, BriefcaseIcon } from './components/common/Icons';
import StockPicker from './components/StockPicker';
import HistoryLedger from './components/HistoryLedger';
import Login from './src/components/Login';
import { getAuth, signOut } from 'firebase/auth';

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

const MainApp: React.FC = () => {
    const { user } = useAuth();
    const auth = getAuth();
    const navigate = useNavigate();

    const handleSignOut = async () => {
        await signOut(auth);
        navigate('/');
    };

    return (
        <div className="min-h-screen text-night-100 overflow-x-hidden">
            <header className="bg-night-800 shadow-md p-4 sticky top-0 z-10">
                <nav className="container mx-auto flex justify-between items-center">
                    <Link to="/" className="flex items-center gap-2 text-xl font-bold text-white">
                        <TrendingUpIcon className="h-6 w-6 text-brand-blue" />
                        <span className="hidden sm:inline">Signatex.co</span> {/* MODIFIED: Hide text logo on small screens */}
                        <span className="inline sm:hidden text-lg">Signatex</span> {/* ADDITION: Shorter mobile logo */}
                    </Link>
                    <div className="flex gap-2 sm:gap-4 items-center"> {/* MODIFIED: Reduced gap on small screens */}
                        {user && (
                            <>
                                <Link to="/history" className="flex items-center gap-2 text-md font-bold text-white bg-night-700 px-3 py-2 rounded-md hover:bg-night-600 transition-colors" title="History"> {/* MODIFIED: Smaller padding/title for mobile */}
                                    <BriefcaseIcon className="h-5 w-5" />
                                    <span className="hidden sm:inline">History</span> {/* ADDITION: Hide text on mobile */}
                                </Link>
                                <Link to="/picker" className="flex items-center gap-2 text-md font-bold text-white bg-brand-blue px-3 py-2 rounded-md hover:bg-blue-600 transition-colors" title="AI Stock Picker"> {/* MODIFIED: Smaller padding/title for mobile */}
                                    <BrainCircuitIcon className="h-5 w-5" />
                                    <span className="hidden sm:inline">AI Stock Picker</span> {/* ADDITION: Hide text on mobile */}
                                </Link>
                                <button onClick={handleSignOut} className="text-md font-bold text-white p-2 rounded-md hover:bg-night-700" title="Sign Out">
                                    <span className="hidden sm:inline">Sign Out</span>
                                    <span className="inline sm:hidden text-sm">Out</span> {/* ADDITION: Minimal text for sign out */}
                                </button>
                            </>
                        )}
                        {!user && (
                             <Link to="/login" className="text-md font-bold text-white bg-brand-blue px-3 py-2 rounded-md hover:bg-blue-600 transition-colors"> {/* MODIFIED: Smaller padding */}
                                Login
                            </Link>
                        )}
                    </div>
                </nav>
            </header>
            <main className="container mx-auto p-4 md:p-6 lg:p-8">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/stock/:ticker" element={<StockView />} />
                    <Route path="/picker" element={<StockPicker />} />
                    <Route path="/history" element={<HistoryLedger />} />
                    <Route path="/login" element={<Login />} />
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