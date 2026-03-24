const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

// 1. Finnhub API Key 直接嵌入 URL Query String
code = code.replace(
  /fetch\(`https:\/\/finnhub\.io\/(api\/v1\/quote\?symbol=\$\{ticker\})&token=\$\{finnhubKey\}`\)/g,
  "fetch(`https://finnhub.io/$1`, { headers: { 'X-Finnhub-Token': finnhubKey } })"
);

code = code.replace(
  /fetch\(`https:\/\/finnhub\.io\/(api\/v1\/stock\/profile2\?symbol=\$\{ticker\})&token=\$\{finnhubKey\}`\)/g,
  "fetch(`https://finnhub.io/$1`, { headers: { 'X-Finnhub-Token': finnhubKey } })"
);

code = code.replace(
  /fetch\(`https:\/\/finnhub\.io\/(api\/v1\/stock\/candle\?symbol=\$\{ticker\}&resolution=D&from=\$\{from\}&to=\$\{to\})&token=\$\{process\.env\.FINNHUB_API_KEY\}`\)/g,
  "fetch(`https://finnhub.io/$1`, { headers: { 'X-Finnhub-Token': process.env.FINNHUB_API_KEY! } })"
);

// 2. `/api/chart/:ticker` 路由的 ticker 參數未驗證
code = code.replace(
  "app.get('/api/chart/:ticker', requireAuth, async (req, res) => {\n  try {\n    const { ticker } = req.params;\n    const market",
  "app.get('/api/chart/:ticker', requireAuth, async (req, res) => {\n  try {\n    const ticker = parseTicker(req.params.ticker);\n    if (!ticker) return res.status(400).json({ error: 'Invalid ticker' });\n    const market"
);

// 3. Session Cookie maxAge 過長 (從 30 天改為 7 天)
code = code.replace(
  "maxAge: 30 * 24 * 60 * 60 * 1000",
  "maxAge: 7 * 24 * 60 * 60 * 1000"
);

// 4. trust proxy 設為 1 但無環境區分
code = code.replace(
  "app.set('trust proxy', 1);",
  "if (isProd) app.set('trust proxy', 1);"
);

// 5. 型別斷言 as any 過度使用
const userType = `
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name?: string | null;
      googleId?: string | null;
      avatarUrl?: string | null;
      principal: number;
      shortTarget: number;
      midTarget: number;
      longTarget: number;
    }
  }
}
`;
if (!code.includes('namespace Express')) {
  code = code.replace("import cron from 'node-cron';", "import cron from 'node-cron';\n" + userType);
}

// 替換所有的 (req.user as any) 及 req.user as any
code = code.replace(/\(req\.user as any\)/g, "req.user");
// 對於那些沒括號的，例如 const u = req.user as any;
code = code.replace(/req\.user as any/g, "req.user");
// passport serializeUser 中:
code = code.replace("passport.serializeUser((user: any, done) => done(null, user.id));", "passport.serializeUser((user: any, done) => done(null, user.id));"); 
// 這裡有 as any，我們先確保不替換錯。 

fs.writeFileSync('server.ts', code);
console.log('Fixed middle risks');
