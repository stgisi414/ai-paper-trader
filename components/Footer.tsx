import React from 'react';
import { Link } from 'react-router-dom';

interface FooterProps {
    openSubscriptionModal: () => void;
}

const Footer: React.FC<FooterProps> = ({ openSubscriptionModal }) => {
  return (
    <footer className="w-full bg-white dark:bg-gray-800 shadow-lg mt-8 border-t border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center text-sm text-gray-500 dark:text-gray-400">
        
        <div className="mb-2 sm:mb-0 text-center sm:text-left">
          &copy; {new Date().getFullYear()} Signatex. All rights reserved.
        </div>
        
        <div className="flex space-x-4">
          <Link 
            to="/pricing" 
            className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors duration-200"
          >
            Pricing
          </Link>
           {/* New Subscription Button */}
          <button 
            onClick={openSubscriptionModal} 
            className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors duration-200"
          >
            Subscription
          </button>
          <Link 
            to="/terms" 
            className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors duration-200"
          >
            Terms of Service
          </Link>
          <Link 
            to="/privacy" 
            className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors duration-200"
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
