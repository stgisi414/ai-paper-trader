
import React from 'react';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import { PortfolioProvider } from './hooks/usePortfolio';
import Dashboard from './components/Dashboard';
import StockView from './components/StockView';
import ApiKeyWarning from './components/common/ApiKeyWarning';
import { TrendingUpIcon } from './components/common/Icons';

const App: React.FC = () => {
    return (
        <PortfolioProvider>
            <HashRouter>
                <ApiKeyWarning />
                <div className="min-h-screen text-night-100">
                    <header className="bg-night-800 shadow-md p-4 sticky top-0 z-10">
                        <nav className="container mx-auto flex justify-between items-center">
                            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-white">
                                <TrendingUpIcon className="h-6 w-6 text-brand-blue"/>
                                AI Paper Trader
                            </Link>
                        </nav>
                    </header>
                    <main className="container mx-auto p-4 md:p-6 lg:p-8">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/stock/:ticker" element={<StockView />} />
                        </Routes>
                    </main>
                     <footer className="text-center p-4 text-night-500 text-xs border-t border-night-800 mt-8">
                        <p>Disclaimer: This is a paper trading application for educational purposes only. Not financial advice.</p>
                        <p>&copy; 2024 AI Paper Trader. Market data provided by Financial Modeling Prep.</p>
                    </footer>
                </div>
            </HashRouter>
        </PortfolioProvider>
    );
};

export default App;
