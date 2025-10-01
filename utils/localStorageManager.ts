const CHART_HISTORY_QUEUE_KEY = 'chartHistoryQueue';
const MAX_HISTORY_SIZE = 50;

/**
 * Manages the history of viewed stock charts to clean up old data from localStorage.
 * When a new ticker is viewed, it's added to a queue. If the queue exceeds the
 * max size, the oldest ticker's data (drawings and chart state) is removed.
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