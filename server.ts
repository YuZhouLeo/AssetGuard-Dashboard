import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import createMemoryStore from 'memorystore';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { PrismaClient } from '@prisma/client';
import { createServer as createViteServer } from 'vite';
import yahooFinance from 'yahoo-finance2';
import cron from 'node-cron';

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required.');
}

const isProd = process.env.NODE_ENV === 'production';
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length > 0
  ? configuredOrigins
  : (isProd ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000']);
if (isProd && allowedOrigins.length === 0) {
  throw new Error('CORS_ORIGINS is required in production.');
}

const cookieSameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
if (!['lax', 'strict', 'none'].includes(cookieSameSite)) {
  throw new Error('COOKIE_SAMESITE must be one of: lax, strict, none');
}
if (cookieSameSite === 'none' && !isProd) {
  throw new Error('COOKIE_SAMESITE=none requires HTTPS production mode.');
}

const MemoryStore = createMemoryStore(session);
const sessionStore = new MemoryStore({
  checkPeriod: 24 * 60 * 60 * 1000,
});

// Zeabur / ?嗡??脩垢撟喳?賣???隞??嚗??????甇?Ⅱ?? HTTPS ??secure cookie
app.set('trust proxy', 1);

// ??? Session & Auth Middleware ????????????????????????????????????????????????

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com'],
      "style-src": ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      "font-src": ["'self'", 'https://fonts.gstatic.com', 'data:'],
      "img-src": ["'self'", 'https:', 'data:'],
      "connect-src": ["'self'", 'https://finnhub.io', 'https://api.binance.com', 'https://query2.finance.yahoo.com', 'https://query1.finance.yahoo.com'],
    },
  },
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);
app.use('/auth', authLimiter);

app.use(session({
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: cookieSameSite as 'lax' | 'strict' | 'none',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS not allowed'));
  },
  credentials: true,
}));
app.use(express.json());

// ??? Passport Google Strategy ?????????????????????????????????????????????????

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
}, async (_accessToken, _refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error('No email from Google'), undefined);

    // Upsert user嚗?撠望?啣?蝔??剖?嚗??停撱箇?
    const user = await prisma.user.upsert({
      where: { googleId: profile.id },
      update: {
        name: profile.displayName,
        avatarUrl: profile.photos?.[0]?.value,
      },
      create: {
        email,
        name: profile.displayName,
        googleId: profile.id,
        avatarUrl: profile.photos?.[0]?.value,
      },
    });

    return done(null, user);
  } catch (err) {
    return done(err as Error, undefined);
  }
}));

passport.serializeUser((user: any, done) => done(null, user.id));

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// ??? Auth Middleware ??????????????????????????????????????????????????????????

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

function isAllowedOrigin(origin: string) {
  return allowedOrigins.includes(origin);
}

function requireSameOrigin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.get('origin');
  if (origin && isAllowedOrigin(origin)) return next();

  const referer = req.get('referer');
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (isAllowedOrigin(refererOrigin)) return next();
    } catch {
      // Ignore invalid referer format and continue to reject.
    }
  }

  res.status(403).json({ error: 'CSRF validation failed' });
}

const ALLOWED_MARKETS = new Set(['TW', 'US', 'CRYPTO']);
const ALLOWED_PORTFOLIO_TYPES = new Set(['SHORT', 'MID', 'LONG']);
const TICKER_PATTERN = /^[A-Za-z0-9.-]{1,16}$/;

function parsePositiveNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseNonNegativeNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function parseTicker(value: unknown) {
  if (typeof value !== 'string') return null;
  const ticker = value.trim().toUpperCase();
  if (!TICKER_PATTERN.test(ticker)) return null;
  return ticker;
}

app.use(requireSameOrigin);

// ??? Auth Routes ??????????????????????????????????????????????????????????????

// ?? Google ?餃瘚?
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'], state: (true as unknown as string) })
);

// Google ?矽
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  (_req, res) => {
    res.redirect('/');
  }
);

// ?餃
app.post('/auth/logout', requireAuth, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((sessionErr) => {
      if (sessionErr) return next(sessionErr);
      res.clearCookie('connect.sid', {
        httpOnly: true,
        secure: isProd,
        sameSite: cookieSameSite as 'lax' | 'strict' | 'none',
      });
      res.json({ success: true });
    });
  });
});

