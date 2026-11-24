FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY src ./src
COPY tsconfig*.json ./
RUN npx prisma generate
RUN npm run build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --chown=node:node prisma7.config.ts ./prisma7.config.ts
COPY --chown=node:node scripts/start.sh ./scripts/start.sh
RUN chmod +x ./scripts/start.sh
USER node
EXPOSE 3000
CMD [ "./scripts/start.sh" ]