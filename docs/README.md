# Documentation

| Guide | Description |
|-------|-------------|
| [API Reference](api-reference.md) | REST endpoints |
| [SDK Guide](sdk-guide.md) | TypeScript SDK |
| [Docker Deployment](docker-deployment.md) | Production deployment |
| [Skills & Commands](skills-and-commands.md) | Extending Claude Code |
| [Environment Variables](environment-variables.md) | Configuration |
| [Architecture](architecture.md) | System design |

## Getting Started

```bash
docker run -d -p 3100:3100 \
  -e CLAUDE_CODE_GATEWAY_API_KEY=your-key \
  -e CLAUDE_CODE_OAUTH_TOKEN=your-token \
  ghcr.io/pattern-zones-co/koine:latest

curl http://localhost:3100/health
```

See [Docker Deployment](docker-deployment.md) for docker-compose setup, version pinning, and production configuration.

### From Source

Alternatively, clone and build from source:

```bash
git clone https://github.com/pattern-zones-co/koine.git
cd koine

cp .env.example .env
# Edit .env with your keys

docker compose up -d
```

### Usage

#### curl

```bash
curl -X POST http://localhost:3100/generate-text \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CLAUDE_CODE_GATEWAY_API_KEY" \
  -d '{"prompt": "Hello!"}'
```

#### TypeScript SDK

```bash
npm install @patternzones/koine-sdk
```

```typescript
import { generateText } from '@patternzones/koine-sdk';

const result = await generateText(
  { baseUrl: 'http://localhost:3100', authKey: 'your-api-key' },
  { prompt: 'Hello!' }
);

console.log(result.text);
```

See the [SDK Guide](sdk-guide.md) for streaming and structured output.