// ???嗅?雿輻??閮??垢?其??斗?臬撌脩?伐?
app.get('/api/me', async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.json({ user: null });
  }
  const u = req.user as any;
  // 敺?DB ?????啗???deserializeUser 銝?摰?堆?
  const fresh = await prisma.user.findUnique({ where: { id: u.id } });
  if (!fresh) return res.json({ user: null });
  res.json({
    user: {
      id: fresh.id,
      name: fresh.name,
      email: fresh.email,
      avatarUrl: fresh.avatarUrl,
      principal: fresh.principal,
      shortTarget: fresh.shortTarget,
      midTarget: fresh.midTarget,
      longTarget: fresh.longTarget,
    }
  });
});

// ??? Holdings API ?????????????????????????????????????????????????????????????

app.get('/api/holdings', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const holdings = await prisma.holding.findMany({ where: { userId } });
    res.json(holdings);
  } catch {
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
});

/**
 * ?啣???雿菜??? * ?摩嚗 userId + ticker + portfolioType 蝯?撌脣??剁??脰???撟喳??蔥
 */
app.post('/api/holdings', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const ticker = parseTicker(req.body?.ticker);
    const market = typeof req.body?.market === 'string' ? req.body.market : '';
    const portfolioType = typeof req.body?.portfolioType === 'string' ? req.body.portfolioType : '';
    const amount = parsePositiveNumber(req.body?.amount);
    const avgPrice = parsePositiveNumber(req.body?.avgPrice);
    if (!ticker || !ALLOWED_MARKETS.has(market) || !ALLOWED_PORTFOLIO_TYPES.has(portfolioType) || amount === null || avgPrice === null) {
      return res.status(400).json({ error: 'Invalid holding payload' });
    }

    // check for existing holding
    const existing = await prisma.holding.findFirst({
      where: { userId, ticker, portfolioType }
    });

    if (existing) {
      // ?蔥?摩嚗?賊? = ???堆??啣???= ??撟喳?
      const newAmount = existing.amount + amount;
      const newAvgPrice = ((existing.avgPrice * existing.amount) + (avgPrice * amount)) / newAmount;
      
      const updated = await prisma.holding.update({
        where: { id: existing.id },
        data: {
          amount: newAmount,
          avgPrice: newAvgPrice,
          updatedAt: new Date()
        }
      });
      return res.json(updated);
    }

    // ?芸??亥岷?砍?迂
    let name: string = ticker;
    try {
      const isTW = market === 'TW' || /^\d+$/.test(ticker);
      const cleanTicker = isTW ? ticker.replace('.TW', '') : ticker;

      // ?芸?敺?StockCache ?曉?蝔?(?啗?虜蝎暹?嚗??∠?其???)
      const cached = await (prisma.stockCache as any).findUnique({ where: { ticker: cleanTicker } });
      if (cached && (cached as any).name) {
        name = (cached as any).name;
      } else {
        // fetch latest stock name and quote if cache miss
        const newData = await fetchPriceDirectly(ticker, market, true);
        if (newData) {
          name = newData.name || name;
          await (prisma.stockCache as any).upsert({
            where: { ticker: cleanTicker },
            update: { name: newData.name, currentPrice: newData.currentPrice, change24h: newData.change24h, lastUpdated: new Date() },
            create: { ticker: cleanTicker, name: newData.name, market: newData.market, currentPrice: newData.currentPrice, change24h: newData.change24h }
          });
        }
      }
    } catch (e) { console.warn('Name fetch error', e); }

    const holding = await prisma.holding.create({
      data: {
        userId,
        ticker,
        name,
        market,
        portfolioType,
        amount,
        avgPrice,
        purchaseDate: new Date(), // 蝝?撓?亦銝??交?
      }
    });

    res.json(holding);
  } catch (err) {
    res.status(500).json({ error: 'Failed to process holding' });
  }
});

