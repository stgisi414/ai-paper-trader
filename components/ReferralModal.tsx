import React, { useState } from 'react';
import { useAuth } from '../src/hooks/useAuth';
import Card from './common/Card';
import Spinner from './common/Spinner';

interface ReferralModalProps {
    isOpen: boolean;
}

const referralOptions = [
    "YouTube/Social Media",
    "Friend or Colleague",
    "Blog Post or Article",
    "App Store / Marketplace",
    "Other"
];

const ReferralModal: React.FC<ReferralModalProps> = ({ isOpen }) => {
    const { user, logReferralSource, userSettings } = useAuth();
    const [selectedSource, setSelectedSource] = useState<string | null>(null);
    const [customSource, setCustomSource] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    // Only show if the component is told to be open AND the user field is exactly null (not 'Skipped' or a source name)
    if (!isOpen || !user || userSettings.referralSource !== null) {
        return null;
    }

    const handleSkip = async () => {
        if (!user) return;
        setIsSaving(true);
        // Save 'Skipped' to mark it as dismissed
        await logReferralSource('Skipped'); 
        setIsSaving(false);
    };

    const handleSubmit = async () => {
        if (!user || isSaving) return;

        let finalSource = selectedSource;
        if (selectedSource === 'Other' && customSource.trim()) {
            finalSource = customSource.trim();
        } else if (!finalSource) {
            alert('Please select a referral source.');
            return;
        }

        setIsSaving(true);
        await logReferralSource(finalSource);
        setIsSaving(false);
    };

    return (
        <div className="fixed inset-0 bg-night-900 bg-opacity-80 flex justify-center items-center z-50 p-4 transition-opacity duration-300">
            <div className="bg-night-800 rounded-lg shadow-2xl w-full max-w-md relative animate-fade-in-up">
                <Card>
                    <h2 className="text-2xl font-bold text-center mb-2 text-yellow-400">
                        Quick Question!
                    </h2>
                    <p className="text-center text-sm text-night-400 mb-6">
                        How did you hear about Signatex.co? (This helps us grow!)
                    </p>

                    <div className="space-y-3">
                        {referralOptions.map(option => (
                            <button
                                key={option}
                                onClick={() => {
                                    setSelectedSource(option);
                                    setCustomSource('');
                                }}
                                className={`w-full text-left p-3 rounded-md transition-colors border ${
                                    selectedSource === option
                                        ? 'bg-brand-blue text-white border-brand-blue'
                                        : 'bg-night-700 text-night-100 border-night-600 hover:bg-night-600'
                                }`}
                            >
                                {option}
                            </button>
                        ))}
                    </div>

                    {selectedSource === 'Other' && (
                        <input
                            type="text"
                            value={customSource}
                            onChange={(e) => setCustomSource(e.target.value)}
                            placeholder="Specify your source"
                            className="w-full bg-night-700 border border-night-600 rounded-md py-2 px-3 mt-3 focus:ring-2 focus:ring-brand-blue focus:outline-none"
                            autoFocus
                        />
                    )}

                    <div className="flex gap-4 mt-6">
                        <button
                            onClick={handleSkip}
                            disabled={isSaving}
                            className="flex-1 bg-night-700 text-night-400 font-bold py-2 px-4 rounded-md hover:bg-night-600 transition-colors disabled:opacity-50"
                        >
                            {isSaving ? <Spinner /> : 'Skip for Now'}
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSaving || !selectedSource || (selectedSource === 'Other' && !customSource.trim())}
                            className="flex-1 bg-brand-green text-white font-bold py-2 px-4 rounded-md hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSaving ? <Spinner /> : 'Submit'}
                        </button>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default ReferralModal;