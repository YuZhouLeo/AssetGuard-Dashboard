# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# 複製 package 文件（利用 Docker layer cache）
COPY package*.json ./

# 強制安裝所有依賴（包含 vite 等 devDependencies）
# Zeabur 會自動設 NODE_ENV=production，導致 npm ci 跳過 devDeps，所以這裡要覆蓋
ENV NODE_ENV=development
RUN npm ci

# 複製全部原始碼
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 建構 Vite 前端
RUN npm run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# 只安裝 production 依賴
COPY package*.json ./
ENV NODE_ENV=production
RUN npm ci --omit=dev

# 複製 Prisma schema 和生成的 client
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=node:node prisma ./prisma

# 複製編譯好的前端
COPY --from=builder --chown=node:node /app/dist ./dist

# 複製 server 原始碼（node 22 原生支援 --experimental-strip-types）
COPY --chown=node:node server.ts ./
COPY --chown=node:node types.ts ./

EXPOSE 3000

# 啟動：先同步資料庫 schema，再跑 server
USER node
CMD ["sh", "-c", "npx prisma db push && node --experimental-strip-types server.ts"]