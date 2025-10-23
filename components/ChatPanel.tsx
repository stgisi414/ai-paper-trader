import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useParams, Link } from 'react-router-dom';
import { getWorkflowFromPrompt, AppContext } from '../services/signatexFlowService';
import { executeStep, cleanupHighlight } from '../utils/workflowExecutor';
import { MessageSquareIcon, UsersIcon, MicrophoneIcon, SendIcon, TrashIcon, AssistantIcon } from './common/Icons';
import Spinner from './common/Spinner';
import { usePortfolio } from '../hooks/usePortfolio';
import { useWatchlist } from '../hooks/useWatchlist';
import { useAuth } from '../src/hooks/useAuth';
import { subscribeToChat, sendMessage, ChatMessage, clearUnreadMessage, clearAiChatHistory } from '../services/chatService';
import { User, AiChatMessage, WorkflowStep } from '../types';
import { useNotification } from '../hooks/useNotification';
import { collection, onSnapshot, query, orderBy, addDoc, limit } from 'firebase/firestore';
import { db } from '../src/firebaseConfig';
import { nanoid } from 'nanoid';

const CHAT_PANEL_OPEN_KEY = 'signatexChatOpen';

type ChatMode = 'ai' | 'private';

interface RecentChat extends User {
    lastMessage: string;
    timestamp: any; // Firestore timestamp
}

const DESKTOP_WIDTH = 384; 
const DESKTOP_HEIGHT = 512; 
const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;
const HANDLE_SIZE = 16;

