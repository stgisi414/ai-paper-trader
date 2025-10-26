import React from 'react';
import { Link } from 'react-router-dom'; // Use Link for internal navigation

// Define styles inline or keep using Tailwind classes
const styles = `
    body {
        font-family: 'Inter', sans-serif;
    }
    .hero-gradient {
        background: linear-gradient(135deg, #1e1e1e 0%, #121212 100%);
    }
    .feature-card {
        transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .feature-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 10px 20px rgba(0, 120, 255, 0.1), 0 0 15px rgba(100, 100, 255, 0.05);
    }
    /* Add Inter font import if not already globally available */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
`;

const LandingPage: React.FC = () => {
  return (
    <div className="bg-night-900 text-night-100 min-h-screen">
      <style>{styles}</style> {/* Inject styles */}

      {/* Hero Section */}
      <section className="hero-gradient py-20 px-6 text-center">
          <div className="container mx-auto">
              <img src="/logo_no_bg.png" alt="Signatex Logo Large" className="h-24 w-auto mx-auto mb-6" onError={(e) => (e.currentTarget.src = 'https://placehold.co/96x96/1e1e1e/d0d0d0?text=Signatex')} />
              <h1 className="text-4xl md:text-5xl font-bold text-yellow-400 mb-4">Trade Smarter, Not Harder.</h1>
              <p className="text-lg md:text-xl text-night-100 mb-8 max-w-2xl mx-auto">Master the stock market risk-free with Signatex. Leverage AI insights, real market data, and a powerful paper trading platform to hone your skills.</p>
              <Link to="/login" className="bg-brand-green text-white font-bold py-3 px-8 rounded-md hover:bg-green-600 transition-colors text-lg">
                  Start Paper Trading Now
              </Link>
              <p className="text-sm mt-4 text-night-500">Free to start. Upgrade for advanced AI features.</p>
          </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-6 bg-night-800">
          <div className="container mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">Why Choose Signatex?</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {/* Feature 1: AI Insights */}
                  <div className="feature-card bg-night-700 p-6 rounded-lg text-center border border-night-600">
                      {/* SVG Icon for AI */}
                       <svg className="w-12 h-12 text-brand-blue mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      <h3 className="text-xl font-semibold mb-2">AI-Powered Insights</h3>
                      <p className="text-night-300 text-sm">Get AI-driven analysis on news sentiment, technicals, financials, and portfolio risk. Make data-backed decisions.</p>
                  </div>
                  {/* Feature 2: Realistic Simulation */}
                  <div className="feature-card bg-night-700 p-6 rounded-lg text-center border border-night-600">
                      {/* SVG Icon for Paper Trading */}
                       <svg className="w-12 h-12 text-brand-green mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0c1.657 0 3-.895 3-2s-1.343-2-3-2-3-.895-3-2 1.343-2 3-2m-3.5 7.5l-1 1m-1-1l1 1m6-1l1 1m-1-1l-1 1M12 21a9 9 0 110-18 9 9 0 010 18z" /></svg>
                      <h3 className="text-xl font-semibold mb-2">Risk-Free Paper Trading</h3>
                      <p className="text-night-300 text-sm">Practice buying and selling stocks and options with virtual money ($100k starting capital) using real-time market data.</p>
                  </div>
                  {/* Feature 3: Advanced Charting */}
                  <div className="feature-card bg-night-700 p-6 rounded-lg text-center border border-night-600">
                      {/* SVG Icon for Charting */}
                      <svg className="w-12 h-12 text-yellow-400 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
                      <h3 className="text-xl font-semibold mb-2">Advanced Charting</h3>
                      <p className="text-night-300 text-sm">Analyze price movements with candlestick charts and utilize drawing tools to mark trends and patterns.</p>
                  </div>
                  {/* Feature 4: AI Assistant */}
                  <div className="feature-card bg-night-700 p-6 rounded-lg text-center border border-night-600">
                      {/* SVG Icon for AI Assistant */}
                       <svg className="w-12 h-12 text-purple-400 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                      <h3 className="text-xl font-semibold mb-2">AI Chat Assistant</h3>
                      <p className="text-night-300 text-sm">Interact with our AI assistant using natural language to get market info, place trades, or ask for analysis.</p>
                  </div>
              </div>
          </div>
      </section>

      {/* How It Works / Benefits */}
      <section className="py-16 px-6">
          <div className="container mx-auto text-center">
              <h2 className="text-3xl font-bold mb-8">Learn, Practice, and Succeed</h2>
              <div className="max-w-3xl mx-auto space-y-6 text-night-200">
                  <p>Signatex provides a safe environment to experiment with trading strategies. Use real market data without risking real capital. Let our AI guide you with insights you won't find anywhere else.</p>
                  <p>Whether you're a beginner learning the ropes or an experienced trader testing new ideas, Signatex offers the tools you need.</p>
              </div>
          </div>
      </section>

       {/* Pricing Snippet */}
      <section className="py-16 px-6 bg-night-800">
          <div className="container mx-auto text-center">
              <h2 className="text-3xl font-bold mb-4">Simple Pricing</h2>
              <p className="text-night-300 mb-8 max-w-xl mx-auto">Start for free with basic AI features, or upgrade to Pro for extensive AI usage and advanced capabilities.</p>
              <div className="flex flex-col sm:flex-row justify-center items-center gap-6">
                  <div className="bg-night-700 p-6 rounded-lg border border-night-600 max-w-sm w-full">
                      <h3 className="text-xl font-semibold mb-2">Free</h3>
                      <p className="text-lg font-bold mb-4">$0 / month</p>
                      <ul className="text-sm text-night-300 space-y-1 mb-4">
                          <li>Basic Paper Trading</li>
                          <li>Limited AI Lite Usage</li>
                          <li>Standard Charting</li>
                      </ul>
                  </div>
                   <div className="bg-night-700 p-6 rounded-lg border-2 border-yellow-500 max-w-sm w-full relative">
                      <span className="absolute top-0 right-0 bg-yellow-500 text-night-900 text-xs font-bold px-3 py-1 rounded-bl-lg">POPULAR</span>
                      <h3 className="text-xl font-semibold mb-2 text-yellow-400">Pro Plan</h3>
                      <p className="text-lg font-bold mb-4">$120 / month</p>
                      <ul className="text-sm text-night-300 space-y-1 mb-4">
                          <li>Full Paper Trading Access</li>
                          <li>High AI Max & Lite Usage Limits</li>
                          <li>Advanced Charting Tools</li>
                          <li>Priority Support</li>
                      </ul>
                  </div>
              </div>
               <Link to="/pricing" className="inline-block mt-8 text-brand-blue hover:text-blue-400 font-medium transition-colors">
                  View All Pricing Details &rarr;
              </Link>
          </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 text-center hero-gradient">
          <div className="container mx-auto">
              <h2 className="text-3xl font-bold text-yellow-400 mb-4">Ready to Elevate Your Trading?</h2>
              <p className="text-lg text-night-100 mb-8 max-w-2xl mx-auto">Sign up today and start leveraging the power of AI in your paper trading journey.</p>
              <Link to="/login" className="bg-brand-blue text-white font-bold py-3 px-8 rounded-md hover:bg-blue-600 transition-colors text-lg">
                  Get Started for Free
              </Link>
          </div>
      </section>
    </div>
  );
};

export default LandingPage;
