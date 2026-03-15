import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Holding, PortfolioType, CandleData } from './types';
import PortfolioColumn from './components/PortfolioColumn';
import CandlestickChart from './components/CandlestickChart';
import { formatCurrency, formatNumber } from './utils/math';
import { Activity, Check, Edit3, LayoutDashboard, LogOut, User as UserIcon } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  principal: number;
  shortTarget: number;
  midTarget: number;
  longTarget: number;
}

interface PnlHistory {
  date: string;
  totalValue: number;
  dailyChange: number;
}

const formatDateLabel = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  const week = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}/${d.getDate()}(${week[d.getDay()]})`;
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const currentUserRef = useRef<CurrentUser | null>(null);

  const [principal, setPrincipal] = useState(1200000);
  const [isEditingPrincipal, setIsEditingPrincipal] = useState(false);
  const [tempPrincipal, setTempPrincipal] = useState('1200000');

  const [shortTarget, setShortTarget] = useState(500000);
  const [midTarget, setMidTarget] = useState(420000);
  const [longTarget, setLongTarget] = useState(360000);
  const [editingTarget, setEditingTarget] = useState<'SHORT' | 'MID' | 'LONG' | null>(null);
  const [tempTarget, setTempTarget] = useState('');

  const [shortHoldings, setShortHoldings] = useState<Holding[]>([]);
  const [midHoldings, setMidHoldings] = useState<Holding[]>([]);
  const [longHoldings, setLongHoldings] = useState<Holding[]>([]);

  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [chartData, setChartData] = useState<CandleData[]>([]);
  const chartSectionRef = useRef<HTMLDivElement>(null);

  const [exchangeRate, setExchangeRate] = useState(32.5);
  const [pnlHistory, setPnlHistory] = useState<PnlHistory[]>([]);
  const [pnlLoading, setPnlLoading] = useState(false);

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then((r) => r.json())
      .then(({ user }) => {
        setCurrentUser(user);
        currentUserRef.current = user;
        if (user) {
          setPrincipal(user.principal);
          setShortTarget(user.shortTarget || 500000);
          setMidTarget(user.midTarget || 420000);
          setLongTarget(user.longTarget || 360000);
        }
      })
      .catch(() => setCurrentUser(null))
      .finally(() => setAuthLoading(false));

    fetch('/api/exchange-rate', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.rate) setExchangeRate(data.rate);
      })
      .catch(() => undefined);
  }, []);

  const loadPnlHistory = useCallback(async () => {
    setPnlLoading(true);
    try {
      const res = await fetch('/api/pnl-history', { credentials: 'include' });
      if (res.ok) {
        const data: PnlHistory[] = await res.json();
        setPnlHistory(data.slice(-14));
      }
    } finally {
      setPnlLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!currentUserRef.current) return;
    const res = await fetch('/api/holdings', { credentials: 'include' });
    if (!res.ok) return;

    const data: Holding[] = await res.json();
    let short = data.filter((h) => h.market === 'TW');
    let mid = data.filter((h) => h.market === 'US');
    let long = data.filter((h) => h.market === 'CRYPTO');

    const allTickers = [...new Set(data.map((h) => h.ticker))].join(',');
    if (allTickers) {
      const priceRes = await fetch(`/api/prices?tickers=${allTickers}`, { credentials: 'include' });
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        const patchPrices = (arr: Holding[]) => arr.map((h) => {
          const p = priceData[h.ticker];
          return {
            ...h,
            currentPrice: p?.currentPrice ?? h.currentPrice ?? h.avgPrice,
            change24h: p?.change24h ?? h.change24h ?? 0,
          };
        });
        short = patchPrices(short);
        mid = patchPrices(mid);
        long = patchPrices(long);
      }
    }

    setShortHoldings(short);
    setMidHoldings(mid);
    setLongHoldings(long);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    currentUserRef.current = currentUser;
    loadData().then(loadPnlHistory);
  }, [currentUser, loadData, loadPnlHistory]);

  const handleLogout = useCallback(async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    setCurrentUser(null);
    currentUserRef.current = null;
  }, []);

  const handleRefreshTW = useCallback(async () => {
    await fetch('/api/prices/refresh-tw', { method: 'POST', credentials: 'include' });
    await loadData();
    await loadPnlHistory();
  }, [loadData, loadPnlHistory]);

  const handleRefreshGlobal = useCallback(async () => {
    await fetch('/api/prices/refresh-global', { method: 'POST', credentials: 'include' });
    await loadData();
    await loadPnlHistory();
  }, [loadData, loadPnlHistory]);

  const handleSelectHolding = useCallback(async (holding: Holding) => {
    setSelectedHolding(holding);
    setChartData([]);
    setTimeout(() => chartSectionRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    try {
      const res = await fetch(`/api/chart/${holding.ticker}?market=${holding.market}`, { credentials: 'include' });
      if (res.ok) {
        const candles: CandleData[] = await res.json();
        setChartData(candles);
      }
    } catch (e) {
      console.error('Failed to fetch chart data', e);
    }
  }, []);

  const handleSaveTarget = useCallback(async (type: 'SHORT' | 'MID' | 'LONG') => {
    const val = parseInt(tempTarget.replace(/,/g, ''), 10);
    if (!Number.isFinite(val) || val <= 0) {
      setEditingTarget(null);
      return;
    }

    if (type === 'SHORT') setShortTarget(val);
    if (type === 'MID') setMidTarget(val);
    if (type === 'LONG') setLongTarget(val);

    await fetch('/api/me/targets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        shortTarget: type === 'SHORT' ? val : undefined,
        midTarget: type === 'MID' ? val : undefined,
        longTarget: type === 'LONG' ? val : undefined,
      }),
    });

    setEditingTarget(null);
  }, [tempTarget]);

  const handleSavePrincipal = useCallback(async () => {
    const val = parseInt(tempPrincipal.replace(/,/g, ''), 10);
    if (Number.isFinite(val) && val >= 0) {
      setPrincipal(val);
      await fetch('/api/me/principal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ principal: val }),
      });
    }
    setIsEditingPrincipal(false);
  }, [tempPrincipal]);

  const rawShortValue = useMemo(() => shortHoldings.reduce((sum, h) => sum + h.amount * h.currentPrice, 0), [shortHoldings]);
  const rawMidValue = useMemo(() => midHoldings.reduce((sum, h) => sum + h.amount * h.currentPrice, 0), [midHoldings]);
  const rawLongValue = useMemo(() => longHoldings.reduce((sum, h) => sum + h.amount * h.currentPrice, 0), [longHoldings]);

  const rawShortCost = useMemo(() => shortHoldings.reduce((sum, h) => sum + h.amount * h.avgPrice, 0), [shortHoldings]);
  const rawMidCost = useMemo(() => midHoldings.reduce((sum, h) => sum + h.amount * h.avgPrice, 0), [midHoldings]);
  const rawLongCost = useMemo(() => longHoldings.reduce((sum, h) => sum + h.amount * h.avgPrice, 0), [longHoldings]);

  const totalInvestmentCost = rawShortCost + (rawMidCost + rawLongCost) * exchangeRate;
  const cashRemaining = Math.max(0, principal - totalInvestmentCost);

  // 未實現損益排除當日新增倉位
  const todayStr = new Date().toISOString().split('T')[0];
  const isNewHolding = (h: { purchaseDate?: string }) =>
    (h.purchaseDate ?? '').startsWith(todayStr);

  const pnlShortValue = useMemo(() => shortHoldings.filter(h => !isNewHolding(h)).reduce((sum, h) => sum + h.amount * h.currentPrice, 0), [shortHoldings, todayStr]);
  const pnlMidValue = useMemo(() => midHoldings.filter(h => !isNewHolding(h)).reduce((sum, h) => sum + h.amount * h.currentPrice, 0), [midHoldings, todayStr]);
  const pnlLongValue = useMemo(() => longHoldings.filter(h => !isNewHolding(h)).reduce((sum, h) => sum + h.amount * h.currentPrice, 0), [longHoldings, todayStr]);

  const pnlShortCost = useMemo(() => shortHoldings.filter(h => !isNewHolding(h)).reduce((sum, h) => sum + h.amount * h.avgPrice, 0), [shortHoldings, todayStr]);
  const pnlMidCost = useMemo(() => midHoldings.filter(h => !isNewHolding(h)).reduce((sum, h) => sum + h.amount * h.avgPrice, 0), [midHoldings, todayStr]);
  const pnlLongCost = useMemo(() => longHoldings.filter(h => !isNewHolding(h)).reduce((sum, h) => sum + h.amount * h.avgPrice, 0), [longHoldings, todayStr]);

  const pnlMarketValue = pnlShortValue + (pnlMidValue + pnlLongValue) * exchangeRate;
  const pnlInvestmentCost = pnlShortCost + (pnlMidCost + pnlLongCost) * exchangeRate;
  const totalUnrealizedPnl = pnlMarketValue - pnlInvestmentCost;

  const newHoldingsCount = useMemo(() =>
    [...shortHoldings, ...midHoldings, ...longHoldings].filter(isNewHolding).length,
    [shortHoldings, midHoldings, longHoldings, todayStr]
  );

  const { pnlChartData, pnlTooltipLabel } = useMemo(() => {
    const recent = pnlHistory.slice(-14);
    if (recent.length === 0) {
      return { pnlChartData: [] as { day: string; value: number }[], pnlTooltipLabel: '每日損益' };
    }

    const byDailyChange = recent.map((d) => ({
      day: formatDateLabel(d.date),
      value: Math.round(d.dailyChange),
    })).slice(-7);

    if (byDailyChange.some((x) => x.value !== 0)) {
      return { pnlChartData: byDailyChange, pnlTooltipLabel: '每日損益' };
    }

    return {
      pnlChartData: recent.slice(-7).map((d) => ({ day: formatDateLabel(d.date), value: Math.round(d.totalValue) })),
      pnlTooltipLabel: '總資產',
    };
  }, [pnlHistory]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center gap-8 font-sans">
        <div className="bg-[#151a21]/80 backdrop-blur-md border border-dark-border rounded-3xl p-12 shadow-2xl max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-primary to-brand-purple flex items-center justify-center shadow-lg mx-auto">
            <LayoutDashboard size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mt-6">資產<span className="text-brand-secondary">守衛</span></h1>
          <p className="text-slate-400 mt-2 text-sm">智慧資產組合儀表板</p>
          <a href="/auth/google" className="mt-8 flex items-center gap-3 w-full justify-center px-6 py-3 bg-white hover:bg-slate-100 text-slate-800 font-semibold rounded-xl transition-all shadow-lg">
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.9 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" /></svg>
            使用 Google 登入
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg text-slate-200 pb-20 font-sans selection:bg-brand-primary selection:text-white">
      <nav className="sticky top-0 z-50 bg-[#0b0e11]/80 backdrop-blur-md border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-primary to-brand-purple flex items-center justify-center shadow-lg">
                <LayoutDashboard size={18} className="text-white" />
              </div>
              <span className="font-bold text-xl tracking-tight text-white">資產<span className="text-brand-secondary">守衛</span></span>
            </div>
            <div className="flex items-center gap-3">
              {currentUser.avatarUrl ? (
                <img src={currentUser.avatarUrl} className="w-8 h-8 rounded-full border border-dark-border" alt="avatar" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white"><UserIcon size={16} /></div>
              )}
              <span className="hidden md:block text-slate-300 text-sm font-medium">{currentUser.name}</span>
              <button onClick={handleLogout} className="text-slate-400 hover:text-white p-1 rounded"><LogOut size={16} /></button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(() => {
            const twCost = rawShortCost;
            const usCost = rawMidCost * exchangeRate;
            const cryptoCost = rawLongCost * exchangeRate;
            const cash = cashRemaining;
            const total = twCost + usCost + cryptoCost + cash;
            const pct = (v: number) => total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';
            const allocationData = [
              { name: '台股', value: Math.round(twCost), color: '#06b6d4' },
              { name: '美股', value: Math.round(usCost), color: '#8b5cf6' },
              { name: '加密貨幣', value: Math.round(cryptoCost), color: '#f59e0b' },
              { name: '現金', value: Math.round(cash), color: '#64748b' },
            ].filter(d => d.value > 0);
            return (
              <div className="bg-dark-card border border-dark-border rounded-2xl p-5 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 text-sm font-medium">資產配置比例</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs">本金</span>
                    {isEditingPrincipal ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="number"
                          className="w-24 bg-[#0b0e11] border border-brand-primary rounded px-2 py-0.5 text-white text-xs"
                          value={tempPrincipal}
                          onChange={(e) => setTempPrincipal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSavePrincipal(); if (e.key === 'Escape') setIsEditingPrincipal(false); }}
                        />
                        <button onClick={handleSavePrincipal}><Check size={14} className="text-brand-success" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setTempPrincipal(principal.toString()); setIsEditingPrincipal(true); }} className="text-slate-300 text-xs font-semibold hover:text-brand-primary flex items-center gap-1">
                        {formatCurrency(principal)} <Edit3 size={11} className="opacity-40" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1" style={{ minHeight: 140 }}>
                  {allocationData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={allocationData} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={2} dataKey="value" stroke="none">
                          {allocationData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: 11 }} formatter={(v: number, name: string) => [formatCurrency(v), name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-600 text-xs">尚無持倉資料</div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {[
                    { name: '台股', value: twCost, color: '#06b6d4' },
                    { name: '美股', value: usCost, color: '#8b5cf6' },
                    { name: '加密貨幣', value: cryptoCost, color: '#f59e0b' },
                    { name: '現金', value: cash, color: '#64748b' },
                  ].map(({ name, value, color }) => (
                    <div key={name} className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-slate-400 truncate">{name}</span>
                      </div>
                      <span className="text-slate-300 font-mono tabular-nums shrink-0">{pct(value)}%</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-800/50 text-xs">
                  <span className="text-slate-500 flex items-center gap-1">
                    未實現損益
                    {newHoldingsCount > 0 && (
                      <span className="text-[10px] text-slate-600 italic">（不含今日新增 {newHoldingsCount} 筆）</span>
                    )}
                  </span>
                  <span className={totalUnrealizedPnl >= 0 ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                    {totalUnrealizedPnl >= 0 ? '+' : ''}{formatCurrency(totalUnrealizedPnl)}
                  </span>
                </div>
              </div>
            );
          })()}

          <div className="lg:col-span-2 bg-dark-card border border-dark-border rounded-2xl p-5 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-slate-300 text-sm font-medium flex items-center gap-2"><Activity size={14} className="text-brand-secondary" /> 近期損益趨勢</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{pnlTooltipLabel}</span>
                {pnlLoading && <div className="w-3 h-3 border border-brand-secondary border-t-transparent rounded-full animate-spin" />}
              </div>
            </div>
            <div className="flex-1 w-full" style={{ minHeight: 140 }}>
              {pnlChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={pnlChartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis hide domain={[(dataMin: number) => Math.min(0, dataMin * 1.2), (dataMax: number) => Math.max(0, dataMax * 1.2)]} />
                    <ReferenceLine y={0} stroke="#2d3748" strokeDasharray="3 3" />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: 12 }} formatter={(v: number) => [formatCurrency(v), pnlTooltipLabel]} />
                    <Bar dataKey="value" radius={[3, 3, 3, 3]}>
                      {pnlChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.value >= 0 ? '#ef4444' : '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs gap-2">
                  <Activity size={28} className="opacity-40" />
                  <span>無圖表資料</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <PortfolioColumn
            title="台股投資組合"
            type="SHORT"
            holdings={shortHoldings}
            totalValue={rawShortValue}
            targetValue={shortTarget}
            currency="TWD"
            onSelectHolding={handleSelectHolding}
            color="#06b6d4"
            editingTarget={editingTarget === 'SHORT'}
            tempTarget={tempTarget}
            onEditTarget={() => { setEditingTarget('SHORT'); setTempTarget(shortTarget.toString()); }}
            onSaveTarget={() => handleSaveTarget('SHORT')}
            onCancelTarget={() => setEditingTarget(null)}
            onTempTargetChange={setTempTarget}
            onRefresh={handleRefreshTW}
            exchangeRate={1}
          />
          <PortfolioColumn
            title="美股投資組合"
            type="MID"
            holdings={midHoldings}
            totalValue={rawMidValue}
            targetValue={midTarget}
            currency="USD"
            onSelectHolding={handleSelectHolding}
            color="#8b5cf6"
            editingTarget={editingTarget === 'MID'}
            tempTarget={tempTarget}
            onEditTarget={() => { setEditingTarget('MID'); setTempTarget(midTarget.toString()); }}
            onSaveTarget={() => handleSaveTarget('MID')}
            onCancelTarget={() => setEditingTarget(null)}
            onTempTargetChange={setTempTarget}
            onRefresh={handleRefreshGlobal}
            exchangeRate={1}
          />
          <PortfolioColumn
            title="加密貨幣組合"
            type="LONG"
            holdings={longHoldings}
            totalValue={rawLongValue}
            targetValue={longTarget}
            currency="USD"
            onSelectHolding={handleSelectHolding}
            color="#f59e0b"
            editingTarget={editingTarget === 'LONG'}
            tempTarget={tempTarget}
            onEditTarget={() => { setEditingTarget('LONG'); setTempTarget(longTarget.toString()); }}
            onSaveTarget={() => handleSaveTarget('LONG')}
            onCancelTarget={() => setEditingTarget(null)}
            onTempTargetChange={setTempTarget}
            onRefresh={handleRefreshGlobal}
            exchangeRate={1}
          />
        </section>

        <section ref={chartSectionRef} className="pt-6">
          <h2 className="text-2xl font-bold text-white mb-4">持倉走勢圖</h2>
          {selectedHolding ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2"><CandlestickChart data={chartData} ticker={selectedHolding.ticker} /></div>
              <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-3">
                <div className="flex justify-between"><span className="text-slate-400 text-sm">代號</span><span className="text-white font-mono">{selectedHolding.ticker}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 text-sm">名稱</span><span className="text-white">{selectedHolding.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 text-sm">數量</span><span className="text-white">{formatNumber(selectedHolding.amount, selectedHolding.amount < 1 ? 4 : 0)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400 text-sm">現價</span><span className="text-white font-mono">{selectedHolding.market === 'TW' ? formatCurrency(selectedHolding.currentPrice) : formatCurrency(selectedHolding.currentPrice, 'USD')}</span></div>
              </div>
            </div>
          ) : (
            <div className="w-full h-[320px] bg-dark-card rounded-xl border border-dashed flex flex-col items-center justify-center text-slate-500">
              <Activity size={48} className="mb-4 opacity-50" />
              <p>點選持倉以查看走勢圖</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
