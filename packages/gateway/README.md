# @patternzones/koine

HTTP gateway that exposes [Claude Code CLI](https://github.com/anthropics/claude-code) as a REST API.

This package is not published to npm. Deploy via Docker (pre-built or from source).

## Quick Start

```bash
docker run -d -p 3100:3100 \
  -e CLAUDE_CODE_GATEWAY_API_KEY=your-key \
  -e CLAUDE_CODE_OAUTH_TOKEN=your-token \
  ghcr.io/pattern-zones-co/koine:latest
```

See [Docker Deployment](../../docs/docker-deployment.md) for docker-compose setup, version pinning, and production configuration.

## Documentation

- [Getting Started](../../docs/README.md)
- [API Reference](../../docs/api-reference.md)
- [Docker Deployment](../../docs/docker-deployment.md)
- [Environment Variables](../../docs/environment-variables.md)