const ChatPanel: React.FC = () => {
    const { user, checkUsage, logUsage, onLimitExceeded } = useAuth();
    const authFunctions = { checkUsage, logUsage, onLimitExceeded };

    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();

    // UI/State Management
    const [isOpen, setIsOpen] = useState(() => {
        try {
            const savedState = localStorage.getItem(CHAT_PANEL_OPEN_KEY);
            return savedState === 'true';
        } catch {
            return false;
        }
    });
    const [mode, setMode] = useState<ChatMode>('ai');
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    
    // Message Arrays
    const [localMessages, setLocalMessages] = useState<AiChatMessage[]>([]); // For AI chat
    const [privateChatMessages, setPrivateChatMessages] = useState<ChatMessage[]>([]); // For Private chat (Firestore sync)
    
    // AI Flow State
    const [workflow, setWorkflow] = useState<WorkflowStep[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [isAwaitingContinue, setIsAwaitingContinue] = useState(false);

    // Private Chat State
    const [searchUserQuery, setSearchUserQuery] = useState('');
    const [userSearchResults, setUserSearchResults] = useState<User[]>([]);
    const [privateChatTarget, setPrivateChatTarget] = useState<User | null>(null);
    const [recentChats, setRecentChats] = useState<RecentChat[]>([]);

    const recognitionRef = useRef<any>(null);
    const chatBodyRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<HTMLDivElement>(null);
    const { chatTarget, openChatWith } = useNotification();

    const [isDesktop, setIsDesktop] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }); 

    const [activeInteraction, setActiveInteraction] = useState<'move' | 'br' | 'bl' | 'tr' | 'tl' | null>(null);

    const [position, setPosition] = useState({ x: 0, y: 0 }); // Top-Left position
    const [dimensions, setDimensions] = useState({ width: DESKTOP_WIDTH, height: DESKTOP_HEIGHT });

    const linkifyTickers = (text: string, currentTicker: string | undefined): (string | JSX.Element)[] => {
        // Regex to match 2-5 uppercase letters (common ticker format) not followed by more letters
        // and ensuring it's not part of a longer word (using word boundaries)
        const tickerRegex = /\b[A-Z]{2,5}\b/g; 
        let parts: (string | JSX.Element)[] = [];
        let lastIndex = 0;
        let match;

        while ((match = tickerRegex.exec(text)) !== null) {
            const symbol = match[0];
            const startIndex = match.index;
            
            // 1. Add the text segment before the match
            if (startIndex > lastIndex) {
                parts.push(text.substring(lastIndex, startIndex));
            }

            // 2. Add the linked ticker element
            // Skip linking the current page's ticker to avoid redundancy
            if (symbol === currentTicker) {
                parts.push(<strong key={`${symbol}-${startIndex}`}>{symbol}</strong>);
            } else {
                parts.push(
                    <Link 
                        key={`${symbol}-${startIndex}`} 
                        to={`/stock/${symbol}`} 
                        className="font-bold text-yellow-400 hover:underline"
                    >
                        {symbol}
                    </Link>
                );
            }

            lastIndex = tickerRegex.lastIndex;
        }

        // 3. Add the remaining text segment
        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
        }

        return parts;
    };

    // --- Firestore Operations for AI Chat ---

    const AI_CHAT_COLLECTION = 'aiChatMessages';

    // Function to save a message to AI Chat history
    const saveAiMessage = async (sender: 'user' | 'bot' | 'system', text: string) => {
        if (!user) return;
        const messagesRef = collection(db, 'users', user.uid, 'aiChatMessages');
        try {
            await addDoc(messagesRef, { id: nanoid(), sender, text, timestamp: Date.now() });
        } catch (error) {
            console.error("Error saving AI chat message:", error);
        }
    };

    // --- Message Management Helpers ---

    // Map Firestore messages to a simple format for rendering
    const currentMessages = useMemo(() => {
        // ADDITION: Get the current ticker from the route params
        const currentTicker = params.ticker?.toUpperCase();
        
        if (mode === 'private') {
             return privateChatMessages.map(msg => ({ 
                sender: msg.senderId === user?.uid ? 'user' : 'bot', 
                text: msg.text
            }));
        }
        // AI chat uses AiChatMessage[] directly
        return localMessages.map(msg => ({ 
            sender: msg.sender, 
            text: msg.text 
        }));
    }, [mode, privateChatMessages, localMessages, user, params.ticker]);
    // --- Effects ---

    //Chat panel open key
    useEffect(() => {
        try {
            localStorage.setItem(CHAT_PANEL_OPEN_KEY, String(isOpen));
        } catch (error) {
            console.error("Failed to save chat panel state to localStorage:", error);
        }
    }, [isOpen]);

    //chat body ref scorll
    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [localMessages, privateChatMessages]);

    //screen size check
    useEffect(() => {
        const checkIsDesktop = () => {
            // Check for Tailwind's 'md' breakpoint (typically 768px)
            const newIsDesktop = window.innerWidth >= 768;
            setIsDesktop(newIsDesktop);
            
            // Only calculate initial position once for desktop when the chat is open
            // This runs only if the component loads *on* desktop, effectively calculating the bottom-right corner.
            if (newIsDesktop && position.x === 0 && position.y === 0) {
                // Initial fixed position was: right-6 (24px), bottom-24 (96px).
                const initialX = window.innerWidth - DESKTOP_WIDTH - 24; 
                const initialY = window.innerHeight - DESKTOP_HEIGHT - 96; 
                setPosition({ x: initialX, y: initialY });
            }
        };

        checkIsDesktop();
        window.addEventListener('resize', checkIsDesktop);
        return () => window.removeEventListener('resize', checkIsDesktop);
    }, [position.x, position.y]);

    useEffect(() => {
        const checkIsDesktop = () => {
            const newIsDesktop = window.innerWidth >= 768;
            setIsDesktop(newIsDesktop);
            
            if (newIsDesktop && position.x === 0 && position.y === 0) {
                const initialX = window.innerWidth - DESKTOP_WIDTH - 24; 
                const initialY = window.innerHeight - DESKTOP_HEIGHT - 96; 
                setPosition({ x: initialX, y: initialY });
            }
        };

        checkIsDesktop();
        window.addEventListener('resize', checkIsDesktop);
        return () => window.removeEventListener('resize', checkIsDesktop);
    }, [position.x, position.y]); // Keep the dependency array as is

    // MODIFIED: Combined handler for all mouse-down events
    const handleInteractionStart = useCallback((e: React.MouseEvent, mode: 'move' | 'br' | 'bl' | 'tr' | 'tl') => {
        if (!isDesktop) return;
        e.preventDefault();
        e.stopPropagation(); 
        
        setIsResizing(true);
        setActiveInteraction(mode);
        
        // Store starting mouse position
        setDragOffset({
            x: e.clientX,
            y: e.clientY,
        });

    }, [isDesktop]);

    // MODIFIED: Core logic now handles moving and resizing all corners
    useEffect(() => {
        if (!isDesktop) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing || !activeInteraction) return;

            const currentX = e.clientX;
            const currentY = e.clientY;
            
            let newX = position.x;
            let newY = position.y;
            let newWidth = dimensions.width;
            let newHeight = dimensions.height;
            
            const dx = currentX - dragOffset.x;
            const dy = currentY - dragOffset.y;

            if (activeInteraction === 'move') {
                // Moving: Just adjust position
                newX = Math.min(Math.max(position.x + dx, 0), window.innerWidth - dimensions.width);
                newY = Math.min(Math.max(position.y + dy, 0), window.innerHeight - dimensions.height);
                
                setPosition({ x: newX, y: newY });
                // Reset offset to the current mouse position to continue the move
                setDragOffset({ x: currentX, y: currentY });

            } else {
                // Resizing: Logic depends on the corner
                const isTop = activeInteraction.includes('t');
                const isLeft = activeInteraction.includes('l');
                const isBottom = activeInteraction.includes('b');
                const isRight = activeInteraction.includes('r');
                
                if (isRight) {
                    newWidth = Math.min(Math.max(MIN_WIDTH, dimensions.width + dx), window.innerWidth - position.x);
                }
                if (isBottom) {
                    newHeight = Math.min(Math.max(MIN_HEIGHT, dimensions.height + dy), window.innerHeight - position.y);
                }
                if (isLeft) {
                    newWidth = Math.min(Math.max(MIN_WIDTH, dimensions.width - dx), position.x + dimensions.width);
                    if (newWidth > MIN_WIDTH) {
                         newX = position.x + dx;
                    }
                }
                if (isTop) {
                    newHeight = Math.min(Math.max(MIN_HEIGHT, dimensions.height - dy), position.y + dimensions.height);
                    if (newHeight > MIN_HEIGHT) {
                        newY = position.y + dy;
                    }
                }
                
                // Update state if changes occurred
                if (newX !== position.x || newY !== position.y) {
                    setPosition({ x: newX, y: newY });
                }
                if (newWidth !== dimensions.width || newHeight !== dimensions.height) {
                    setDimensions({ width: newWidth, height: newHeight });
                }

                // Reset offset to the current mouse position to continue the resize
                setDragOffset({ x: currentX, y: currentY });
            }
        };

        const handleMouseUp = () => {
            if (isResizing) {
                setIsResizing(false);
                setActiveInteraction(null);
            }
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, activeInteraction, dragOffset, position, dimensions, isDesktop]);

    useEffect(() => {
        if (!user) {
            setIsOpen(false);
            setLocalMessages([]);
            setPrivateChatMessages([]);
            setPrivateChatTarget(null);
        }
    }, [user, isOpen]);

    // Effect to subscribe to AI Chat messages (loads chat history)
    useEffect(() => {
        if (!user || mode !== 'ai') {
            setLocalMessages([]);
            return;
        }

        // Fetch last 50 AI messages ordered by timestamp
        const messagesRef = collection(db, 'users', user.uid, AI_CHAT_COLLECTION);
        const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(50));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs
                .map(doc => doc.data() as AiChatMessage)
                .sort((a, b) => a.timestamp - b.timestamp); // Sort ascending for correct display order
            setLocalMessages(messages);
        });

        return () => unsubscribe();
    }, [user, mode]);
    
    // Effect to subscribe to recent chats history
    useEffect(() => {
        if (!user || mode !== 'private') {
            // Only clear if we switch away from private mode, otherwise keep it around
            if (mode === 'ai' && recentChats.length > 0) setRecentChats([]); 
            return;
        }

        const historyRef = collection(db, 'users', user.uid, 'chatHistory');
        const q = query(historyRef, orderBy('timestamp', 'desc'), limit(15)); // limit to 15 recent chats

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const chats = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    // The UID of the other user is the document ID of the chatHistory entry
                    uid: doc.id, 
                    displayName: data.displayName,
                    email: data.email,
                    photoURL: data.photoURL,
                    lastMessage: data.lastMessage,
                    // ADDITION: Convert Firestore Timestamp object to millisecond number (if necessary)
                    timestamp: data.timestamp?.toMillis() || Date.now(), 
                } as RecentChat;
            });
            setRecentChats(chats);
            
            // ADDITION: Debug logging to list chat history
            console.log("DEBUG: Fetched Recent Chat History:", chats);
        });

        return () => unsubscribe();
    // MODIFICATION: No change to dependencies needed, they are correct.
    }, [user, mode]);

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

        // Note: System message about opening chat is now removed to avoid duplication/confusion
        
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
            saveAiMessage('bot', "I've completed your request. Let me know if there is anything else I can do!");
            setIsLoading(false);
            cleanupHighlight();
            return;
        }

        const step = steps[index];
        setCurrentStepIndex(index);

        if (step.action === 'say') {
            saveAiMessage('bot', step.message || '');
        } else {
             try {
                // If it's a navigational step, first indicate what's happening
                // FIX: Use a fallback string if step.comment is missing or falsy.
                const systemMessage = step.comment || `Executing action: ${step.action} to fulfill your request.`; 
                saveAiMessage('system', systemMessage); // Save comment as system message
                await executeStep(step, navigate);
             } catch(e) {
                saveAiMessage('bot', `I ran into an issue on that last step. Let's stop here.`);
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
        // If query is empty, clear results immediately and return
        if (!query.trim()) { 
            setUserSearchResults([]);
            return;
        }
        
        // This is a proxy call to the Firebase Function
        try {
            // FIX: Ensure the proxy call uses the correct format and handles the array response
            const response = await fetch(`/userSearch?query=${encodeURIComponent(query.trim())}`);
            
            if (response.ok) {
                const users: User[] = await response.json();
                // We should filter out the current user just in case the backend missed it
                const filteredUsers = users.filter(u => u.uid !== user?.uid); 
                setUserSearchResults(filteredUsers);
            } else {
                console.error("User Search API failed:", response.status, await response.text());
                setUserSearchResults([]);
            }
        } catch (error) {
            console.error("Error searching for users:", error);
            setUserSearchResults([]);
        }
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const userMessage = inputValue;
        setInputValue('');
        
        if (mode === 'ai') {
            const tempUserMessage: AiChatMessage = {
                id: nanoid(), // Use nanoid for temporary local ID
                sender: 'user',
                text: userMessage,
                timestamp: Date.now(),
            };
            setLocalMessages(prev => [...prev, tempUserMessage]);
            
            await saveAiMessage('user', userMessage); // Save user message first

            setIsLoading(true);
            setWorkflow([]);
            setCurrentStepIndex(0);
            setIsAwaitingContinue(false);
            
            try {
                const response = await getWorkflowFromPrompt(userMessage, context, authFunctions);
                setWorkflow(response.steps);
                // The next bot message is added inside runNextStep
                runNextStep(response.steps, 0); 
            } catch (error) {
                console.error(error);
                if ((error as Error).message !== 'Usage limit exceeded') {
                    saveAiMessage('bot', "Sorry, I couldn't figure out how to do that. Can you try rephrasing your request?");
                }
            } finally {
                setIsLoading(false);
            }
        } else if (mode === 'private' && privateChatTarget && user) {
             try {
                await sendMessage(user, privateChatTarget, userMessage);
            } catch (error) {
                 console.error(error);
            } finally {
                setIsLoading(false);
            }
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

    const handleClearChat = useCallback(async () => {
        if (!user || mode !== 'ai' || isLoading) return;
        
        // 1. Clear chat from DB
        setIsLoading(true);
        // The service function handles deleting all messages
        await clearAiChatHistory(user.uid);
        
        // 2. The Firestore listener will update localMessages to empty.
        // The welcome message will then be rendered because localMessages is empty.
        setIsLoading(false);
    }, [user, mode, isLoading]);

    const renderHeaderContent = () => {
        if (mode === 'ai') {
            return (
                <div className="space-y-1"> 
                    <div className="flex justify-between items-center"> {/* NEW ROW to hold header and button */}
                        <h3 className="text-lg font-bold text-yellow-400 flex items-center gap-2">
                            <AssistantIcon className="w-6 h-6"/> AI Trading Assistant
                        </h3>
                        {/* ADDITION: Clear Chat Button */}
                        <button 
                            onClick={handleClearChat} 
                            disabled={isLoading}
                            className="text-night-500 hover:text-brand-red disabled:opacity-50"
                            title="Clear AI Chat History"
                        >
                            <TrashIcon className="w-5 h-5"/>
                        </button>
                    </div>
                    <p className="text-xs text-night-500">Tell me what you want to do (e.g., "Buy 10 shares of AAPL").</p>
                </div>
            );
        }

        // Private Chat Mode
        if (!privateChatTarget) {
            let middleContent;
            const isSearching = searchUserQuery.trim().length > 0;

            if (isSearching) {
                if (userSearchResults.length > 0) {
                     middleContent = (
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
                    );
                } else {
                     middleContent = <div className="mt-2 text-center text-sm text-night-500">No users found matching "{searchUserQuery}".</div>;
                }
            } else {
                if (recentChats.length > 0) {
                     middleContent = (
                        <div className="mt-2">
                            <h4 className="text-xs text-night-500 mb-1 px-2 font-bold uppercase tracking-wider">Recent Chats</h4>
                            <ul className="bg-night-700 rounded-md max-h-32 overflow-y-auto">
                                {recentChats.map((chat) => (
                                    <li key={chat.uid} onClick={() => {
                                        setPrivateChatTarget(chat);
                                    }} className="p-2 hover:bg-night-600 cursor-pointer text-sm">
                                        <span className="font-bold">{chat.displayName}</span>
                                        <p className="text-xs text-night-500 truncate italic">"{chat.lastMessage}"</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                } else {
                     middleContent = <div className="mt-2 text-center text-sm text-night-500">No recent chats. Search for a user to start one!</div>;
                }
            }

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
                    {middleContent}
                </div>
            );
        }

        return (
            <div className="space-y-1">
                <h3 className="text-lg font-bold text-brand-blue flex justify-between items-center">
                    <span>Chatting with: {privateChatTarget.displayName}</span>
                    <button onClick={() => {
                        setPrivateChatTarget(null);
                        setPrivateChatMessages([]); // Clear messages on end chat
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
                 <div 
                    ref={chatRef} 
                    className={`fixed 
                        inset-0 
                        md:bottom-auto md:right-auto md:top-auto md:left-auto 
                        z-50 
                        w-full h-full 
                        bg-night-800 rounded-lg 
                        shadow-2xl 
                        flex flex-col
                        ${isDesktop ? 'touch-action-none' : ''} 
                    `}
                    style={isDesktop ? { 
                        top: position.y, 
                        left: position.x, 
                        width: dimensions.width, 
                        height: dimensions.height,
                    } : {}}
                    onMouseDown={(e) => {
                        if (!e.target.closest('[data-handler]')) return;
                    }}
                 >
                    {/* ADDITION: Mobile-only close button */}
                    {!isDesktop && (
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-4 right-4 text-night-500 hover:text-white z-10 p-2"
                            aria-label="Close chat"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    )}
                    <div 
                        className="p-4 border-b border-night-700 space-y-3 cursor-grab md:cursor-move" 
                        data-handler="move"
                        onMouseDown={(e) => handleInteractionStart(e, 'move')}
                    > 
                        <div className="flex justify-around items-center bg-night-700 rounded-full p-1">
                            <button 
                                onClick={() => { setMode('ai'); setLocalMessages([]); setIsAwaitingContinue(false); cleanupHighlight(); setPrivateChatTarget(null); setPrivateChatMessages([]); }}
                                className={`w-1/2 py-1.5 rounded-full text-sm font-bold transition-colors flex items-center justify-center gap-1 ${mode === 'ai' ? 'bg-yellow-400 text-night-900' : 'text-night-100 hover:bg-night-600'}`}
                            >
                                <AssistantIcon className="w-4 h-4"/> AI Assistant
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
                       {currentMessages.length === 0 && mode === 'ai' && !isLoading && (
                            <div className="flex justify-start">
                                <div className="rounded-lg px-3 py-2 max-w-xs text-sm bg-night-700 text-night-100">
                                    Hello! I'm your AI Trading Assistant. I can help you research stocks, manage your watchlist, analyze your portfolio, and execute trades. Try asking: "Buy 5 shares of <Link to="/stock/MSFT" className="font-bold text-yellow-400 hover:underline">MSFT</Link>" or "What's the latest news on <Link to="/stock/GOOGL" className="font-bold text-yellow-400 hover:underline">GOOGL</Link>?"
                                </div>
                            </div>
                        )}
                       {currentMessages.map((msg, index) => (
                           <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                               <div className={`rounded-lg px-3 py-2 max-w-xs text-sm ${
                                   msg.sender === 'user' ? 'bg-brand-blue text-white' : 
                                   msg.sender === 'bot' ? 'bg-night-700 text-night-100' : 
                                   'bg-night-600 text-night-500 italic'
                               }`}>
                                   {linkifyTickers(msg.text, params.ticker?.toUpperCase())}
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
                        {isDesktop && (
                            <>
                                {/* Bottom-Right (br) - Diagonal resize */}
                                <div 
                                    data-handler="br"
                                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize bg-yellow-400 rounded-br-lg"
                                    onMouseDown={(e) => handleInteractionStart(e, 'br')}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-night-900 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 18V6M6 12h12"/></svg>
                                </div>
                                
                                {/* Top-Left (tl) - Diagonal resize */}
                                <div 
                                    data-handler="tl"
                                    className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize bg-yellow-400 rounded-tl-lg"
                                    onMouseDown={(e) => handleInteractionStart(e, 'tl')}
                                />

                                {/* Top-Right (tr) - Diagonal resize */}
                                <div 
                                    data-handler="tr"
                                    className="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize bg-yellow-400 rounded-tr-lg"
                                    onMouseDown={(e) => handleInteractionStart(e, 'tr')}
                                />

                                {/* Bottom-Left (bl) - Diagonal resize */}
                                <div 
                                    data-handler="bl"
                                    className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize bg-yellow-400 rounded-bl-lg"
                                    onMouseDown={(e) => handleInteractionStart(e, 'bl')}
                                />
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default ChatPanel;