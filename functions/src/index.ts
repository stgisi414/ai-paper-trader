import * as functions from "firebase-functions";
import {Request, Response} from "express";
// FIX: Change to default import for functional package access (TS2614 fix)
import yahooFinance from "@gadicc/yahoo-finance2";
// FIX: Revert cors to require for runtime stability (TS6133 fix)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const corsModule = require("cors");

// Safely extract the cors function, handling module interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const corsMiddlewareFactory = (corsModule as any).default || corsModule;

// 1. Configure Allowed Origins for CORS
const allowedOrigins = [
  "http://localhost:5173",
  "https://localhost:5173",
  "https://signatex.app",
  "https://signatex-trader.web.app",
];

// Initialize the CORS middleware
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const corsMiddleware = (corsMiddlewareFactory as any)({
  // Add explicit types for origin and callback
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    // Allow requests with no origin
    if (!origin) return callback(null, true);

    // Check if the origin is in our allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Block requests from unapproved origins
    callback(
      new Error(`CORS policy blocks access from origin: ${origin}`),
      false
    );
  },
  methods: "GET",
});

/**
 * HTTP Cloud Function to proxy the options data request and return Greeks.
 */
exports.optionsProxy = functions.https.onRequest(
  async (req: Request, res: Response) => {
    // 2. Wrap the core logic in the CORS middleware
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (corsMiddleware as any)(req, res, async () => {
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
