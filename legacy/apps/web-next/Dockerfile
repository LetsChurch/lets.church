FROM oven/bun:1.1.42-slim
WORKDIR /home/bun/app
COPY package.json bun.lockb ./
RUN bun install
COPY . .
ENV NODE_ENV=production
RUN bun run build
CMD ["bun", "start"]
