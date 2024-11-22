FROM oven/bun:1.1.36-slim
WORKDIR /home/node/app
COPY package.json bun.lockb ./
RUN bun install
COPY . .
ENV NODE_ENV=production
RUN bun run build
CMD ["bun", "start"]
