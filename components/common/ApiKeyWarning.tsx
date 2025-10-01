import React from 'react';
import { GEMINI_API_KEY, FMP_API_KEY, ALPACA_API_KEY, ALPACA_SECRET_KEY } from '../../constants';

const ApiKeyWarning: React.FC = () => {
  const keysMissing = !GEMINI_API_KEY || !FMP_API_KEY || !ALPACA_API_KEY || !ALPACA_SECRET_KEY;

  if (!keysMissing) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 bg-red-800 text-white p-4 text-center z-50">
      <h3 className="font-bold text-lg">Configuration Incomplete</h3>
      <p className="text-sm">
        One or more API keys are missing. Please create a `.env` file in the root directory and add the following:
      </p>
      <pre className="bg-night-900 text-left p-2 rounded-md mt-2 text-xs">
        {`# For Google Gemini API\nAPI_KEY="YOUR_GEMINI_API_KEY"\n\n# For Financial Modeling Prep API\nFMP_API_KEY="YOUR_FMP_API_KEY"\n\n# For Alpaca API\nALPACA_API_KEY="YOUR_ALPACA_API_KEY"\nALPACA_SECRET_KEY="YOUR_ALPACA_SECRET_KEY"`}
      </pre>
       {!GEMINI_API_KEY && <p className="mt-1">`API_KEY` is missing.</p>}
       {!FMP_API_KEY && <p className="mt-1">`FMP_API_KEY` is missing.</p>}
       {!ALPACA_API_KEY && <p className="mt-1">`ALPACA_API_KEY` is missing.</p>}
       {!ALPACA_SECRET_KEY && <p className="mt-1">`ALPACA_SECRET_KEY` is missing.</p>}
    </div>
  );
};

export default ApiKeyWarning;