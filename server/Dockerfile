FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy named paths only, so a local .env can never end up in the image
COPY src ./src
COPY prompts ./prompts

USER bun
EXPOSE 3000
CMD ["bun", "src/index.ts"]
