# @patternzones/koine

HTTP gateway that exposes [Claude Code CLI](https://github.com/anthropics/claude-code) as a REST API.

This package is not published to npm. Deploy via Docker from the [repository root](../../README.md).

## Deployment

```bash
git clone https://github.com/pattern-zones-co/koine.git
cd koine

cp .env.example .env
# Edit .env with your keys

docker compose up -d koine
```

## Documentation

- [Getting Started](../../docs/README.md)
- [API Reference](../../docs/api-reference.md)
- [Docker Deployment](../../docs/docker-deployment.md)
- [Environment Variables](../../docs/environment-variables.md)
