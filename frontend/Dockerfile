# stage 1: install dependencies, exactly as recorded in package-lock.json
FROM node:22-alpine AS deps
# compatibility library some Next.js tools expect on Alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
#  ↑ ci: clean install from the lock file; stricter and more predictable than "npm install"

# stage 2: build the site
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# rewrites are fixed at build time, so the API address must be known here
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
# listen on all interfaces inside the container, so Docker can reach it
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# don't run as root inside the container
USER node
EXPOSE 3000
CMD ["node", "server.js"]
