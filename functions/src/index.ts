import {onRequest} from "firebase-functions/v2/https";
import {Request, Response} from "express";
import * as logger from "firebase-functions/logger";

// FIX 1: Declare the client globally but uninitialized with 'any'
// to avoid compile-time dependency on the class constructor.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let yfClient: any = null;

/**
 * HTTP Cloud Function to proxy the options data request.
 */
exports.optionsProxy = onRequest({
  invoker: "public",
  cors: true,
  region: "us-central1",
}, async (req: Request, res: Response): Promise<void> => {
  // FIX 2: Lazy Initialization using dynamic require inside the handler.
  if (yfClient === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, max-len, @typescript-eslint/no-explicit-any
      const YahooFinanceClient = require("@gadicc/yahoo-finance2").default || require("@gadicc/yahoo-finance2");
      yfClient = new YahooFinanceClient();
    } catch (err) {
      logger.error("Internal Error: Failed to dynamically load options client.", err);
      res.status(503).json({"error": "Internal Error: Options client initialization failed."});
      return;
    }
  }

  try {
    if (req.method !== "GET") {
      logger.warn(`Method Not Allowed: ${req.method}`);
      res.status(405).send("Method Not Allowed");
      return;
    }

    const symbol = req.query.symbol;
    if (!symbol || typeof symbol !== "string") {
      logger.warn("Missing or invalid stock symbol in query.");
      res.status(400).json({
        "error": "Missing or invalid stock symbol.",
      });
      return;
    }

    // Call the Yahoo Finance API for the options chain
    const optionsChain = await yfClient.options(
      symbol.toUpperCase()
    );

    res.status(200).json(optionsChain);
  } catch (error) {
    logger.error("Yahoo Finance API Error (Internal Failure):", error);

    res.status(503).json({
      "error": "Failed to fetch options data from external API.",
    });
  }
});