// ??靽格???(撠??瘙?4)
app.patch('/api/holdings/:id', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const holdingId = String(req.params.id);
    const amount = req.body?.amount === undefined ? undefined : parsePositiveNumber(req.body.amount);
    const avgPrice = req.body?.avgPrice === undefined ? undefined : parsePositiveNumber(req.body.avgPrice);
    if ((req.body?.amount !== undefined && amount === null) || (req.body?.avgPrice !== undefined && avgPrice === null)) {
      return res.status(400).json({ error: 'Invalid amount or avgPrice' });
    }
    if (amount === undefined && avgPrice === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const updateResult = await prisma.holding.updateMany({
      where: { id: holdingId, userId },
      data: { 
        amount,
        avgPrice,
        updatedAt: new Date()
      }
    });
    if (updateResult.count === 0) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    const updated = await prisma.holding.findUnique({ where: { id: holdingId } });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update holding' });
  }
});

app.delete('/api/holdings/:id', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const holdingId = String(req.params.id);
    const result = await prisma.holding.deleteMany({ where: { id: holdingId, userId } });
    if (result.count === 0) {
      return res.status(404).json({ error: 'Holding not found' });
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete holding' });
  }
});

// ??? Exchange Rate Helper (?舐??芸???) ????????????????????????????????????????

let cachedRate = 32.5; // ???身?舐?
let lastRateFetch = 0;

async function getUsdTwdRate() {
  const now = Date.now();
  // 瘥?6 撠??湔銝甈∪??荔??踹??餌?隢?
  if (now - lastRateFetch > 6 * 60 * 60 * 1000) {
    try {
      // ?寧隞?USD ?箏皞? API嚗?交 data.rates.TWD 撠望?舐?
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data: any = await response.json();
      if (data && data.rates && data.rates.TWD) {
        cachedRate = data.rates.TWD;
        lastRateFetch = now;
        console.log(`Current USD/TWD Rate Updated: ${cachedRate}`);
      }
    } catch (e) {
      console.error('Exchange rate fetch failed, using fallback:', e);
    }
  }
  return cachedRate;
}

app.get('/api/exchange-rate', requireAuth, async (req, res) => {
  const rate = await getUsdTwdRate();
  res.json({ rate });
});

// ??? Principal & Targets API ?????????????????????????????????????????????????

app.patch('/api/me/principal', requireAuth, async (req, res) => {
  try {
    const principal = parseNonNegativeNumber(req.body?.principal);
    if (principal === null) return res.status(400).json({ error: 'Invalid principal' });
    const user = req.user as any;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { principal }
    });
    res.json({ principal: updated.principal });
  } catch {
    res.status(500).json({ error: 'Failed to update principal' });
  }
});

// ?脣??凋葉?瑟????格???
app.patch('/api/me/targets', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const { shortTarget, midTarget, longTarget } = req.body;
    const data: Record<string, number> = {};
    const parsedShortTarget = shortTarget === undefined ? undefined : parseNonNegativeNumber(shortTarget);
    const parsedMidTarget = midTarget === undefined ? undefined : parseNonNegativeNumber(midTarget);
    const parsedLongTarget = longTarget === undefined ? undefined : parseNonNegativeNumber(longTarget);
    if ((shortTarget !== undefined && parsedShortTarget === null) ||
        (midTarget !== undefined && parsedMidTarget === null) ||
        (longTarget !== undefined && parsedLongTarget === null)) {
      return res.status(400).json({ error: 'Invalid target value' });
    }

    if (parsedShortTarget !== undefined) data.shortTarget = parsedShortTarget;
    if (parsedMidTarget !== undefined) data.midTarget = parsedMidTarget;
    if (parsedLongTarget !== undefined) data.longTarget = parsedLongTarget;
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No target fields to update' });
    }

    const updated = await prisma.user.update({ where: { id: userId }, data });
    res.json({ shortTarget: updated.shortTarget, midTarget: updated.midTarget, longTarget: updated.longTarget });
  } catch {
    res.status(500).json({ error: 'Failed to update targets' });
  }
});

// ??? Taiwan Official API Helper ??????????????????????????????????????????????

