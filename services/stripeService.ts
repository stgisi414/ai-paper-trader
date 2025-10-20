import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
} from 'firebase/firestore';
import { getAuth, User } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * Creates a checkout session document in Firestore which triggers the
 * Stripe Payments extension to generate a Stripe Checkout session URL.
 * Redirects the user to the Stripe Checkout page.
 *
 * @param priceId The ID of the Stripe Price object for the subscription tier.
 * @param successUrl The URL to redirect the user to after a successful checkout.
 * @param cancelUrl The URL to redirect the user to if they cancel the checkout.
 */
export const createStripeCheckoutSession = async (
  priceId: string,
  successUrl: string = window.location.origin, // Default to current page
  cancelUrl: string = window.location.origin   // Default to current page
): Promise<void> => {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    console.error("User must be logged in to create a checkout session.");
    alert("Please log in to subscribe.");
    return;
  }

  const db = getFirestore();
  const userId = user.uid;

  // 1. Create a new checkout session document in Firestore.
  // The path follows the Stripe Payments extension's expected format:
  // customers/{userId}/checkout_sessions/{sessionId}
  const checkoutSessionRef = collection(db, 'customers', userId, 'checkout_sessions');

  try {
    const docRef = await addDoc(checkoutSessionRef, {
      price: priceId, // The ID of the Stripe Price object.
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Optional: Add trial period days if applicable
      // trial_period_days: 7,
      // Optional: Allow promotion codes
      // allow_promotion_codes: true,
    });

    console.log("Checkout session document created with ID:", docRef.id);

    // 2. Listen for changes on the document.
    // The Stripe Payments extension will update this document with the
    // `url` field for Stripe Checkout or an `error` field.
    const unsubscribe = onSnapshot(docRef, (snap) => {
      const data = snap.data();
      if (data) {
        const { error, url } = data;
        if (error) {
          // Show an error to your customer and inspect
          // your Cloud Function logs in the Firebase console.
          console.error(`An error occurred: ${error.message}`);
          alert(`Error creating checkout session: ${error.message}`);
          unsubscribe(); // Stop listening after error
        }
        if (url) {
          // We have a Stripe Checkout URL, let's redirect.
          console.log("Redirecting to Stripe Checkout:", url);
          unsubscribe(); // Stop listening before redirect
          window.location.assign(url);
        }
      }
    }, (error) => {
      console.error("Error listening to checkout session document:", error);
      alert("Failed to initiate subscription process. Please try again.");
      // Ensure listener is removed on error
      unsubscribe();
    });

  } catch (error) {
    console.error("Error adding checkout session document:", error);
    alert("Could not start the subscription process. Please try again later.");
  }
};

/**
 * Redirects the user to the Stripe Customer Portal by calling the
 * HTTPS Callable function provided by the Stripe Payments extension.
 */
export const redirectToStripeCustomerPortal = async (): Promise<void> => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
        console.error("User must be logged in to access the customer portal.");
        alert("Please log in to manage your subscription.");
        return;
    }

    // Get Firebase Functions instance
    const functions = getFunctions();
    // Get a reference to the specific callable function deployed by the extension
    const createPortalLink = httpsCallable(functions, 'ext-firestore-stripe-payments-createPortalLink');

    try {
        console.log("Calling createPortalLink function..."); // Add log
        // Call the function with required parameters
        const result = await createPortalLink({
          returnUrl: window.location.origin + window.location.pathname, // Return to the current page (HashRouter safe)
          // You can add locale and configuration ID here if needed later
          // locale: "auto",
          // configuration: "bpc_...", // Your Stripe Portal Configuration ID if you have one
        });

        // The result.data should contain the URL
        const data = result.data as { url?: string; error?: { message: string } }; // Type assertion for safety

        if (data.url) {
            console.log("Redirecting to Stripe Customer Portal:", data.url);
            window.location.assign(data.url);
        } else if (data.error) {
             console.error(`Error creating portal link: ${data.error.message}`);
             alert(`Error accessing billing portal: ${data.error.message}`);
        } else {
             console.error("createPortalLink returned unexpected data:", data);
             alert("Failed to get billing portal link.");
        }

    } catch (error) {
        console.error("Error calling createPortalLink function:", error);
        // Handle specific Firebase Functions errors if needed
        const errorMessage = (error instanceof Error && (error as any).message) ? (error as any).message : "Could not connect to the billing portal function.";
        alert(`Could not open the billing portal: ${errorMessage}`);
    }
};