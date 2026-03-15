import { Holding, MarketType, CandleData } from '../types';

// Mock Holdings
export const MOCK_HOLDINGS: Holding[] = [
  // TW Market
  { id: '1', ticker: '2330.TW', name: 'TSMC', amount: 1000, avgPrice: 550, currentPrice: 980, market: 'TW', portfolioType: 'LONG', change24h: 1.2 },
  { id: '2', ticker: '2454.TW', name: 'MediaTek', amount: 200, avgPrice: 900, currentPrice: 1150, market: 'TW', portfolioType: 'MID', change24h: -0.5 },
  { id: '3', ticker: '2317.TW', name: 'Foxconn', amount: 3000, avgPrice: 100, currentPrice: 175, market: 'TW', portfolioType: 'SHORT', change24h: 2.3 },
  { id: '4', ticker: '0050.TW', name: 'Yuanta 50', amount: 1500, avgPrice: 120, currentPrice: 165, market: 'TW', portfolioType: 'LONG', change24h: 0.1 },
  
  // US Market
  { id: '5', ticker: 'NVDA', name: 'Nvidia', amount: 50, avgPrice: 400, currentPrice: 950, market: 'US', portfolioType: 'LONG', change24h: 3.5 },
  { id: '6', ticker: 'TSLA', name: 'Tesla', amount: 100, avgPrice: 200, currentPrice: 180, market: 'US', portfolioType: 'MID', change24h: -1.2 },
  { id: '7', ticker: 'AAPL', name: 'Apple', amount: 80, avgPrice: 150, currentPrice: 190, market: 'US', portfolioType: 'SHORT', change24h: 0.5 },

  // Crypto
  { id: '8', ticker: 'BTC', name: 'Bitcoin', amount: 0.5, avgPrice: 40000, currentPrice: 65000, market: 'CRYPTO', portfolioType: 'LONG', change24h: 4.1 },
  { id: '9', ticker: 'ETH', name: 'Ethereum', amount: 5, avgPrice: 2500, currentPrice: 3400, market: 'CRYPTO', portfolioType: 'MID', change24h: 2.2 },
  { id: '10', ticker: 'SOL', name: 'Solana', amount: 100, avgPrice: 80, currentPrice: 145, market: 'CRYPTO', portfolioType: 'SHORT', change24h: -3.4 },
];

// Mock 5-min Candle Data Generator (Simulating yfinance)
export const generateMockCandles = (basePrice: number, count: number = 200): CandleData[] => {
  let time = Math.floor(Date.now() / 1000) - (count * 5 * 60);
  let currentPrice = basePrice;
  const data: CandleData[] = [];

  for (let i = 0; i < count; i++) {
    const volatility = basePrice * 0.005; // 0.5% volatility
    const change = (Math.random() - 0.5) * volatility;
    
    const open = currentPrice;
    const close = currentPrice + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;

    data.push({
      time: time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
    });

    currentPrice = close;
    time += 5 * 60; // Add 5 minutes
  }

  return data;
};
