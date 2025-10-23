// stgisi414/ai-paper-trader/ai-paper-trader-aa525cadf60fcb8cea9f263b0ded14561515deb6/utils/localStorageManager.ts

import { useState, useEffect, Dispatch, SetStateAction } from 'react';

const CHART_HISTORY_QUEUE_KEY = 'chartHistoryQueue';
const MAX_HISTORY_SIZE = 50;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Manages the history of viewed stock charts to clean up old data from localStorage.
 * @param ticker The stock ticker symbol being viewed.
 */
export const manageChartDataHistory = (ticker: string) => {
    try {
        const queueJson = localStorage.getItem(CHART_HISTORY_QUEUE_KEY);
        let queue: string[] = queueJson ? JSON.parse(queueJson) : [];

        // Remove the ticker if it already exists to move it to the end (most recent)
        queue = queue.filter(item => item !== ticker);
        queue.push(ticker);

        if (queue.length > MAX_HISTORY_SIZE) {
            // Remove the oldest ticker (first in the array)
            const oldestTicker = queue.shift();
            if (oldestTicker) {
                // Remove all data associated with the oldest ticker
                localStorage.removeItem(`drawings_${oldestTicker}`);
                localStorage.removeItem(`chartState_${oldestTicker}`);
                console.log(`Cleaned up old chart data for ${oldestTicker}`);
            }
        }

        localStorage.setItem(CHART_HISTORY_QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
        console.error('Failed to manage chart data history in localStorage:', error);
    }
};

/**
 * A custom React hook for state management backed by localStorage.
 * State is loaded on mount and saved on update.
 * @param key The localStorage key.
 * @param defaultValue The initial value if nothing is found in storage.
 */
export const usePersistentState = <T,>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] => {
    const [state, setState] = useState<T>(() => {
        try {
            const storedItem = localStorage.getItem(key);
            if (storedItem === null || storedItem === "null" || storedItem === "undefined") {
                 return defaultValue;
            }
            
            let data: { value: T; timestamp: number };
            const parsed = JSON.parse(storedItem);

            // NEW CHECK: Determine if the parsed data is in the new { value, timestamp } format
            if (parsed && typeof parsed === 'object' && 'value' in parsed && 'timestamp' in parsed && typeof parsed.timestamp === 'number') {
                // New format: Proceed with validation
                data = parsed as { value: T; timestamp: number };
            } else {
                // Old format (or corrupt data): Treat as stale and set up for cleanup
                if (parsed !== null && parsed !== undefined) {
                    // Treat old value as the data, setting a very old timestamp to force purge immediately.
                    console.log(`[PERSISTENCE CLEANUP] Found old data for key: ${key}. Attempting to load and purge.`);
                    data = { value: parsed as T, timestamp: 0 }; 
                } else {
                    return defaultValue;
                }
            }
            
            // CLEANUP LOGIC (applies to both old data and expired new data)
            if (Date.now() - data.timestamp > SEVEN_DAYS_MS) {
                localStorage.removeItem(key);
                console.log(`Purged stale or old data for key: ${key}`);
                return defaultValue;
            }
            
            return data.value;
        } catch (error) {
            console.error(`Error reading or parsing localStorage key “${key}”:`, error);
            // On error or corruption, treat it as empty and clear the key
            localStorage.removeItem(key); 
            return defaultValue;
        }
    });

    useEffect(() => {
        try {
            // Do not store null/undefined, instead remove the key
            if (state === null || state === undefined) {
                 localStorage.removeItem(key);
            } else {
                 // Store the value and the current timestamp
                 const itemToStore = JSON.stringify({
                     value: state,
                     timestamp: Date.now(),
                 });
                 localStorage.setItem(key, itemToStore);
            }
        } catch (error) {
            console.error(`Error setting localStorage key “${key}”:`, error);
        }
    }, [key, state]);

    return [state, setState];
};