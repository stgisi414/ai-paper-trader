import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { SignatexMaxIcon, SignatexLiteIcon } from './common/Icons';
import { createStripeCheckoutSession } from '../services/stripeService';
import Spinner from './common/Spinner';

import {
    PRO_LITE_LIMIT,
    PRO_MAX_LIMIT
} from '../src/hooks/useAuth';

// --- Placeholder Stripe Price IDs (must match SubscriptionModal) ---
const STRIPE_STARTER_PRICE_ID_MONTHLY = "price_1SL54vDWUolxMnmeBHf64yN6"; //'price_1SJiJfGYNyUbUaQ66dsLoGZ2';
const STRIPE_STANDARD_PRICE_ID_MONTHLY = "price_1SL55ZDWUolxMnmenZwS0uEP"; //'price_1SL4zLDWUolxMnme4oYkY7sz';
const STRIPE_PRO_PRICE_ID_MONTHLY = "price_1SL56QDWUolxMnmeg4rKU5oM"; //'price_1SL50GDWUolxMnmeI9lRU9jD';
// ---

const plans = [
  {
    name: "Starter",
    price: "$10/month",
    priceId: STRIPE_STARTER_PRICE_ID_MONTHLY,
    features: ["10 Signatex Max usages", "100 Signatex Lite usages", "Full paper trading access"]
  },
  {
    name: "Standard",
    price: "$20/month",
    priceId: STRIPE_STANDARD_PRICE_ID_MONTHLY,
    features: ["25 Signatex Max usages", "250 Signatex Lite usages", "Full paper trading access"]
  },
  {
    name: "Pro",
    price: "$40/month",
    priceId: STRIPE_PRO_PRICE_ID_MONTHLY,
    features: [
        `${PRO_MAX_LIMIT} Signatex Max usages`,
        `${PRO_LITE_LIMIT} Signatex Lite usages`,
        "Full paper trading access",
        "Advanced charting tools",
        "Priority support"
    ]
  },
];

const PricingPage: React.FC = () => {
    const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);

    const handleSubscribe = async (priceId: string, planName: string) => {
        setError(null);
        setIsLoading(prev => ({ ...prev, [priceId]: true }));
        try {
            // This function will handle redirecting the user
            await createStripeCheckoutSession(priceId, window.location.href, window.location.href);
        } catch (err) {
            console.error(`Checkout for ${planName} failed:`, err);
            setError(err instanceof Error ? err.message : "An unexpected error occurred during checkout.");
            setIsLoading(prev => ({ ...prev, [priceId]: false }));
        }
    };


  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans p-8">
      <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6 text-center">Signatex Pricing Plans</h1>
        <p className="text-center text-lg mb-10 text-gray-600 dark:text-gray-300">
          Choose the plan that best fits your paper trading and AI analysis needs.
        </p>

        {error && <p className="text-center text-red-500 mb-4">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div key={plan.name} className="bg-white dark:bg-gray-700 p-6 rounded-lg shadow-xl border-t-4 border-blue-500 flex flex-col">
              <div className="flex-grow">
                <h2 className="text-2xl font-bold mb-2">{plan.name}</h2>
                <p className="text-3xl font-extrabold text-blue-500 mb-4">{plan.price}</p>
                <ul className="list-disc list-inside space-y-3 text-gray-700 dark:text-gray-200">
                  {plan.features.map((feature, index) => {
                    if (feature.includes('Signatex Max')) {
                      return (
                        <li key={index} className="flex items-center gap-2">
                          <SignatexMaxIcon className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      );
                    }
                    if (feature.includes('Signatex Lite')) {
                      return (
                        <li key={index} className="flex items-center gap-2">
                          <SignatexLiteIcon className="h-5 w-5 text-blue-500 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      );
                    }
                    return (
                      <li key={index}>
                        {feature}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <button
                className="mt-6 w-full py-2 px-4 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 transition duration-300 disabled:bg-gray-500 flex items-center justify-center"
                onClick={() => handleSubscribe(plan.priceId, plan.name)}
                disabled={isLoading[plan.priceId]}
              >
                {isLoading[plan.priceId] ? <Spinner /> : 'Start Trading'}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center p-6 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h3 className="text-xl font-semibold mb-3">Custom Subscription Plan</h3>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Need more capacity or bespoke features? Contact us for a tailored package designed for advanced users and organizations.
          </p>
          <a
            href="mailto:signatexco@gmail.com"
            className="text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition duration-300"
          >
            Contact Sales
          </a>
        </div>

        <div className="mt-8 text-center">
          <Link to="/" className="text-blue-500 hover:underline">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