async function fetchTaiwanOfficialPrices() {
  console.log('Fetching official TWSE/TPEx prices...');
  const now = new Date();
  try {
    // 1. 銝? (TWSE)
    const twseRes = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
    const twseData = await twseRes.json();
    if (Array.isArray(twseData)) {
      for (const item of twseData) {
        const ticker = item.Code;
        const currentPrice = parseFloat(item.ClosingPrice) || 0;
        const change = parseFloat(item.Change) || 0;
        const prevClose = currentPrice - change;
        const change24h = prevClose !== 0 ? (change / prevClose) * 100 : 0;

        await (prisma.stockCache as any).upsert({
          where: { ticker },
          update: { name: item.Name, currentPrice, change24h, lastUpdated: now },
          create: { ticker, name: item.Name, market: 'TW', currentPrice, change24h, lastUpdated: now }
        });
      }
    }

    // 2. 銝? (TPEx)
    const tpexRes = await fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes');
    const tpexData = await tpexRes.json();
    if (Array.isArray(tpexData)) {
      for (const item of tpexData) {
        const ticker = item.SecuritiesCompanyCode;
        const currentPrice = parseFloat(item.Close) || 0;
        const change = parseFloat(item.Change) || 0;
        const prevClose = currentPrice - change;
        const change24h = prevClose !== 0 ? (change / prevClose) * 100 : 0;

        await (prisma.stockCache as any).upsert({
          where: { ticker },
          update: { name: item.CompanyName, currentPrice, change24h, lastUpdated: now },
          create: { ticker, name: item.CompanyName, market: 'TW', currentPrice, change24h, lastUpdated: now }
        });
      }
    }
    console.log('Taiwan official prices updated successfully.');
  } catch (err) {
    console.error('Failed to fetch Taiwan official prices:', err);
  }
}

// ??? Price Cache API ??????????????????????????????????????????????????????????

// ??? Price Provider Helper (?神?勗?脣??摩) ??????????????????????????????????

async function fetchPriceDirectly(ticker: string, market: string, fetchName: boolean = false) {
  const now = new Date();
  
  // 1. ??鞎典馳嚗雁?蝙??Binance API (??Key 銝扔摨衣帘摰?
  if (market === 'CRYPTO') {
    try {
      const symbol = ticker.replace('-USD', '').replace('-', '').toUpperCase() + 'USDT';
      const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      const data: any = await response.json();
      
      if (data && data.lastPrice) {
        return {
          currentPrice: parseFloat(data.lastPrice),
          change24h: parseFloat(data.priceChangePercent),
          market: 'CRYPTO',
          name: fetchName ? ticker : undefined
        };
      }
    } catch (e) {
      console.warn(`Binance fetch failed for ${ticker}`);
    }
  }

  // 2. ?啗嚗雁?? (?望雿??血?撖怠???API Helper嚗?雿?單??)
  if (market === 'TW' || /^\d+$/.test(ticker)) {
    try {
      const queryTicker = ticker.endsWith('.TW') ? ticker : `${ticker}.TW`;
      const quote: any = await (yahooFinance as any).quote(queryTicker);
      if (quote) {
        return {
          currentPrice: quote.regularMarketPrice,
          change24h: quote.regularMarketChangePercent,
          market: 'TW',
          name: fetchName ? (quote.shortName || quote.longName) : undefined
        };
      }
    } catch (e) { 
      console.error(`TW Quote failed: ${ticker}`); 
    }
  }

  // 3. 蝢嚗?Ｘ??Finnhub API (閫?捱 Zeabur IP 鋡急????賊隤斤???)
  if (market === 'US' || !/^\d+$/.test(ticker)) {
    try {
      const finnhubKey = process.env.FINNHUB_API_KEY;
      if (!finnhubKey) {
        console.warn('FINNHUB_API_KEY is missing; skipping US quote fetch.');
        return null;
      }

      // ?澆 Finnhub Quote API
      const quoteRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${finnhubKey}`);
      if (!quoteRes.ok) throw new Error(`Quote error! status: ${quoteRes.status}`);
      const quoteData: any = await quoteRes.json();

      let name: string | undefined = undefined;
      // ?芣??冽?蝣箄?瘙????Profile (蝭??API Call)
      if (fetchName && quoteData.c !== 0) {
        try {
          const profileRes = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${finnhubKey}`);
          if (profileRes.ok) {
            const profileData: any = await profileRes.json();
            name = profileData.name;
          }
        } catch (e) { console.warn(`Finnhub name fetch failed for ${ticker}`); }
      }

      // Finnhub ??澆?閫?? (c = current price, dp = percent change)
      if (quoteData && quoteData.c !== 0) {
        return {
          currentPrice: quoteData.c,
          change24h: quoteData.dp || 0, 
          market: 'US',
          name: name
        };
      }
    } catch (e) {
      console.error(`Finnhub API fetch failed for ${ticker}`, e);
    }
  }

  return null;
}

