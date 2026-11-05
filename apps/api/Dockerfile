FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @dostavka/api... build && pnpm --filter @dostavka/api deploy --prod /out
RUN cp -r apps/api/dist /out/dist

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
COPY infra/migrations /infra/migrations
COPY infra/seed /infra/seed
ENV MIGRATIONS_DIR=/infra/migrations SEED_DIR=/infra/seed
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
