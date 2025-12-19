# @pattern-zones-co/claude-code-gateway-sdk

TypeScript SDK for Claude Code Gateway with Zod-based type safety.

## Installation

```bash
npm install @pattern-zones-co/claude-code-gateway-sdk zod
```

Note: `zod` is a peer dependency - you need to install it yourself.

## Quick Start

```typescript
import { z } from 'zod';
import { ClaudeCodeClient } from '@pattern-zones-co/claude-code-gateway-sdk';

const client = new ClaudeCodeClient({
  baseUrl: 'http://localhost:3100',
  authKey: 'your-api-key',
  model: 'sonnet' // optional default model
});

// Generate text
const { text } = await client.generateText({
  prompt: 'Explain TypeScript in one sentence',
  system: 'Be concise'
});

// Generate typed object with Zod schema
const UserSchema = z.object({
  name: z.string(),
  email: z.string().email()
});

const { object } = await client.generateObject({
  prompt: 'Extract: John at john@example.com',
  schema: UserSchema
});
// object is typed as { name: string; email: string }

// Stream text
const stream = await client.streamText({
  prompt: 'Write a poem'
});

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

## API

### `ClaudeCodeClient`

#### Constructor

```typescript
new ClaudeCodeClient({
  baseUrl: string,      // Gateway URL
  authKey: string,      // API key
  timeout?: number,     // Request timeout in ms (default: 120000)
  model?: string        // Default model (e.g., 'sonnet', 'haiku')
})
```

#### Methods

##### `generateText(options)`

Generate plain text response.

```typescript
const result = await client.generateText({
  prompt: string,
  system?: string,
  sessionId?: string,
  model?: string
});
// Returns: { text, usage, sessionId }
```

##### `generateObject<T>(options)`

Generate a typed object matching a Zod schema.

```typescript
const result = await client.generateObject({
  prompt: string,
  schema: z.ZodSchema<T>,
  system?: string,
  sessionId?: string,
  model?: string
});
// Returns: { object: T, rawText, usage, sessionId }
```

##### `streamText(options)`

Stream text response.

```typescript
const result = await client.streamText({
  prompt: string,
  system?: string,
  sessionId?: string,
  model?: string
});
// Returns: { textStream, sessionId, usage, text }
```

### `ClaudeCodeError`

Custom error class with error code.

```typescript
import { ClaudeCodeError } from '@pattern-zones-co/claude-code-gateway-sdk';

try {
  await client.generateText({ prompt: 'hello' });
} catch (error) {
  if (error instanceof ClaudeCodeError) {
    console.log(error.code);    // e.g., 'TIMEOUT_ERROR'
    console.log(error.message); // Human-readable message
    console.log(error.rawText); // Raw response if available
  }
}
```

## License

See repository root.
