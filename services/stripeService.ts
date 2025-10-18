import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
} from 'firebase/firestore';
import { getAuth, User } from 'firebase/auth';

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
 * Redirects the user to the Stripe Customer Portal.
 * This function creates a portal session document in Firestore, which the
 * Stripe Payments extension listens to.
 */
export const redirectToStripeCustomerPortal = async (): Promise<void> => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
        console.error("User must be logged in to access the customer portal.");
        alert("Please log in to manage your subscription.");
        return;
    }

    const db = getFirestore();
    const userId = user.uid;
    const portalLinkRef = collection(db, 'customers', userId, 'portal_links');

    try {
        const docRef = await addDoc(portalLinkRef, {
            return_url: window.location.origin, // URL user returns to after portal
            // locale: 'auto', // Optional: Use browser locale
            // configuration: 'YOUR_STRIPE_PORTAL_CONFIGURATION_ID' // Optional
        });

        console.log("Portal link document created with ID:", docRef.id);

        const unsubscribe = onSnapshot(docRef, (snap) => {
            const data = snap.data();
            if (data) {
                const { error, url } = data;
                if (error) {
                    console.error(`An error occurred creating portal link: ${error.message}`);
                    alert(`Error accessing billing portal: ${error.message}`);
                    unsubscribe();
                }
                if (url) {
                    console.log("Redirecting to Stripe Customer Portal:", url);
                    unsubscribe();
                    window.location.assign(url);
                }
            }
        }, (error) => {
            console.error("Error listening to portal link document:", error);
            alert("Failed to access billing portal. Please try again.");
            unsubscribe();
        });

    } catch (error) {
        console.error("Error adding portal link document:", error);
        alert("Could not access the billing portal. Please try again later.");
    }
};