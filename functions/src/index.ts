const functions = require('firebase-functions');
const yahooFinance = require('yahoo-finance2').default;
const cors = require('cors');

// 1. Configure Allowed Origins for CORS
// These must match the domains specified: localhost (dev), signatex.app, and signatex-trader.web.app.
const allowedOrigins = [
    // Your local development server address (e.g., from your Vite setup)
    'http://localhost:5173', 
    'https://localhost:5173',
    // Your production and staging addresses
    'https://signatex.app',
    'https://signatex-trader.web.app', 
];

// Initialize the CORS middleware
const corsMiddleware = cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like server-to-server or deployment tools)
        if (!origin) return callback(null, true);
        
        // Check if the origin is in our allowed list
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        
        // Block requests from unapproved origins
        callback(new Error(`CORS policy blocks access from origin: ${origin}`), false);
    },
    methods: 'GET',
});

/**
 * HTTP Cloud Function to proxy the options data request and return Greeks.
 * This is triggered by a GET request with a 'symbol' query parameter.
 */
exports.optionsProxy = functions.https.onRequest(async (req, res) => {
    
    // 2. Wrap the core logic in the CORS middleware
    corsMiddleware(req, res, async () => {
        
        // Ensure method is GET
        if (req.method !== 'GET') {
            return res.status(405).send('Method Not Allowed');
        }

        // Get ticker from query parameters (e.g., ?symbol=AAPL)
        const symbol = req.query.symbol;
        if (!symbol || typeof symbol !== 'string') {
            return res.status(400).json({ error: 'Missing or invalid stock symbol.' });
        }

        try {
            // 3. Call the Yahoo Finance API for the options chain
            // We use the 'options' module to get the chain and Greeks
            const optionsChain = await yahooFinance.options(symbol.toUpperCase());
            
            // 4. Send the raw options data back to the frontend
            return res.status(200).json(optionsChain);

        } catch (error) {
            console.error('Yahoo Finance API Error:', error);
            // Return a generic error message
            return res.status(500).json({ error: 'Failed to fetch options data from external API.' });
        }
    });
});