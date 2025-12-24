# ==================================================
# Claude Code Gateway - Hardened Dockerfile
# ==================================================
# Security features:
# - Multi-stage build (smaller attack surface)
# - Non-root user execution (bun user, UID 1000)
# - Bun runtime (~100MB smaller than node:20-slim)
# ==================================================

# ----- Stage 1: Build -----
# Pin to specific Bun version for reproducible builds
# Bun 1.2+ uses lockfile v1 format; any 1.2+ version can read it
FROM oven/bun:1.3.3-slim AS builder

WORKDIR /app

# Copy package files (root workspace + gateway package)
COPY package.json ./
COPY bun.lock* ./
COPY packages/gateway/package.json ./packages/gateway/

# Install dependencies (including dev deps for build)
# Falls back to non-frozen install if no lockfile exists
RUN bun install --frozen-lockfile || bun install

# Copy source code
COPY packages/gateway/tsconfig.json ./packages/gateway/
COPY packages/gateway/src ./packages/gateway/src

# Build TypeScript using tsc (preserves module structure for Express compatibility)
WORKDIR /app/packages/gateway
RUN bun run build
WORKDIR /app

# Re-install with production deps only
RUN rm -rf node_modules packages/gateway/node_modules && bun install --production

# ----- Stage 2: Runtime -----
FROM oven/bun:1.3.3-slim

# Install runtime dependencies (as root, before USER switch)
# - curl: required for healthcheck
# - ca-certificates: required for HTTPS API calls
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create node symlink pointing to bun (Bun is Node-compatible)
# Required because Claude CLI shebang uses #!/usr/bin/env node
RUN ln -s /usr/local/bin/bun /usr/local/bin/node

# Install Claude Code CLI globally to a shared location accessible by all users
# BUN_INSTALL sets the root for both packages and binaries
ENV BUN_INSTALL="/usr/local/share/bun"
ENV PATH="/usr/local/share/bun/bin:$PATH"
RUN bun install -g @anthropic-ai/claude-code

# Create app directory
WORKDIR /app

# Copy built artifacts with bun user ownership
COPY --from=builder --chown=bun:bun /app/package.json ./
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/packages/gateway/package.json ./packages/gateway/
COPY --from=builder --chown=bun:bun /app/packages/gateway/dist ./packages/gateway/dist

# Copy OpenAPI spec for /docs endpoint
COPY --chown=bun:bun docs/openapi.yaml ./docs/

# Create Claude CLI data directory for the bun user
RUN mkdir -p /home/bun/.claude && chown -R bun:bun /home/bun/.claude

# Copy Claude skills/commands to the Claude CLI config directory
# These enable Claude Code to use custom tools and slash commands
COPY --chown=bun:bun claude-assets /home/bun/.claude

# Switch to non-root user
USER bun

# Expose the service port
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3100/health || exit 1

# Start the service
CMD ["bun", "run", "packages/gateway/dist/index.js"]
