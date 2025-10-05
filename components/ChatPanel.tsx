import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { getWorkflowFromPrompt, WorkflowStep, AppContext } from '../services/signatexFlowService';
import { executeStep, cleanupHighlight } from '../utils/workflowExecutor';
import { MessageSquareIcon, BrainCircuitIcon, UsersIcon, MicrophoneIcon, SendIcon, SearchIcon } from './common/Icons';
import Spinner from './common/Spinner';
import { usePortfolio } from '../hooks/usePortfolio';
import { useWatchlist } from '../hooks/useWatchlist';
import { useAuth } from '../src/hooks/useAuth';
import { subscribeToChat, sendMessage, ChatMessage, clearUnreadMessage } from '../services/chatService';
import { User } from '../types';
import { useNotification } from '../hooks/useNotification';

interface LocalMessage {
    sender: 'user' | 'bot' | 'system';
    text: string;
}

type ChatMode = 'ai' | 'private';

const ChatPanel: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();

    // UI/State Management
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<ChatMode>('ai');
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    
    // Message Arrays
    const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]); // For AI chat
    const [privateChatMessages, setPrivateChatMessages] = useState<ChatMessage[]>([]); // For Private chat (Firestore sync)
    
    // AI Flow State
    const [workflow, setWorkflow] = useState<WorkflowStep[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [isAwaitingContinue, setIsAwaitingContinue] = useState(false);

    // Private Chat State
    const [searchUserQuery, setSearchUserQuery] = useState('');
    const [userSearchResults, setUserSearchResults] = useState<User[]>([]);
    const [privateChatTarget, setPrivateChatTarget] = useState<User | null>(null);

    const recognitionRef = useRef<any>(null);
    const chatBodyRef = useRef<HTMLDivElement>(null);
    const { chatTarget, openChatWith } = useNotification();

    // --- Message Management Helpers ---

    const addLocalMessage = (sender: LocalMessage['sender'], text: string) => {
        setLocalMessages(prev => [...prev, { sender, text }]);
    };
    
    const currentMessages = mode === 'private' 
        ? privateChatMessages.map(msg => ({ 
            sender: msg.senderId === user?.uid ? 'user' : 'bot', // Simplify non-user messages as 'bot'
            text: msg.text
        }))
        : localMessages;

    // --- Effects ---

    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [localMessages, privateChatMessages]);

    useEffect(() => {
        if (!user && isOpen) {
            setIsOpen(false);
            setLocalMessages([]);
            setPrivateChatMessages([]);
            setPrivateChatTarget(null);
        }
    }, [user, isOpen]);

    useEffect(() => {
        if (chatTarget && user) {
            // A notification was clicked, so open the chat panel to that user
            setIsOpen(true);
            setMode('private');
            setPrivateChatTarget(chatTarget);
            
            // Clear the unread message notification from Firestore
            clearUnreadMessage(user.uid, chatTarget.uid);

            // Reset the global target so it doesn't re-trigger
            openChatWith(null);
        }
    }, [chatTarget, user, openChatWith]);
    
    useEffect(() => {
        if (mode !== 'private' || !user || !privateChatTarget) return;

        // When opening a chat, clear the notification for it
        clearUnreadMessage(user.uid, privateChatTarget.uid);

        const unsubscribe = subscribeToChat(
            user.uid, 
            privateChatTarget.uid, 
            (messages) => {
                setPrivateChatMessages(messages);
            }
        );

        // Notify user about new chat
        addLocalMessage('system', `Chat with ${privateChatTarget.displayName} opened.`);

        return () => unsubscribe();
    }, [mode, user, privateChatTarget]);


    // --- AI Flow Logic ---

    const { portfolio } = usePortfolio();
    const { watchlist } = useWatchlist();

    const context: AppContext = useMemo(() => ({
        currentPage: location.pathname,
        currentTicker: params.ticker,
        portfolio: {
            cash: portfolio.cash,
            holdings: portfolio.holdings.map(({ ticker, shares }) => ({ ticker, shares })),
        },
        watchlist: watchlist.map(item => item.ticker),
    }), [location.pathname, params.ticker, portfolio, watchlist]);


    const runNextStep = useCallback(async (steps: WorkflowStep[], index: number) => {
        if (index >= steps.length) {
            addLocalMessage('bot', "I've completed your request. Let me know if there is anything else I can do!");
            setIsLoading(false);
            cleanupHighlight();
            return;
        }

        const step = steps[index];
        setCurrentStepIndex(index);

        if (step.action === 'say') {
            addLocalMessage('bot', step.message || '');
        } else {
             try {
                await executeStep(step, navigate);
             } catch(e) {
                addLocalMessage('bot', `I ran into an issue on that last step. Let's stop here.`);
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

    // --- Search and Chat Logic ---
    
    const handleUserSearch = async (query: string) => {
        setSearchUserQuery(query);
        if (!query.trim()) {
            setUserSearchResults([]);
            return;
        }
        try {
            const response = await fetch(`/userSearch?query=${query}`);
            if (response.ok) {
                const users: User[] = await response.json();
                setUserSearchResults(users);
            }
        } catch (error) {
            console.error("Error searching for users:", error);
        }
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        // Private chat uses Firestore, AI chat uses local state array
        if (mode === 'ai') {
            addLocalMessage('user', inputValue); 
        }

        setIsLoading(true);
        const userMessage = inputValue;
        setInputValue('');
        setWorkflow([]);
        setCurrentStepIndex(0);
        setIsAwaitingContinue(false);

        if (mode === 'ai') {
            try {
                const response = await getWorkflowFromPrompt(userMessage, context);
                setWorkflow(response.steps);
                addLocalMessage('bot', "Okay, I've got a plan. Let's start!");
                runNextStep(response.steps, 0);
            } catch (error) {
                console.error(error);
                addLocalMessage('bot', "Sorry, I couldn't figure out how to do that. Can you try rephrasing your request?");
                setIsLoading(false);
            }
        } else if (mode === 'private' && privateChatTarget && user) {
            try {
                // Pass the full privateChatTarget object
                await sendMessage(user, privateChatTarget, userMessage);
            } catch (error) {
                 console.error(error);
                 addLocalMessage('system', "Failed to send message: Check Firestore rules or network.");
            } finally {
                setIsLoading(false);
            }
        }
    };

    // ... handleMic logic remains the same ...

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


    const renderHeaderContent = () => {
        if (mode === 'ai') {
            return (
                <>
                    <h3 className="text-lg font-bold text-yellow-400 flex items-center gap-2"><BrainCircuitIcon className="w-6 h-6"/> AI Trading Assistant</h3>
                    <p className="text-xs text-night-500">Tell me what you want to do (e.g., "Buy 10 shares of AAPL").</p>
                </>
            );
        }

        // Private Chat Mode
        if (!privateChatTarget) {
            return (
                <div className="space-y-3">
                    <h3 className="text-lg font-bold text-brand-blue flex items-center gap-2"><UsersIcon className="w-6 h-6"/> Private Chat</h3>
                    <p className="text-xs text-night-500">Search for a user by email or name to start a private conversation.</p>
                    <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
                        <input
                            type="text"
                            value={searchUserQuery}
                            onChange={(e) => handleUserSearch(e.target.value)}
                            placeholder="Search user by email/name..."
                            className="flex-1 bg-night-700 border border-night-600 rounded-md py-1 px-3 focus:ring-2 focus:ring-brand-blue focus:outline-none text-sm"
                        />
                    </form>
                    {userSearchResults.length > 0 && (
                        <ul className="bg-night-700 rounded-md max-h-32 overflow-y-auto">
                            {userSearchResults.map((userResult) => (
                                <li key={userResult.uid} onClick={() => {
                                    setPrivateChatTarget(userResult);
                                    setUserSearchResults([]);
                                    setSearchUserQuery('');
                                }} className="p-2 hover:bg-night-600 cursor-pointer text-sm">
                                    <span className="font-bold">{userResult.displayName}</span>
                                    <span className="text-xs text-night-500 block">{userResult.email}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            );
        }

        return (
            <div className="space-y-1">
                <h3 className="text-lg font-bold text-brand-blue flex justify-between items-center">
                    <span>Chatting with: {privateChatTarget.displayName}</span>
                    <button onClick={() => {
                        setPrivateChatTarget(null);
                        setPrivateChatMessages([]); // FIX: Clear messages on end chat
                    }} className="text-xs text-night-500 hover:text-night-100">End Chat</button>
                </h3>
                <p className="text-xs text-night-500">{privateChatTarget.email}</p>
            </div>
        );

    };


    return (
        <>
            {user && (
                <div className="fixed bottom-6 right-6 z-50">
                    <button 
                        onClick={() => setIsOpen(!isOpen)}
                        className="bg-yellow-400 hover:bg-yellow-500 text-night-900 font-bold rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-transform transform hover:scale-110"
                        aria-label="Toggle Chat Panel"
                    >
                        <MessageSquareIcon className="w-7 h-7"/>
                    </button>
                </div>
            )}

            {isOpen && user && (
                 <div className="fixed bottom-24 right-6 z-50 w-96 bg-night-800 rounded-lg shadow-2xl flex flex-col h-[32rem]">
                    <div className="p-4 border-b border-night-700 space-y-3">
                        <div className="flex justify-around items-center bg-night-700 rounded-full p-1">
                            <button 
                                onClick={() => { setMode('ai'); setLocalMessages([]); setIsAwaitingContinue(false); cleanupHighlight(); setPrivateChatTarget(null); setPrivateChatMessages([]); }}
                                className={`w-1/2 py-1.5 rounded-full text-sm font-bold transition-colors flex items-center justify-center gap-1 ${mode === 'ai' ? 'bg-yellow-400 text-night-900' : 'text-night-100 hover:bg-night-600'}`}
                            >
                                <BrainCircuitIcon className="w-4 h-4"/> AI Assistant
                            </button>
                            <button 
                                onClick={() => { setMode('private'); setLocalMessages([]); setIsAwaitingContinue(false); cleanupHighlight(); }}
                                className={`w-1/2 py-1.5 rounded-full text-sm font-bold transition-colors flex items-center justify-center gap-1 ${mode === 'private' ? 'bg-brand-blue text-white' : 'text-night-100 hover:bg-night-600'}`}
                            >
                                <UsersIcon className="w-4 h-4"/> Private Chat
                            </button>
                        </div>
                        {renderHeaderContent()}
                    </div>

                    <div ref={chatBodyRef} className="flex-1 p-4 overflow-y-auto space-y-4">
                       {currentMessages.map((msg, index) => (
                           <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                               <div className={`rounded-lg px-3 py-2 max-w-xs text-sm ${
                                   msg.sender === 'user' ? 'bg-brand-blue text-white' : 
                                   msg.sender === 'bot' ? 'bg-night-700 text-night-100' : 
                                   'bg-night-600 text-night-500 italic'
                               }`}>
                                   {msg.text}
                               </div>
                           </div>
                       ))}
                       {isLoading && !isAwaitingContinue && <div className="flex justify-center"><Spinner/></div>}
                    </div>
                    
                    {isAwaitingContinue && mode === 'ai' && (
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
                                placeholder={mode === 'ai' ? "e.g., 'Buy 10 shares of AAPL'" : "Type a message..."}
                                className="flex-1 bg-night-700 border border-night-600 rounded-full py-2 px-4 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                                disabled={isLoading || (mode === 'private' && !privateChatTarget)}
                            />
                            <button type="submit" disabled={isLoading || !inputValue.trim() || (mode === 'private' && !privateChatTarget && inputValue.trim())} className="p-2 bg-yellow-400 rounded-full hover:bg-yellow-500 disabled:bg-night-600">
                                <SendIcon className="w-5 h-5 text-night-900" />
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default ChatPanel;