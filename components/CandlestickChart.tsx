// stgisi414/ai-paper-trader/ai-paper-trader-c6099c8cd571facb1867d1a78d48f34f374bf6c2/components/CandlestickChart.tsx
import React, { useEffect, useRef } from 'react';
import type { FmpHistoricalData } from '../types';
import { createChart, ColorType, UTCTimestamp, TimeRange } from 'lightweight-charts';
import { RectangleDrawingTool } from './primitives/RectangleDrawingTool';
import { manageChartDataHistory } from '../utils/localStorageManager';
import { useAuth, STRIPE_PRO_PRICE_ID_MONTHLY } from '../src/hooks/useAuth';

interface CandlestickChartProps {
  data: FmpHistoricalData[];
  ticker: string;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, ticker }) => {
  const { user, isPro, activePriceId, userSettings, loading: isAuthLoading } = useAuth();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const toolbarContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !toolbarContainerRef.current || data.length === 0) return;
    if (isAuthLoading) return; // Wait for auth state to load

    manageChartDataHistory(ticker);

    const chart = createChart(chartContainerRef.current, {
        layout: {
            background: { type: ColorType.Solid, color: '#1e1e1e' },
            textColor: '#d0d0d0',
        },
        grid: {
            vertLines: { color: '#2a2a2a' },
            horzLines: { color: '#2a2a2a' },
        },
        width: chartContainerRef.current.clientWidth,
        height: 400,
        timeScale: {
            borderColor: '#3c3c3c',
            timeVisible: true,
            rightOffset: 200,
            rightBarStaysOnScroll: false,
        },
        rightPriceScale: {
            borderColor: '#3c3c3c',
            autoScale: true,
        },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#1e8e3e',
      downColor: '#d93025',
      borderDownColor: '#d93025',
      borderUpColor: '#1e8e3e',
      wickDownColor: '#d93025',
      wickUpColor: '#1e8e3e',
    });

    const candlestickData = data.map(item => ({
        time: (new Date(item.date).getTime() / 1000) as UTCTimestamp,
        open: parseFloat(item.open as any),
        high: parseFloat(item.high as any),
        low: parseFloat(item.low as any),
        close: parseFloat(item.close as any),
    }));
    candlestickSeries.setData(candlestickData);

    const chartStateKey = `chartState_${ticker}`;
    const savedChartState = localStorage.getItem(chartStateKey);
    if (savedChartState) {
        try {
            const timeRange: TimeRange = JSON.parse(savedChartState);
            chart.timeScale().setVisibleRange(timeRange);
        } catch (e) {
            console.error('Failed to parse saved chart state', e);
            chart.timeScale().fitContent();
        }
    } else {
        chart.timeScale().fitContent();
    }

    const onVisibleTimeRangeChange = () => {
        const newTimeRange = chart.timeScale().getVisibleRange();
        if (newTimeRange) {
            localStorage.setItem(chartStateKey, JSON.stringify(newTimeRange));
        }
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleTimeRangeChange);

    let drawingTool: RectangleDrawingTool | null = null;
    // --- ADDITION: Check if user is eligible for drawing tools ---
    const canUseDrawingTools = user && (
        (isPro && activePriceId === STRIPE_PRO_PRICE_ID_MONTHLY) ||
        userSettings.usageTier === 'unlimited' ||
        userSettings.usageTier === 'custom_tier_1' // Assuming custom_tier_1 also gets tools
    );
    // --- END ADDITION ---

    // --- MODIFICATION: Conditionally initialize and show toolbar ---
    if (canUseDrawingTools) {
        drawingTool = new RectangleDrawingTool(chart, candlestickSeries, toolbarContainerRef.current, ticker, user, {});
        // Make sure toolbar is visible if tools are enabled
        toolbarContainerRef.current.style.display = 'flex'; // Or 'block', depending on layout needs
    } else {
        // If user is not eligible, clear the toolbar and hide it
        toolbarContainerRef.current.innerHTML = '';
        toolbarContainerRef.current.style.display = 'none';
    }
    // --- END MODIFICATION ---

    const handleResize = () => chart.applyOptions({ width: chartContainerRef.current?.clientWidth });
    window.addEventListener('resize', handleResize);

    return () => {
      drawingTool?.destroy();
      window.removeEventListener('resize', handleResize);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleTimeRangeChange);
      chart.remove();
      if (toolbarContainerRef.current) {
          toolbarContainerRef.current.innerHTML = '';
          toolbarContainerRef.current.style.display = 'flex'; // Reset display on cleanup
      }
    };
    // Update dependencies to include user eligibility factors
  }, [data, ticker, user, isPro, activePriceId, userSettings.usageTier, isAuthLoading]);

  return (
    <div className="relative">
      {/* Remove the conditional class from here */}
      <div
        ref={toolbarContainerRef}
        className={`absolute top-4 left-4 z-20 flex items-center gap-2 bg-night-800 p-2 rounded-md shadow-lg`}
        // Visibility is now controlled by style in useEffect
      />
      <div ref={chartContainerRef} />
    </div>
  );
};

export default CandlestickChart;