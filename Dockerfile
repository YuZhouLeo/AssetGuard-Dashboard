# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# 強制安裝所有依賴（Zeabur 會設 NODE_ENV=production 導致跳過 devDeps）
ENV NODE_ENV=development
RUN npm ci

COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 建構 Vite 前端
RUN npm run build

# 將 server.ts 編譯為 JS（避免 runtime 依賴 --experimental-strip-types）
RUN npx tsc server.ts --module nodenext --moduleResolution nodenext --target ES2022 --esModuleInterop --skipLibCheck --outDir dist-server

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
ENV NODE_ENV=production
RUN npm ci --omit=dev

# 複製 Prisma schema 和生成的 client
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=node:node prisma ./prisma

# 複製編譯好的前端
COPY --from=builder --chown=node:node /app/dist ./dist

# 複製編譯後的 server JS
COPY --from=builder --chown=node:node /app/dist-server/server.js ./server.js

# 複製 DB 啟動腳本
COPY --chown=node:node start.sh ./start.sh
RUN chmod +x start.sh

EXPOSE 8080

USER node
CMD ["sh", "./start.sh"]
