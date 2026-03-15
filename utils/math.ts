// In a real environment, we would import Decimal from 'decimal.js';

export const formatCurrency = (value: number, currency: string = 'TWD') => {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0, // Taiwan stock usually doesn't need decimals for totals
  }).format(value);
};

export const formatNumber = (value: number, decimals: number = 2) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export const calculateROI = (avg: number, current: number): number => {
  if (avg === 0) return 0;
  return ((current - avg) / avg) * 100;
};

/**
 * 解析持倉輸入格式（簡化版）
 * 新格式：代號、股數、成本均價（名稱由系統自動查詢或之後填入）
 * 範例：2330,4,570
 * 加密：BTC-USD,0.5,95000
 * 日期由系統在輸入當下自動記錄，無需手動填寫
 */
export const parseStockCSV = (input: string) => {
  const lines = input.trim().split('\n');
  const results = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // 以逗號分割，並移除各欄前後空白
    const parts = line.split(',').map(p => p.trim().replace(/['"]/g, ''));

    if (parts.length >= 3) {
      const ticker = parts[0].toUpperCase();
      const amount = parseFloat(parts[1].replace(/,/g, ''));
      const avgPrice = parseFloat(parts[2].replace(/,/g, ''));

      if (ticker && !isNaN(amount) && !isNaN(avgPrice) && amount > 0 && avgPrice > 0) {
        results.push({
          ticker,
          // 名稱先預設為 ticker，待後端查詢後更新
          name: ticker,
          amount,
          avgPrice,
          // 購買日期固定記錄為當下時間（系統自動）
          purchaseDate: new Date().toISOString(),
        });
      }
    }
  }
  return results;
};
