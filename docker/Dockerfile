# Multi-arch Node 18 Alpine build (supports Raspberry Pi armv7/arm64 and x86_64)
FROM node:18-alpine AS builder
WORKDIR /app

# Install build deps for native modules if needed
RUN apk add --no-cache python3 make g++

# Copy manifests first for better layer caching
COPY package*.json ./

# Install dependencies (use npm ci if lockfile is present)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy the rest of the project
COPY . .

# Build TypeScript -> dist
RUN npm run build

# Prune dev dependencies for runtime image
RUN npm prune --omit=dev

# Runtime stage
FROM node:18-alpine AS runner
WORKDIR /app

# Production environment
ENV NODE_ENV=production
ENV TZ=UTC

# Copy built app, production deps, and static assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Note: mDNS (Bonjour) uses UDP 5353 (<1024). Binding to 5353 may require root or CAP_NET_BIND_SERVICE.
# For Raspberry Pi host networking, keeping the default user (root) avoids bind permission issues.

# Expose ports (only used when NOT on host networking)
EXPOSE 3000
EXPOSE 7411/udp

# Basic healthcheck (adjust path if you add a dedicated /health endpoint)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "dist/index.js"]
