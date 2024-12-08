FROM oven/bun:1.1.38-alpine
COPY package.json bun.lockb ./
RUN bun install
COPY . .
ENV NODE_ENV=production
RUN bun run build
CMD ["bun", "start", "start"]
