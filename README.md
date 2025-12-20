# Koine

An HTTP gateway that exposes [Claude Code CLI](https://github.com/anthropics/claude-code) as a REST API, plus a TypeScript SDK for easy integration.

> **Koine** (pronounced /kɔɪˈneɪ/, "koy-NAY") — named after the common Greek dialect that connected the ancient Mediterranean. Koine translates protocols and manages requests so your apps can use Claude Code CLI just like you.

## Why Koine?

Koine turns Claude Code into a programmable inference layer. Use it to:

- **Orchestrate AI-powered services** — connect Koine to your services via VPN or Docker networks
- **Build agentic workflows** — chain Claude Code calls with structured output and session management
- **Extend capabilities** — add custom skills, slash commands, and domain-specific context

### Power and Responsibility

> [!CAUTION]
> **This is both powerful and dangerous.**
>
> Claude Code has full access to the tools you give it — file system, shell, network. When exposed through Koine, your applications gain that same power.
>
> **Docker deployment is critical.** Running in a container restricts Claude to the container user's permissions and filesystem, providing essential isolation.

### Terms of Service

> [!WARNING]
> **Review Anthropic's Terms before deploying.**
>
> Koine supports two authentication methods with **different terms**:
>
> - **OAuth tokens** (Claude Pro/Max) — subscription plans may restrict commercial use, automation, and public exposure. See [Anthropic's Terms of Service](https://www.anthropic.com/legal/consumer-terms).
> - **API keys** (Anthropic API) — pay-per-token with different allowable use cases
>
> **You are responsible for compliance.**

### Deployment Best Practices

- **Do not expose your endpoints to public use** if using OAuth — this likely violates Anthropic's Terms
- **Use Docker** — containers provide critical security isolation
- **Run on internal networks** — VPN or Docker networks are ideal for service-to-service communication
- **Authenticate all requests** — the gateway requires an API key separate from Claude authentication

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/README.md) | Installation and setup |
| [API Reference](docs/api-reference.md) | REST endpoints |
| [SDK Guide](docs/sdk-guide.md) | TypeScript SDK |
| [Docker Deployment](docs/docker-deployment.md) | Production deployment |
| [Skills & Commands](docs/skills-and-commands.md) | Extending Claude Code |
| [Environment Variables](docs/environment-variables.md) | Configuration |
| [Architecture](docs/architecture.md) | System design |

## Packages

| Package | Description |
|---------|-------------|
| [koine](packages/gateway) | HTTP gateway (Docker only, not on npm) |
| [@patternzones/koine-sdk](https://www.npmjs.com/package/@patternzones/koine-sdk) | TypeScript SDK |

## License

See [LICENSE](LICENSE) for details (AGPL-3.0).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines and roadmap.