// ??? Price Cache API (?芸?敺?頝舐) ??????????????????????????????????????????????

app.get('/api/prices', requireAuth, async (req, res) => {
  const tickers = req.query.tickers as string;
  if (!tickers) return res.status(400).json({ error: 'Missing tickers' });

  const tickerList = tickers
    .split(',')
    .map((t) => parseTicker(t))
    .filter((t): t is string => Boolean(t));
  if (tickerList.length === 0 || tickerList.length > 100) {
    return res.status(400).json({ error: 'Invalid tickers' });
  }

  const results: Record<string, any> = {};

  try {
    // read user scope for this request
    const userId = (req.user as any).id;
    const holdings = await prisma.holding.findMany({
      where: { userId, ticker: { in: tickerList } }
    });

    for (let ticker of tickerList) {
      // 蝯曹?閬嚗??ticker ?典翰?葉銝 .TW
      const cleanTicker = ticker.replace('.TW', '').toUpperCase();
      const market = holdings.find(h => h.ticker === ticker)?.market || 'US';
      
      let cache = await (prisma.stockCache as any).findUnique({ where: { ticker: cleanTicker } });
      const now = new Date();

      // refresh cache after 60s or when name is missing
      const needsName = !cache || !cache.name;
      if (!cache || (now.getTime() - cache.lastUpdated.getTime() > 60 * 1000) || needsName) {
        const newData = await fetchPriceDirectly(ticker, market, needsName);
        if (newData) {
          cache = await (prisma.stockCache as any).upsert({
            where: { ticker: cleanTicker },
            update: { 
              name: newData.name || undefined,
              currentPrice: newData.currentPrice, 
              change24h: newData.change24h, 
              lastUpdated: now 
            },
            create: { 
              ticker: cleanTicker, 
              name: newData.name || ticker,
              market: newData.market, 
              currentPrice: newData.currentPrice, 
              change24h: newData.change24h,
              lastUpdated: now
            }
          });
        }
      }

      if (cache) {
        results[ticker] = {
          currentPrice: cache.currentPrice,
          change24h: cache.change24h
        };
      }
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Price update error' });
  }
});

// ??? Price Refresh API ????????????????????????????????????????????????????????

app.post('/api/prices/refresh-tw', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    await fetchTaiwanOfficialPrices();
    const holdings = await prisma.holding.findMany({ where: { userId, market: 'TW' } });
    for (const h of holdings) {
      const cleanTicker = h.ticker.replace('.TW', '');
      const cache = await (prisma.stockCache as any).findUnique({ where: { ticker: cleanTicker } });
      if (cache?.name && (!h.name || h.name === h.ticker)) {
        await prisma.holding.update({
          where: { id: h.id },
          data: { name: cache.name },
        });
      }
    }
    res.json({ success: true, message: 'TW prices and names refreshed' });
  } catch {
    res.status(500).json({ error: 'Failed to refresh TW prices' });
  }
});

app.post('/api/prices/refresh-global', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const holdings = await prisma.holding.findMany({ 
      where: { userId, market: { in: ['US', 'CRYPTO'] } } 
    });
    
    for (const h of holdings) {
      // 撘瑕?? API ?脣???啣?蝔梯??勗
      const newData = await fetchPriceDirectly(h.ticker, h.market, true);
      if (newData) {
        // ?湔敹怠?
        await (prisma.stockCache as any).upsert({
          where: { ticker: h.ticker },
          update: { name: newData.name, currentPrice: newData.currentPrice, change24h: newData.change24h, lastUpdated: new Date() },
          create: { ticker: h.ticker, name: newData.name, market: newData.market, currentPrice: newData.currentPrice, change24h: newData.change24h }
        });
        
        // 憒???蝔梢???ticker嚗??湔?迂
        if (h.name === h.ticker || !h.name) {
          await prisma.holding.update({
            where: { id: h.id },
            data: { name: newData.name || h.ticker }
          });
        }
      }
    }
    res.json({ success: true, message: 'Global prices and names refreshed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh global prices' });
  }
});

