import * as functions from "firebase-functions";
import {Request, Response} from "express";
// FIX: Change to default import for functional package access (TS2614 fix)
import yahooFinance from "@gadicc/yahoo-finance2";
// FIX: Revert cors to require for runtime stability (TS6133 fix)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cors = require("cors");

// 1. Configure Allowed Origins for CORS
/* const allowedOrigins = [
  "http://localhost:5173",
  "https://localhost:5173",
  "https://signatex.app",
  "https://signatex-trader.web.app",
]; */

// Initialize the CORS middleware
// Using the cors function directly, configured with allowed origins and methods
const corsMiddleware = cors({
  origin: true,
  methods: ["GET"], // Explicitly allow GET method for pre-flight requests
});

/**
 * HTTP Cloud Function to proxy the options data request and return Greeks.
 */
exports.optionsProxy = functions.https.onRequest(
  async (req: Request, res: Response) => {
    // 2. Apply the CORS middleware. The core function logic is passed as the
    // third argument (next()).
    corsMiddleware(req, res, async () => {
      // Ensure method is GET
      if (req.method !== "GET") {
        return res.status(405).send("Method Not Allowed");
      }

      // Get ticker from query parameters (e.g., ?symbol=AAPL)
      const symbol = req.query.symbol;
      if (!symbol || typeof symbol !== "string") {
        return res.status(400).json({
          error: "Missing or invalid stock symbol.",
        });
      }

      try {
        // 3. Call the Yahoo Finance API for the options chain
        // Use the default imported object to access 'options'
        const optionsChain = await yahooFinance.options(
          symbol.toUpperCase()
        );

        // 4. Send the raw options data back to the frontend
        return res.status(200).json(optionsChain);
      } catch (error) {
        console.error("Yahoo Finance API Error:", error);
        // Return a generic error message
        return res.status(500).json({
          error: "Failed to fetch options data from external API.",
        });
      }
    });
  }
);
