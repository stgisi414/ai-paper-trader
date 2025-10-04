import {onRequest} from "firebase-functions/v2/https";
import {Request, Response} from "express";
import * as logger from "firebase-functions/logger";
import {initializeApp} from "firebase-admin/app";
import {defineString} from "firebase-functions/params";
import { GoogleGenAI, GenerationConfig } from "@google/genai";

initializeApp();

// Define API keys from environment variables
const fmpApiKey = defineString("FMP_API_KEY");
const alpacaApiKey = defineString("ALPACA_API_KEY");
const alpacaApiSecret = defineString("ALPACA_SECRET_KEY");
const geminiApiKey = defineString("GEMINI_API_KEY");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let yfClient: any = null;

// (This is your existing yahoo finance proxy - no changes needed here)
const loadYahooFinanceClient = async () => {
  if (yfClient === null) {
    try {
      /* eslint-disable @typescript-eslint/no-var-requires,
      @typescript-eslint/no-explicit-any */
      yfClient =
        require("yahoo-finance2").default || require("yahoo-finance2");
      /* eslint-enable @typescript-eslint/no-var-requires,
      @typescript-eslint/no-explicit-any */
    } catch (err) {
      logger.error(
        "Internal Error: Failed to dynamically load options client.",
        err,
      );
      throw new Error("Internal Error: Options client initialization failed.");
    }
  }
};

export const optionsProxy = onRequest(
  {
    invoker: "public",
    cors: true,
    region: "us-central1",
  },
  async (req: Request, res: Response): Promise<void> => {
    await loadYahooFinanceClient();
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
          error: "Missing or invalid stock symbol.",
        });
        return;
      }
      const optionsChain = await yfClient.options(symbol.toUpperCase());
      res.status(200).json(optionsChain);
    } catch (error) {
      logger.error("Yahoo Finance API Error (Internal Failure):", error);
      res.status(503).json({
        error: "Failed to fetch options data from external API.",
      });
    }
  },
);

export const fmpProxy = onRequest(
  {
    invoker: "public",
    cors: true,
    region: "us-central1",
    secrets: ["FMP_API_KEY"],
  },
  async (req: Request, res: Response): Promise<void> => {
    const endpoint = req.query.endpoint;
    if (typeof endpoint !== "string") {
      res.status(400).send("Missing endpoint query parameter.");
      return;
    }

    const url = `https://financialmodelingprep.com/api${endpoint}&apikey=${fmpApiKey.value()}`;

    try {
      const apiResponse = await fetch(url);
      const data = await apiResponse.json();
      res.status(apiResponse.status).send(data);
    } catch (error) {
      logger.error("FMP Proxy Error:", error);
      res.status(500).send("Error fetching from FMP API.");
    }
  },
);

export const alpacaProxy = onRequest(
  {
    invoker: "public",
    cors: true,
    region: "us-central1",
    secrets: ["ALPACA_API_KEY", "ALPACA_SECRET_KEY"],
  },
  async (req: Request, res: Response): Promise<void> => {
    const endpoint = req.query.endpoint;
    if (typeof endpoint !== "string") {
      res.status(400).send("Missing endpoint query parameter.");
      return;
    }

    const url = `https://paper-api.alpaca.markets/v2${endpoint}`;

    try {
      const apiResponse = await fetch(url, {
        method: req.method,
        headers: {
          "APCA-API-KEY-ID": alpacaApiKey.value(),
          "APCA-API-SECRET-KEY": alpacaApiSecret.value(),
          "Content-Type": "application/json",
        },
        body: req.method === "POST" ? JSON.stringify(req.body) : undefined,
      });
      const data = await apiResponse.json();
      res.status(apiResponse.status).send(data);
    } catch (error) {
      logger.error("Alpaca Proxy Error:", error);
      res.status(500).send("Error fetching from Alpaca API.");
    }
  },
);

export const geminiProxy = onRequest(
  {
    invoker: "public",
    cors: true,
    region: "us-central1",
    secrets: ["GEMINI_API_KEY"],
  },
  async (req: Request, res: Response): Promise<void> => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const {prompt, model: modelName = "gemini-2.5-flash", schema} = req.body;

      if (!prompt) {
        res.status(400).send("Bad Request: Missing prompt.");
        return;
      }

      // Correctly instantiate with the API key string
      const genAI = new GoogleGenAI(geminiApiKey.value());

      const generationConfig: GenerationConfig = schema ? {
        responseMimeType: "application/json",
        responseSchema: schema,
      } : {};

      // Correctly call generateContent via the model property
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{role: "user", parts: [{text: prompt}]}],
        generationConfig: generationConfig,
      });

      const response = result.response;
      const text = response.text();
      
      res.status(200).send({text});
    } catch (error) {
      logger.error("Gemini Proxy Error:", error);
      if (error instanceof Error) {
        res.status(500)
          .send(`Error generating content from Gemini API: ${error.message}`);
      } else {
        res.status(500).send("Error generating content from Gemini API.");
      }
    }
  },
);