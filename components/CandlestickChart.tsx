import React, { useEffect, useRef } from 'react';
import type { FmpHistoricalData } from '../types';
import { createChart, ColorType, UTCTimestamp } from 'lightweight-charts';
import { RectangleDrawingTool } from './primitives/RectangleDrawingTool';

interface CandlestickChartProps {
  data: FmpHistoricalData[];
  ticker: string;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, ticker }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const toolbarContainerRef = useRef<HTMLDivElement>(null); // Ref for the toolbar container

  useEffect(() => {
    if (!chartContainerRef.current || !toolbarContainerRef.current || data.length === 0) return;

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
            timeVisible: true, // Make sure time is visible on the timescale
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
    chart.timeScale().fitContent();

    // Initialize the drawing tool
    const drawingTool = new RectangleDrawingTool(chart, candlestickSeries, toolbarContainerRef.current, ticker, {});

    const handleResize = () => chart.applyOptions({ width: chartContainerRef.current?.clientWidth });
    window.addEventListener('resize', handleResize);

    return () => {
      drawingTool.destroy();
      window.removeEventListener('resize', handleResize);
      chart.remove();
      // Clear the toolbar when the chart is destroyed
      if (toolbarContainerRef.current) {
          toolbarContainerRef.current.innerHTML = '';
      }
    };
  }, [data, ticker]);

  return (
    <div className="relative">
      {/* Container for the drawing toolbar */}
      <div 
        ref={toolbarContainerRef} 
        className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-night-800 p-2 rounded-md shadow-lg"
      />
      <div ref={chartContainerRef} />
    </div>
  );
};

export default CandlestickChart;