import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWorkflowFromPrompt, WorkflowStep } from '../services/signatexFlowService';
import { executeStep, cleanupHighlight } from '../utils/workflowExecutor';
import { SignatexFlowIcon, MicrophoneIcon, SendIcon } from './common/Icons';
import Spinner from './common/Spinner';

interface Message {
    sender: 'user' | 'bot';
    text: string;
}

const SignatexFlow: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    
    const [workflow, setWorkflow] = useState<WorkflowStep[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [isAwaitingContinue, setIsAwaitingContinue] = useState(false);

    const navigate = useNavigate();
    const recognitionRef = useRef<any>(null);
    const chatBodyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Scroll to the bottom of the chat on new messages
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [messages]);

    const addMessage = (sender: 'user' | 'bot', text: string) => {
        setMessages(prev => [...prev, { sender, text }]);
    };
    
    const runNextStep = useCallback(async (steps: WorkflowStep[], index: number) => {
        if (index >= steps.length) {
            addMessage('bot', "I've completed your request. Let me know if there is anything else I can do!");
            setIsLoading(false);
            cleanupHighlight();
            return;
        }

        const step = steps[index];
        setCurrentStepIndex(index);

        if (step.action === 'say') {
            addMessage('bot', step.message || '');
        } else {
             try {
                await executeStep(step, navigate);
             } catch(e) {
                addMessage('bot', `I ran into an issue on that last step. Let's stop here.`);
                setIsLoading(false);
                cleanupHighlight();
                return;
             }
        }
        
        setIsAwaitingContinue(true);

    }, [navigate]);

    const handleContinue = () => {
        setIsAwaitingContinue(false);
        runNextStep(workflow, currentStepIndex + 1);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        addMessage('user', inputValue);
        setIsLoading(true);
        setInputValue('');
        setWorkflow([]);
        setCurrentStepIndex(0);
        setIsAwaitingContinue(false);

        try {
            const response = await getWorkflowFromPrompt(inputValue);
            setWorkflow(response.steps);
            addMessage('bot', "Okay, I've got a plan. Let's start!");
            runNextStep(response.steps, 0);
        } catch (error) {
            console.error(error);
            addMessage('bot', "Sorry, I couldn't figure out how to do that. Can you try rephrasing your request?");
            setIsLoading(false);
        }
    };

    const handleMic = () => {
        if (!('webkitSpeechRecognition' in window)) {
            alert("Speech recognition is not supported in your browser.");
            return;
        }
        
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        const recognition = new (window as any).webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            setIsListening(false);
        };
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setInputValue(transcript);
        };
        
        recognitionRef.current = recognition;
        recognition.start();
    };

    return (
        <>
            <div className="fixed bottom-6 right-6 z-50">
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className="bg-yellow-400 hover:bg-yellow-500 text-night-900 font-bold rounded-full w-16 h-16 flex items-center justify-center shadow-lg transition-transform transform hover:scale-110"
                    aria-label="Toggle Signatex Flow"
                >
                    <SignatexFlowIcon className="w-8 h-8"/>
                </button>
            </div>
            {isOpen && (
                 <div className="fixed bottom-24 right-6 z-50 w-96 bg-night-800 rounded-lg shadow-2xl flex flex-col h-[32rem]">
                    <div className="p-4 border-b border-night-700">
                        <h3 className="text-lg font-bold text-yellow-400 flex items-center gap-2"><SignatexFlowIcon className="w-6 h-6"/> Signatex Flow</h3>
                        <p className="text-xs text-night-500">I can navigate the site for you. Just tell me what you want to do.</p>
                    </div>

                    <div ref={chatBodyRef} className="flex-1 p-4 overflow-y-auto space-y-4">
                       {messages.map((msg, index) => (
                           <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                               <div className={`rounded-lg px-3 py-2 max-w-xs ${msg.sender === 'user' ? 'bg-brand-blue text-white' : 'bg-night-700 text-night-100'}`}>
                                   {msg.text}
                               </div>
                           </div>
                       ))}
                       {isLoading && !isAwaitingContinue && <div className="flex justify-center"><Spinner/></div>}
                    </div>
                    
                    {isAwaitingContinue && (
                        <div className="p-4 border-t border-night-700">
                            <button onClick={handleContinue} className="w-full bg-yellow-400 text-night-900 font-bold py-2 px-4 rounded-md hover:bg-yellow-500">
                                Continue
                            </button>
                        </div>
                    )}

                    <div className="p-4 border-t border-night-700">
                        <form onSubmit={handleSubmit} className="flex items-center gap-2">
                             <button type="button" onClick={handleMic} className={`p-2 rounded-full ${isListening ? 'bg-red-500 animate-pulse' : 'bg-night-700'} hover:bg-night-600`}>
                                <MicrophoneIcon className="w-5 h-5 text-night-100"/>
                            </button>
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="e.g., 'Buy 10 shares of AAPL'"
                                className="flex-1 bg-night-700 border border-night-600 rounded-full py-2 px-4 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                                disabled={isLoading}
                            />
                            <button type="submit" disabled={isLoading || !inputValue.trim()} className="p-2 bg-yellow-400 rounded-full hover:bg-yellow-500 disabled:bg-night-600">
                                <SendIcon className="w-5 h-5 text-night-900" />
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default SignatexFlow;
