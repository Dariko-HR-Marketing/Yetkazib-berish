FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @dostavka/api... build && pnpm --filter @dostavka/api deploy --prod /out

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
COPY infra/migrations /infra/migrations
COPY infra/seed /infra/seed
ENV MIGRATIONS_DIR=/infra/migrations SEED_DIR=/infra/seed
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
