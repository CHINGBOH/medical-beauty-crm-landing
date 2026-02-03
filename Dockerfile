FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
RUN pnpm build

EXPOSE 3000
CMD ["node", "dist/index.js"]
