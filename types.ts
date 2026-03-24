export type MarketType = 'TW' | 'US' | 'CRYPTO';

export type PortfolioType = 'SHORT' | 'MID' | 'LONG' | 'FAMILY';

export interface Holding {
  id: string;
  ticker: string;
  name: string;
  amount: number;
  avgPrice: number;
  currentPrice: number;
  market: MarketType;
  portfolioType: PortfolioType;
  change24h: number; // Percentage
  purchaseDate?: string; // ISO string
}

// For Charting
export interface CandleData {
  time: number; // Unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PortfolioSummary {
  type: PortfolioType;
  totalValue: number;
  targetValue?: number; // Calculated target based on rules
  holdings: Holding[];
  color: string;
}
