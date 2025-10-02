import {onRequest} from "firebase-functions/v2/https";
import {Request, Response} from "express";
import yahooFinance from "@gadicc/yahoo-finance2";
import * as logger from "firebase-functions/logger";

// --- IMPORTANT: Use the onRequest from v2 and configure CORS directly ---

/**
 * HTTP Cloud Function to proxy the options data request.
 * * Configured for:
 * 1. Public invocation (invoker: 'public')
 * 2. Automatic CORS handling (cors: true)
 */
exports.optionsProxy = onRequest({
  // Use 'public' invoker to allow unauthenticated access
  // (essential for web apps)
  invoker: "public",
  // Set cors to true for automatic handling of all origins
  // (or list specific origins)
  cors: true,
  // Ensure the region matches your current deployment if necessary,
  // otherwise defaults to us-central1
  region: "us-central1",
}, async (req: Request, res: Response): Promise<void> => {
  // FIX: Explicitly set return type to Promise<void> or just void
  try {
    // Handle OPTIONS preflight requests automatically managed by 'cors: true'
    // Firebase should handle the pre-flight automatically. We just ensure GET.
    if (req.method !== "GET") {
      logger.warn(`Method Not Allowed: ${req.method}`);
      // Send the response but do not try to return it from the outer function
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Get ticker from query parameters (e.g., ?symbol=AAPL)
    const symbol = req.query.symbol;
    if (!symbol || typeof symbol !== "string") {
      logger.warn("Missing or invalid stock symbol in query.");
      // Send the response but do not try to return it from the outer function
      res.status(400).json({
        error: "Missing or invalid stock symbol.",
      });
      return;
    }

    // Call the Yahoo Finance API for the options chain
    // Use the default imported object to access 'options'
    const optionsChain = await yahooFinance.options(
      symbol.toUpperCase()
    );

    // Send the options data back to the frontend
    res.status(200).json(optionsChain);
  } catch (error) {
    // FIX: Log the full error to Firebase logs for internal diagnosis
    logger.error("Yahoo Finance API Error (Internal Failure):", error);

    // Return a generic error message to the client, but use a distinct code
    // to suggest an upstream dependency failure
    // (like Yahoo Finance throttling/blocking).
    res.status(503).json({
      error: "Failed to fetch options data from external API.",
    });
  }
});
