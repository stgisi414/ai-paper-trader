import React, { useEffect, useRef } from 'react';
import type { FmpHistoricalData } from '../types';
import { createChart, ColorType, UTCTimestamp, TimeRange } from 'lightweight-charts';
import { RectangleDrawingTool } from './primitives/RectangleDrawingTool';
import { manageChartDataHistory } from '../utils/localStorageManager'; // ADD: Import the new manager

interface CandlestickChartProps {
  data: FmpHistoricalData[];
  ticker: string;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, ticker }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const toolbarContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !toolbarContainerRef.current || data.length === 0) return;
    
    // ADD: Run the cleanup and history management logic
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
    
    // --- ADD: Logic to save and load chart zoom/pan state ---
    const chartStateKey = `chartState_${ticker}`;

    // Load saved zoom/pan state if it exists
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

    // Subscribe to changes in the visible time range to save them
    const onVisibleTimeRangeChange = () => {
        const newTimeRange = chart.timeScale().getVisibleRange();
        if (newTimeRange) {
            localStorage.setItem(chartStateKey, JSON.stringify(newTimeRange));
        }
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleTimeRangeChange);
    // --- End of new logic ---

    const drawingTool = new RectangleDrawingTool(chart, candlestickSeries, toolbarContainerRef.current, ticker, {});

    const handleResize = () => chart.applyOptions({ width: chartContainerRef.current?.clientWidth });
    window.addEventListener('resize', handleResize);

    return () => {
      drawingTool.destroy();
      window.removeEventListener('resize', handleResize);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleTimeRangeChange); // FIX: Unsubscribe on cleanup
      chart.remove();
      if (toolbarContainerRef.current) {
          toolbarContainerRef.current.innerHTML = '';
      }
    };
  }, [data, ticker]);

  return (
    <div className="relative">
      <div 
        ref={toolbarContainerRef} 
        className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-night-800 p-2 rounded-md shadow-lg"
      />
      <div ref={chartContainerRef} />
    </div>
  );
};

export default CandlestickChart;