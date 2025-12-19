# Claude Assets

Custom skills and slash commands that are copied into the Docker container at build time.

## Directory Structure

```
claude-assets/
├── skills/          # Custom Claude skills (SKILL.md files)
├── commands/        # Custom slash commands (.md files)
└── README.md
```

## Adding Skills

Create a subdirectory under `skills/` with a `SKILL.md` file:

```
claude-assets/skills/my-tool/SKILL.md
```

## Adding Commands

Create markdown files under `commands/`:

```
claude-assets/commands/my-command.md
```

## Usage

These assets are copied to `/home/bun/.claude` in the container during the Docker build, making them available to all Claude Code sessions running through the gateway.
