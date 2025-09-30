import React, { useEffect, useRef } from 'react';
import type { FmpHistoricalData } from '../types';
import { createChart, ColorType, UTCTimestamp } from 'lightweight-charts';

interface CandlestickChartProps {
  data: FmpHistoricalData[];
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ data }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

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

    // This now correctly handles both date and date-time strings
    const candlestickData = data.map(item => ({
      time: (new Date(item.date).getTime() / 1000) as UTCTimestamp,
      open: parseFloat(item.open as any),
      high: parseFloat(item.high as any),
      low: parseFloat(item.low as any),
      close: parseFloat(item.close as any),
    }));

    candlestickSeries.setData(candlestickData);
    chart.timeScale().fitContent();

    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current?.clientWidth });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data]);

  return <div ref={chartContainerRef} />;
};

export default CandlestickChart;