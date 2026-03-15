<div align="center">
  <img src="public/images/banner.png" width="100%" alt="AssetMaster Banner" />
  
  # 🛡️ AssetMaster | 管理大師
  
  **全方位投資組合視覺化與管理平台**
  
  [![Vite](https://img.shields.io/badge/Vite-6.2.0-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
  [![React](https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Prisma](https://img.shields.io/badge/Prisma-6.19-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
  [![Zeabur](https://img.shields.io/badge/Deployed_on-Zeabur-000000?style=flat-square&logo=zeabur&logoColor=white)](https://zeabur.com/)

  [功能特色](#-功能特色) • [技術架構](#-技術架構) • [快速開始](#-快速開始) • [部署指南](#-部署指南)
</div>

---

## 🚀 功能特色

AssetMaster 是為現代投資者設計的資產管理工具，整合了台股、美股與加密貨幣，提供直觀、美觀且數據驅動的決策支援。

- **📊 多元資產配置追蹤**：一站式管理台股、美股與加密貨幣，自動計算即時匯率與總資產比例。
- **📈 深度視覺化圖表**：
  - **資產權重環狀圖**：清晰掌握各市場配置。
  - **損益趨勢直方圖**：追蹤每日資產波動與損益變化。
  - **互動式 K 線圖**：整合 Lightweight-Charts，即時分析個股走勢。
- **🎯 自定義投資目標**：依據短、中、長期策略設定目標金額，與實際持倉即時比對進度。
- **🔗 即時數據串接**：
  - **台股**：對接 TWSE/TPEx 官方 API。
  - **美股/加密貨幣**：透過 Yahoo Finance API 獲取全球行情。
- **👤 安全驗證**：支援 Google OAuth 2.0，確保個人資產數據的隱私與安全。
- **🌑 極致暗黑美學**：基於 TailwindCSS 打造的現代化 UI，配備毛玻璃 (Glassmorphism) 特效。

## 🛠️ 技術架構

AssetMaster 採用領先的全端技術棧，確保高效能與開發體驗：

- **Frontend**: React 19, TypeScript, Vite, Recharts, Lightweight-Charts.
- **Backend**: Express 5 (latest!), Node.js, TSX.
- **Database**: Prisma ORM with SQLite (or PostgreSQL/MySQL).
- **Styles**: Vanilla CSS + Lucide Icons.
- **DevOps**: Docker, Zeabur CI/CD.

## 📦 快速開始

### 準備工作
- 已安裝 Node.js (建議 v22+)
- Google Cloud Console Project (用於 OAuth)

### 安裝步驟

1. **複製專案**
   ```bash
   git clone https://github.com/YuZhouLeo/AssetMaster-Dashboard.git
   cd AssetMaster-Dashboard
   ```

2. **安裝依賴**
   ```bash
   npm install
   ```

3. **環境變量設定**
   建立 `.env` 檔案並填入以下內容：
   ```env
   DATABASE_URL="file:./dev.db"
   SESSION_SECRET="your-secret-key"
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   ```

4. **初始化資料庫**
   ```bash
   npx prisma db push
   ```

5. **啟動開發伺服器**
   ```bash
   npm run dev
   ```

## 🚢 部署指南

### Zeabur 部署
AssetMaster 已預設為 Zeabur 優化：
- **Runtime**: Node.js
- **Install Command**: `npm install`
- **Build Command**: `npm run build`
- **Start Command**: `npx prisma db push && node --experimental-strip-types server.ts`

---

<div align="center">
  <p>Made with ❤️ by AssetMaster Team</p>
  <p><i>剛處理完這個 Bug，我覺得我的髮際線又往後撤了 1 公分，這就是開發者的浪漫吧。</i></p>
</div>
