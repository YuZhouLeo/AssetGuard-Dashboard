import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries } from 'lightweight-charts';
import { CandleData } from '../types';

export interface OhlcInfo {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  change: number;
  changePercent: number;
}

interface Props {
  data: CandleData[];
  ticker: string;
  onCrosshairMove?: (ohlc: OhlcInfo | null) => void;
}

const formatDateCN = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

const CandlestickChart: React.FC<Props> = ({ data, ticker, onCrosshairMove }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [ohlc, setOhlc] = useState<OhlcInfo | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#10243b' },
        textColor: '#d9e9ff',
      },
      grid: {
        vertLines: { color: '#2f4f73' },
        horzLines: { color: '#2f4f73' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        timeVisible: false,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => formatDateCN(time),
      },
      localization: {
        timeFormatter: (time: number) => formatDateCN(time),
      },
      crosshair: {
        mode: 0,
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#f87171',
      borderVisible: false,
      wickUpColor: '#34d399',
      wickDownColor: '#f87171',
    });

    candlestickSeries.setData(data);

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // 滑鼠移動時更新 OHLC 資訊
    chart.subscribeCrosshairMove((param: any) => {
      if (!param.time || !param.seriesData) {
        setOhlc(null);
        onCrosshairMove?.(null);
        return;
      }
      const candle = param.seriesData.get(candlestickSeries) as any;
      if (!candle || candle.open == null) {
        setOhlc(null);
        onCrosshairMove?.(null);
        return;
      }
      const change = candle.close - candle.open;
      const changePercent = candle.open !== 0 ? (change / candle.open) * 100 : 0;
      const ts = typeof param.time === 'number' ? param.time : 0;
      const info: OhlcInfo = {
        date: formatDateCN(ts),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        change,
        changePercent,
      };
      setOhlc(info);
      onCrosshairMove?.(info);
    });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      seriesRef.current.setData(data);
      chartRef.current?.timeScale().fitContent();
    }
  }, [data]);

  // 顯示最新一根 K 線作為預設
  const lastCandle = data.length > 0 ? data[data.length - 1] : null;
  const display = ohlc || (lastCandle ? {
    date: formatDateCN(lastCandle.time),
    open: lastCandle.open,
    high: lastCandle.high,
    low: lastCandle.low,
    close: lastCandle.close,
    volume: lastCandle.volume,
    change: lastCandle.close - lastCandle.open,
    changePercent: lastCandle.open !== 0 ? ((lastCandle.close - lastCandle.open) / lastCandle.open) * 100 : 0,
  } : null);

  const isUp = display ? display.close >= display.open : true;

  return (
    <div className="app-panel w-full bg-dark-card rounded-xl p-4 shadow-lg border border-dark-border">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
            <span className="text-brand-secondary">{ticker}</span>
            <span className="text-sm font-normal text-slate-400">日K線（近一年）</span>
          </h3>
        </div>
      </div>

      {/* OHLC 資訊列 */}
      {display && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono mb-2 px-1">
          <span className="text-slate-400">{display.date}</span>
          <span className="text-slate-400">O <span className="text-white">{display.open.toFixed(2)}</span></span>
          <span className="text-slate-400">H <span className="text-white">{display.high.toFixed(2)}</span></span>
          <span className="text-slate-400">L <span className="text-white">{display.low.toFixed(2)}</span></span>
          <span className="text-slate-400">C <span className={isUp ? 'text-emerald-400' : 'text-red-400'}>{display.close.toFixed(2)}</span></span>
          <span className={isUp ? 'text-emerald-400' : 'text-red-400'}>
            {isUp ? '+' : ''}{display.change.toFixed(2)} ({isUp ? '+' : ''}{display.changePercent.toFixed(2)}%)
          </span>
          {display.volume != null && display.volume > 0 && (
            <span className="text-slate-400">Vol <span className="text-white">{display.volume >= 1e6 ? (display.volume / 1e6).toFixed(1) + 'M' : display.volume >= 1e3 ? (display.volume / 1e3).toFixed(0) + 'K' : display.volume.toFixed(0)}</span></span>
          )}
        </div>
      )}

      <div ref={chartContainerRef} className="w-full h-[400px]" />
    </div>
  );
};

export default CandlestickChart;