/**
 * ??? 瘥??甇瑕 API ???????????????????????????????????????????????????????
 * 閮????????亙?嚗??漱??蜇撣潸??? * ??嚗?瘥? holding嚗? purchaseDate ?喃?嚗?憭拍? (amount ? ?嗆?嗥?? 撠望?嗆撣? * ?望???風?涼B嚗?箇 Yahoo Finance ????N 憭拇風?莎?靘????交?祟?詨???
 * ??澆?嚗{ date: 'YYYY-MM-DD', totalValue: number, dailyChange: number }]
 */
app.get('/api/pnl-history', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const holdings = await prisma.holding.findMany({ where: { userId } });

    if (holdings.length === 0) {
      return res.json([]);
    }

    const rate = await getUsdTwdRate();

    const today = new Date();
    const todayDateStr = today.toISOString().split("T")[0];

    // 排除今日新增的倉位（不讓其影響損益歷史計算）
    const holdingsForPnl = holdings.filter(
      h => new Date(h.purchaseDate).toISOString().split("T")[0] < todayDateStr
    );

    if (holdingsForPnl.length === 0) {
      return res.json([]);
    }

    // 找最早購買日期
    const earliestDate = holdingsForPnl.reduce((earliest, h) => {
      const d = new Date(h.purchaseDate);
      return d < earliest ? d : earliest;
    }, new Date());

    // clamp history range to most recent 60 days
    const start = new Date(Math.max(earliestDate.getTime(), today.getTime() - 60 * 24 * 3600 * 1000));

    // Fetch price history per ticker
    const historyByTicker: Record<string, Record<string, number>> = {};

    for (const h of holdingsForPnl) {
      const ticker = h.ticker;
      if (historyByTicker[ticker]) continue; // ??ticker ?芣?銝甈?
      try {
        const isTW = h.market === 'TW' || /^\d+$/.test(ticker);
        const queryTicker = isTW ? (ticker.endsWith('.TW') ? ticker : `${ticker}.TW`) : ticker;

        // ?芸??岫雿輻 Finnhub ?脣?蝢甇瑕鞈? (閫?捱 Yahoo 鋡急???)
        if (!isTW && process.env.FINNHUB_API_KEY) {
          try {
            const from = Math.floor(start.getTime() / 1000);
            const to = Math.floor(today.getTime() / 1000);
            const response = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}&token=${process.env.FINNHUB_API_KEY}`);
            const data: any = await response.json();
            
            if (data && data.s === 'ok' && data.c) {
              const prices: Record<string, number> = {};
              for (let i = 0; i < data.t.length; i++) {
                const dateStr = new Date(data.t[i] * 1000).toISOString().split('T')[0];
                prices[dateStr] = data.c[i];
              }
              historyByTicker[ticker] = prices;
              continue; // ???脣??歲??Yahoo ?
            }
          } catch (e) {
            console.warn(`Finnhub history fetch failed for ${ticker}, fallback to Yahoo...`);
          }
        }

        const historical: any = await (yahooFinance as any).chart(queryTicker, {
          period1: start.toISOString().split('T')[0],
          period2: today.toISOString().split('T')[0],
          interval: '1d',
        });

        const prices: Record<string, number> = {};
        const quotes = historical?.quotes || [];
        for (const q of quotes) {
          if (q.date && q.close) {
            const dateStr = new Date(q.date).toISOString().split('T')[0];
            prices[dateStr] = q.close;
          }
        }
        // ?其嗾瘛?ticker嚗?撣?.TW嚗?
        const cleanKey = isTW ? ticker.replace('.TW', '') : ticker;
        historyByTicker[cleanKey] = prices;
      } catch (err) {
        console.warn(`History fetch failed for ${h.ticker}:`, err);
      }
    }

    // build business-day date axis
    const dateList: string[] = [];
    const cursor = new Date(start);
    while (cursor <= today) {
      const dayOfWeek = cursor.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        dateList.push(cursor.toISOString().split('T')[0]);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // aggregate portfolio value and day-over-day change
    const result: { date: string; totalValue: number; dailyChange: number }[] = [];
    const prevEntryPrices: Record<string, number> = {}; // 餈質馱????銝憭拍??寞

    for (const dateStr of dateList) {
      let dayTotal = 0;
      let dayChange = 0;

      for (const h of holdingsForPnl) {
        const holdingDateStr = new Date(h.purchaseDate).toISOString().split('T')[0];
        // skip holdings not yet purchased on this day
        if (holdingDateStr > dateStr) continue;

        const isTW = h.market === 'TW' || /^\d+$/.test(h.ticker);
        const cleanKey = isTW ? h.ticker.replace('.TW', '') : h.ticker;
        const tickerPrices = historyByTicker[cleanKey];
        
        const currentPrice = (tickerPrices && tickerPrices[dateStr]) 
          ? tickerPrices[dateStr] 
          : (h.avgPrice || 0);

        const multiplier = isTW ? 1 : rate;
        dayTotal += h.amount * currentPrice * multiplier;

        // 新增倉位當天不計入每日損益，只從下一個交易日開始計算價格變動
        if (holdingDateStr === dateStr) {
          prevEntryPrices[h.id] = currentPrice;
          continue;
        }

        if (prevEntryPrices[h.id] !== undefined) {
          dayChange += h.amount * (currentPrice - prevEntryPrices[h.id]) * multiplier;
        }

        prevEntryPrices[h.id] = currentPrice;
      }

      result.push({ 
        date: dateStr, 
        totalValue: Math.round(dayTotal), 
        dailyChange: Math.round(dayChange) 
      });
    }

    res.json(result);
  } catch (err) {
    console.error('PnL history error:', err);
    res.status(500).json({ error: 'Failed to compute PnL history' });
  }
});

// /api/chart/:ticker — 返回真實日K線資料
app.get('/api/chart/:ticker', requireAuth, async (req, res) => {
  try {
    const { ticker } = req.params;
    const market = (req.query.market as string) || '';
    const isTW = market === 'TW' || /^\d+$/.test(ticker);
    const queryTicker = isTW ? (ticker.endsWith('.TW') ? ticker : `${ticker}.TW`) : ticker;

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const today = new Date();

    // 先嘗試 Finnhub（美股）
    if (!isTW && process.env.FINNHUB_API_KEY) {
      try {
        const from = Math.floor(oneYearAgo.getTime() / 1000);
        const to = Math.floor(today.getTime() / 1000);
        const response = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}&token=${process.env.FINNHUB_API_KEY}`);
        const data: any = await response.json();
        if (data && data.s === 'ok' && data.t) {
          const candles = data.t.map((ts: number, i: number) => ({
            time: ts,
            open: data.o[i],
            high: data.h[i],
            low: data.l[i],
            close: data.c[i],
          }));
          return res.json(candles);
        }
      } catch (e) {
        console.warn(`Finnhub chart fetch failed for ${ticker}, fallback to Yahoo`);
      }
    }

    // Yahoo Finance 日K
    const historical: any = await (yahooFinance as any).chart(queryTicker, {
      period1: oneYearAgo.toISOString().split('T')[0],
      period2: today.toISOString().split('T')[0],
      interval: '1d',
    });

    const quotes = historical?.quotes || [];
    const candles = quotes
      .filter((q: any) => q.date && q.open != null && q.high != null && q.low != null && q.close != null)
      .map((q: any) => ({
        time: Math.floor(new Date(q.date).getTime() / 1000),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
      }));

    res.json(candles);
  } catch (err) {
    console.error('Chart fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});


// ??? Cron Jobs ????????????????????????????????????????????????????????????????

function setupCronJobs() {
  // 撌脫??嗉?瘙宏??13:35 ???啁?摨??寧?梁?嗆?????啜?}
}

// ??? Server Start ?????????????????????????????????????????????????????????????

async function startServer() {
  setupCronJobs();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    // SPA fallback ??app.use ?曉?敺?隤?甇?Ⅱ銝?Express 5 摰?詨捆
    app.use((_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(Number(PORT) || 3000, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();





