import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Holding, PortfolioType } from '../types';
import { formatCurrency, formatNumber, calculateROI } from '../utils/math';
import { TrendingUp, TrendingDown, Edit3, Save, X, RefreshCcw, Plus, Check } from 'lucide-react';

interface Props {
    title: string;
    type: PortfolioType;
    holdings: Holding[];
    totalValue: number;
    targetValue: number;
    currency: string;
    onSelectHolding: (holding: Holding) => void;
    onUpdateHoldings?: (type: PortfolioType, newHoldings: any[]) => void; // Keep for compatibility if needed
    color: string;
    editingTarget?: boolean;
    tempTarget?: string;
    onEditTarget?: () => void;
    onSaveTarget?: () => void;
    onCancelTarget?: () => void;
    onTempTargetChange?: (val: string) => void;
    onRefresh?: () => Promise<void>;
    exchangeRate: number;
}

const PortfolioColumn: React.FC<Props> = ({
    title,
    type,
    holdings,
    totalValue,
    targetValue,
    currency,
    onSelectHolding,
    color,
    editingTarget,
    tempTarget,
    onEditTarget,
    onSaveTarget,
    onCancelTarget,
    onTempTargetChange,
    onRefresh,
    exchangeRate
}) => {
    // Add Form State
    const [isAddMode, setIsAddMode] = useState(false);
    const [addForm, setAddForm] = useState({ ticker: '', amount: '', avgPrice: '' });
    const [isAdding, setIsAdding] = useState(false);

    // Row Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ amount: '', avgPrice: '' });

    // 匯率乘數判斷
    const multiplier = type === 'SHORT' ? 1 : exchangeRate;

    const handleAdd = async () => {
        const { ticker, amount, avgPrice } = addForm;
        if (!ticker || !amount || !avgPrice) return;
        
        setIsAdding(true);
        try {
            const res = await fetch('/api/holdings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    ticker: ticker.toUpperCase(),
                    amount: parseFloat(amount),
                    avgPrice: parseFloat(avgPrice),
                    portfolioType: type,
                    market: type === 'SHORT' ? 'TW' : type === 'MID' ? 'US' : 'CRYPTO'
                })
            });
            if (res.ok && onRefresh) {
                await onRefresh();
                setAddForm({ ticker: '', amount: '', avgPrice: '' });
                setIsAddMode(false);
            }
        } finally {
            setIsAdding(false);
        }
    };

    const handleUpdateRow = async (id: string) => {
        try {
            const res = await fetch(`/api/holdings/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    amount: parseFloat(editForm.amount),
                    avgPrice: parseFloat(editForm.avgPrice)
                })
            });
            if (res.ok && onRefresh) {
                await onRefresh();
                setEditingId(null);
            }
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('確定要刪除此持倉嗎？')) return;
        const res = await fetch(`/api/holdings/${id}`, { method: 'DELETE', credentials: 'include' });
        if (res.ok && onRefresh) await onRefresh();
    };

    const chartData = holdings.length > 0 
        ? holdings.map(h => ({ name: h.name || h.ticker, value: h.amount * h.currentPrice }))
        : [{ name: '無持倉', value: 1 }];
    
    const COLORS = [color, '#64748b', '#475569', '#334155', '#94a3b8'];

    const percentFilled = targetValue === 0 ? 0 : Math.min(100, (totalValue / targetValue) * 100);

    return (
        <div className="bg-dark-card rounded-xl border border-dark-border flex flex-col h-[650px] shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: color }}></div>

            <div className="p-5 pb-2">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">{title}</h3>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => onRefresh?.()}
                            className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white transition-colors"
                        >
                            <RefreshCcw size={14} />
                        </button>
                        <button 
                            onClick={() => setIsAddMode(!isAddMode)}
                            className={`p-1.5 rounded-lg border transition-all ${isAddMode ? 'bg-brand-primary border-brand-primary text-white' : 'border-slate-700 text-slate-400 hover:text-white'}`}
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex justify-between items-baseline">
                    <div className="text-2xl font-bold text-white mt-1">{formatCurrency(totalValue, currency)}</div>
                    <div className="text-right">
                        <span className="text-xs text-slate-500 block">目標配置</span>
                        {editingTarget ? (
                            <div className="flex items-center gap-1 mt-0.5">
                                <input autoFocus type="number" className="w-24 bg-[#0b0e11] border border-brand-primary rounded px-1 py-0.5 text-sm text-white" value={tempTarget} onChange={e => onTempTargetChange?.(e.target.value)} />
                                <button onClick={onSaveTarget} className="text-brand-success"><Check size={16} /></button>
                            </div>
                        ) : (
                            <div className="text-sm font-semibold text-slate-300 flex items-center gap-1 cursor-pointer" onClick={onEditTarget}>
                                {formatCurrency(targetValue, currency)} <Edit3 size={11} className="opacity-40" />
                            </div>
                        )}
                    </div>
                </div>
                <div className="w-full bg-slate-800 h-1.5 mt-3 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percentFilled}%`, backgroundColor: percentFilled > 100 ? '#ef4444' : color }}></div>
                </div>
            </div>

            {/* 新增區塊 (需求 2: 三個格子) */}
            {isAddMode && (
                <div className="mx-4 mb-4 p-4 bg-[#151a21] border border-brand-primary/30 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-[10px] text-slate-500 block mb-1">代號</label>
                            <input 
                                className="w-full bg-[#0b0e11] border border-slate-700 rounded p-1.5 text-xs text-white uppercase"
                                placeholder={type === 'SHORT' ? '例: 2330' : type === 'MID' ? '例: NVDA' : '例: BTC-USD'} 
                                value={addForm.ticker}
                                onChange={e => setAddForm({...addForm, ticker: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 block mb-1">成本均價</label>
                            <input 
                                type="number"
                                className="w-full bg-[#0b0e11] border border-slate-700 rounded p-1.5 text-xs text-white"
                                placeholder="0.00"
                                value={addForm.avgPrice}
                                onChange={e => setAddForm({...addForm, avgPrice: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 block mb-1">數量</label>
                            <input 
                                type="number"
                                className="w-full bg-[#0b0e11] border border-slate-700 rounded p-1.5 text-xs text-white"
                                placeholder="0"
                                value={addForm.amount}
                                onChange={e => setAddForm({...addForm, amount: e.target.value})}
                            />
                        </div>
                    </div>
                    <button 
                        disabled={isAdding}
                        onClick={handleAdd}
                        className="w-full bg-brand-primary text-white py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-600 transition-colors flex items-center justify-center gap-2"
                    >
                        {isAdding ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={14} />}
                        確認新增持倉
                    </button>
                </div>
            )}

            {/* Pie Chart */}
            <div className="h-32 w-full relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={chartData} cx="50%" cy="50%" innerRadius={35} outerRadius={50} paddingAngle={2} dataKey="value" stroke="none">
                            {chartData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: '11px' }} />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* List Section (需求 4: 移除日期，新增修改按鈕) */}
            <div className="flex-1 overflow-y-auto space-y-2 px-4 pb-4">
                {holdings.map(h => {
                    const isEditing = editingId === h.id;
                    const itemAvgPrice = h.avgPrice * multiplier;
                    const itemCurrentPrice = h.currentPrice * multiplier;
                    
                    const totalCost = h.amount * itemAvgPrice;
                    const marketValue = h.amount * itemCurrentPrice;
                    const pnl = marketValue - totalCost;
                    const roi = calculateROI(h.avgPrice, h.currentPrice);

                    return (
                        <div 
                            key={h.id} 
                            onClick={() => !isEditing && onSelectHolding(h)}
                            className="p-3 rounded-lg bg-[#1e232e] border border-slate-800 hover:border-slate-700 transition-all flex flex-col gap-2 relative cursor-pointer hover:border-brand-primary/30"
                        >
                            {/* Header */}
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 truncate">
                                    <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono shrink-0">{h.ticker}</span>
                                    <span className="font-bold text-white text-sm truncate">{h.name}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    {isEditing ? (
                                        <>
                                            <button onClick={() => handleUpdateRow(h.id)} className="text-brand-success p-1 hover:bg-emerald-500/10 rounded"><Check size={14} /></button>
                                            <button onClick={() => setEditingId(null)} className="text-slate-500 p-1 hover:bg-slate-500/10 rounded"><X size={14} /></button>
                                        </>
                                    ) : (
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setEditingId(h.id); 
                                                setEditForm({ amount: h.amount.toString(), avgPrice: h.avgPrice.toString() }); 
                                            }} 
                                            className="text-slate-500 hover:text-brand-secondary p-1"
                                        >
                                            <Edit3 size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Info Grid (需求 2: 顯示 6 項欄位) */}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">數量</span>
                                    {isEditing ? (
                                        <input className="w-16 bg-[#0b0e11] border border-brand-primary rounded px-1 text-white text-right font-mono tabular-nums" value={editForm.amount} onChange={e => setEditForm({...editForm, amount: e.target.value})} />
                                    ) : (
                                        <span className="text-slate-200 text-right min-w-[74px] font-mono tabular-nums">{formatNumber(h.amount, h.amount < 1 ? 4 : 0)}</span>
                                    )}
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">每股市價 ({currency})</span>
                                    <span className="text-slate-200 text-right min-w-[74px] font-mono tabular-nums">{formatNumber(itemCurrentPrice, 2)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">平均成本 ({currency})</span>
                                    {isEditing ? (
                                        <div className="flex items-center gap-1">
                                            <span className="text-[10px] text-slate-600">{currency}</span>
                                            <input className="w-16 bg-[#0b0e11] border border-brand-primary rounded px-1 text-white text-right font-mono tabular-nums" value={editForm.avgPrice} onChange={e => setEditForm({...editForm, avgPrice: e.target.value})} />
                                        </div>
                                    ) : (
                                        <span className="text-slate-200 text-right min-w-[74px] font-mono tabular-nums">{formatNumber(itemAvgPrice, 2)}</span>
                                    )}
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">總成本</span>
                                    <span className="text-slate-200 text-right min-w-[96px] font-mono tabular-nums">{formatCurrency(totalCost, currency)}</span>
                                </div>
                                <div className="flex justify-between items-center col-span-2 pt-1 border-t border-slate-800/50">
                                    <span className="text-slate-500">總市值</span>
                                    <span className="text-white font-bold text-right min-w-[108px] font-mono tabular-nums">{formatCurrency(marketValue, currency)}</span>
                                </div>
                            </div>

                            {/* PnL Footer */}
                            <div className={`flex justify-between items-center text-xs pt-1 ${pnl >= 0 ? 'text-brand-success' : 'text-brand-danger'}`}>
                                <span className="opacity-70">未實現損益</span>
                                <div className="flex items-center gap-2">
                                    <span>{pnl >= 0 ? '+' : ''}{formatCurrency(pnl, currency)}</span>
                                    <span className="text-[10px] bg-white/5 px-1 rounded">{roi.toFixed(2)}%</span>
                                </div>
                            </div>
                            
                            {/* Delete Option in Edit Mode */}
                            {isEditing && (
                                <button onClick={() => handleDelete(h.id)} className="absolute -left-2 -top-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:scale-110 transition-transform"><X size={10} /></button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PortfolioColumn;
