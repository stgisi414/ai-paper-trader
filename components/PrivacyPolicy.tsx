import React from 'react';
import { Link } from 'react-router-dom';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans p-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6">Privacy Policy (Signatex)</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Last updated: October 18, 2025</p>

        <h2 className="text-2xl font-semibold mt-6 mb-4">1. Information We Collect</h2>
        <p className="mb-4">
          When you use the Signatex application, we collect information necessary to provide and improve the Service:
        </p>
        <ul className="list-disc list-inside mb-4 space-y-2">
          <li>
            <strong>Authentication Data:</strong> We use Google Authentication, which provides us with your name and email address.
          </li>
          <li>
            <strong>Usage Data:</strong> We track which stocks you view, trades you execute (in the paper trading environment), and interactions with the AI chat feature to improve our models and service performance.
          </li>
        </ul>

        <h2 className="text-2xl font-semibold mt-6 mb-4">2. How We Use Your Information</h2>
        <p className="mb-4">
          We use the data we collect to:
        </p>
        <ul className="list-disc list-inside mb-4 space-y-2">
          <li>
            Provide and maintain the Service, including the paper trading ledger and personalized watchlist.
          </li>
          <li>
            Analyze usage to monitor the effectiveness and performance of the Service.
          </li>
          <li>
            Process subscription payments via our third-party provider, Stripe. We do not store financial details.
          </li>
        </ul>

        <h2 className="text-2xl font-semibold mt-6 mb-4">3. Data Security</h2>
        <p className="mb-4">
          The security of your data is important to us, but remember that no method of transmission over the Internet or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your data, we cannot guarantee its absolute security.
        </p>

        <div className="mt-8">
          <Link to="/" className="text-blue-500 hover:underline">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;