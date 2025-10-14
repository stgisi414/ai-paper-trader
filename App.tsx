import React, { useState } from 'react';
import { HashRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './src/hooks/useAuth.tsx';
import { PortfolioProvider } from './hooks/usePortfolio';
import { WatchlistProvider } from './hooks/useWatchlist';
import Dashboard from './components/Dashboard';
import StockView from './components/StockView';
import { BrainCircuitIcon, BriefcaseIcon } from './components/common/Icons';
import StockPicker from './components/StockPicker';
import HistoryLedger from './components/HistoryLedger';
import Login from './src/components/Login';
import { getAuth, signOut } from 'firebase/auth';
import { NotificationProvider } from './hooks/useNotification';
import { useUnreadListener } from './hooks/useUnreadListener';
import NotificationPopup from './components/common/NotificationPopup';
import VersionChecker from './components/VersionChecker';

const FONT_SIZES = ['small', 'medium', 'large'] as const;

const App: React.FC = () => {
    console.log('[DEBUG] App.tsx: Rendering App component');
    return (
        <AuthProvider>
            {/* FIX: Move NotificationProvider up */}
            <NotificationProvider> 
                <PortfolioProvider>
                    <WatchlistProvider>
                        <HashRouter>
                            <MainApp />
                        </HashRouter>
                    </WatchlistProvider>
                </PortfolioProvider>
            </NotificationProvider>
        </AuthProvider>
    );
};

const MainApp: React.FC = () => {
    const { user, userSettings, updateFontSize } = useAuth();
    const auth = getAuth();
    const navigate = useNavigate();
    useUnreadListener();

    const [isFontSizeMenuOpen, setIsFontSizeMenuOpen] = useState(false);

    const handleSignOut = async () => {
        await signOut(auth);
        navigate('/');
    };

    const logoClassName = 'h-10 w-8 bg-white transition-all duration-300';

    return (
        <div className="min-h-screen text-night-100 overflow-x-hidden">
            <VersionChecker /> {/* Add the version checker here */}
            <NotificationPopup />
            <header className="bg-night-800 shadow-md p-4 sticky top-0 z-10">
                <nav className="container mx-auto flex justify-between items-center">
                    <Link to="/" className="flex items-center pl-4 pr-4 gap-2 text-xl font-bold text-blue-500 rounded-md bg-white border border-night-400 border-4 p-1">
                        <img 
                            src="/logo.jpg" 
                            alt="Signatex Logo" 
                            className={logoClassName} 
                            style={{ objectFit: 'contain' }} 
                        />
                        <span className="hidden sm:inline">Signatex.co</span> {/* MODIFIED: Hide text logo on small screens */}
                        <span className="inline sm:hidden text-lg">Signatex</span> {/* ADDITION: Shorter mobile logo */}
                    </Link>
                    <div className="flex gap-2 sm:gap-4 items-center"> {/* MODIFIED: Reduced gap on small screens */}
                        {user && (
                            // MODIFIED: Only display the button on small screens
                            <button 
                                onClick={() => setIsFontSizeMenuOpen(true)}
                                className="sm:hidden text-md font-bold text-white p-2 rounded-full bg-night-700 hover:bg-night-600"
                                title="Change Font Size"
                            >
                                A
                            </button>
                        )}

                        {user && (
                            // MODIFIED: The font controls are wrapped in a new conditional container
                            <div className={`
                                flex items-center gap-1 p-1 
                                sm:bg-night-700 sm:rounded-md 
                                ${isFontSizeMenuOpen ? 'fixed inset-0 bg-night-900/90 z-50 flex-col justify-center items-center' : 'hidden sm:flex'}
                            `} 
                                title="Font Size"
                            >
                                {/* ADDITION: Close button for mobile popout */}
                                {isFontSizeMenuOpen && (
                                    <button 
                                        onClick={() => setIsFontSizeMenuOpen(false)} 
                                        className="absolute top-4 right-4 text-white p-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                )}

                                {/* MODIFIED: Font size buttons */}
                                <div className={`flex gap-3 ${isFontSizeMenuOpen ? 'flex-col p-6 bg-night-800 rounded-lg shadow-xl' : ''}`}>
                                    {isFontSizeMenuOpen && <h3 className="text-xl font-bold mb-4">Select Font Size</h3>}
                                    <div className="flex gap-3">
                                        {FONT_SIZES.map(size => (
                                            <button
                                                key={size}
                                                onClick={() => {
                                                    updateFontSize(size);
                                                    if (isFontSizeMenuOpen) setIsFontSizeMenuOpen(false); // Close on selection
                                                }}
                                                className={`px-4 py-2 text-lg font-bold rounded-md transition-colors ${
                                                    userSettings.fontSize === size 
                                                        ? 'bg-brand-blue text-white' 
                                                        : 'text-night-500 hover:bg-night-600'
                                                }`}
                                            >
                                                {size === 'small' ? 'A-' : size === 'large' ? 'A+' : 'A'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

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