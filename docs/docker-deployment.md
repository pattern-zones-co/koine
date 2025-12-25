# Docker Deployment

> **Strongly Recommended**: Docker provides critical security isolation, ensuring Claude Code operates only with container user permissions.

## Quick Start

```bash
cp .env.example .env
# Edit .env with your keys

docker compose up -d
curl http://localhost:3100/health
```

By default, this pulls the pre-built image from `ghcr.io/pattern-zones-co/koine:latest`.

## Version Pinning

Pin to a specific version for stability:

```bash
# In .env or inline
KOINE_VERSION=1.2.3 docker compose up -d

# Or set in .env file:
# KOINE_VERSION=1.2.3
```

Available version formats:
- `1.2.3` - Exact version
- `1.2` - Latest patch of minor version
- `1` - Latest minor/patch of major version
- `latest` - Most recent release (default)

## Building from Source

Build from source instead of pulling the pre-built image:

```bash
docker compose up --build
```

This builds locally from the Dockerfile. See [CONTRIBUTING.md](../CONTRIBUTING.md) for development setup.

## Configuration

See [`docker-compose.yml`](../docker-compose.yml) and [`Dockerfile`](../Dockerfile) in the repo root. These can be adapted for your orchestration setup.

## Security

The included configuration uses:

- Multi-stage build (smaller image, no build tools in production)
- Non-root user (`bun`, UID 1000)
- Dropped capabilities and `no-new-privileges`

These patterns are recommended for any orchestration that includes Koine.

## Port Binding

Bind to localhost to prevent bypassing UFW firewalls:

```yaml
ports:
  - "127.0.0.1:3100:3100"
```
