# Skills and Commands

Extend Claude Code with custom capabilities via the `claude-assets/` directory.

## Use Cases

- **Domain-specific knowledge** — teach Claude about your APIs, databases, or internal tools
- **Guardrails** — constrain Claude's behavior for specific tasks
- **Workflows** — define multi-step operations as slash commands

## Loading Assets

Skills and commands in `claude-assets/` are copied into the Docker image at build time:

```
claude-assets/
├── skills/
│   └── your-skill/
│       └── SKILL.md
└── commands/
    └── your-command.md
```

Rebuild the image after adding or modifying assets:

```bash
docker compose build koine
docker compose up -d koine
```

## Reference

See Anthropic's documentation for skill and command file formats:

- [Skills](https://docs.anthropic.com/en/docs/claude-code/skills)
- [Slash Commands](https://docs.anthropic.com/en/docs/claude-code/slash-commands)
