# stage 1: install dependencies, exactly as recorded in package-lock.json
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# stage 2: build the site
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV API_URL=http://api:8080
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# stage 3: the small image that actually runs
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV API_URL=http://api:8080
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# create .next owned by the "node" user, so the server can write its cache there
RUN mkdir .next && chown node:node .next

# --chown=node:node: the copied files belong to "node" instead of root
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# don't run as root inside the container
USER node
EXPOSE 3000
CMD ["node", "server.js"]
