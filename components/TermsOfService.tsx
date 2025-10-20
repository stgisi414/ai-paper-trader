import React from 'react';
import { Link } from 'react-router-dom';

const TermsOfService: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans p-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6">Terms of Service (Signatex)</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Last updated: September 23, 2025</p>

        <p className="my-4">
          Please read these Terms of Service ("Terms", "Terms of Service") carefully before using the Signatex application (the "Service") operated by Signatex ("us", "we", or "our"). Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms.
        </p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-4">1. Accounts</h2>
        <p className="mb-4">
          To use our Service, you must create an account using Google's authentication service. You are responsible for safeguarding your account and for any activities or actions under your account. You agree not to disclose your password to any third party.
        </p>

        <h2 className="text-2xl font-semibold mt-6 mb-4">2. Subscriptions and Payments</h2>
        <p className="mb-4">
          The Service offers a free tier with daily usage limits and a paid subscription plan ("Signatex Pro") for unlimited access.
        </p>
        <ul className="list-disc list-inside mb-4 space-y-2">
          <li>
            <strong>Billing:</strong> Subscriptions are billed on a recurring basis (e.g., monthly or yearly). You will be billed in advance on a recurring and periodic basis ("Billing Cycle").
          </li>
          <li>
            <strong>Payment Processor:</strong> All payments are processed through our third-party payment processor, Stripe. By providing payment information, you agree that we may authorize Stripe to charge your payment method for your chosen subscription plan. We do not store your payment card details.
          </li>
          <li>
            <strong>Price Changes:</strong> Signatex, in its sole discretion and at any time, may modify the subscription fees. Any subscription fee change will become effective at the end of the then-current Billing Cycle. We will provide you with reasonable prior notice of any change in subscription fees to give you an opportunity to terminate your subscription before such change becomes effective.
          </li>
        </ul>

        <h2 className="text-2xl font-semibold mt-6 mb-4">3. Subscription Management and Cancellation</h2>
        <p className="mb-4">
          You are solely responsible for managing your subscription. You can manage or cancel your subscription at any time through the Stripe customer billing portal. A link to the portal can be accessed from the "My Info" section within the application.
        </p>
        <p className="mb-4">
          If you cancel your subscription, the cancellation will take effect at the end of your current Billing Cycle. You will not be charged for the next cycle. You will continue to have access to the Pro features of the Service until the end of your current paid period.
        </p>

        <h2 className="text-2xl font-semibold mt-6 mb-4">4. Refund Policy</h2>
        <p className="font-bold mb-4">
          Refunds are only available for the **current subscription month's cost**.
        </p>
        <p className="mb-4">
          If you request a refund for the current billing cycle, your access to the Pro features will be terminated immediately upon processing the refund. We do not offer prorated refunds or credits for any partial subscription periods or unused services. All payments for previous months are non-refundable.
        </p>
        {/* ADDED THIS PARAGRAPH */}
        <p className="mb-4">
          <strong>Subscription Changes:</strong> If you choose to upgrade or downgrade your subscription plan, the change will take effect immediately. You will be charged the full price of the new plan upon changing, and you will not receive a refund or credit for any unused portion of your previous subscription plan.
        </p>

        <h2 className="text-2xl font-semibold mt-6 mb-4">5. Termination</h2>
        <p className="mb-4">
          We may terminate or suspend your account and/or cancel your subscription immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
        </p>

        <h2 className="text-2xl font-semibold mt-6 mb-4">6. Contact Us</h2>
        <p className="mb-4">
          If you have any questions about these Terms, please contact us at: signatexco@gmail.com.
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

export default TermsOfService;
