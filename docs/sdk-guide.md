# SDK Guide

## Installation

```bash
npm install @patternzones/koine-sdk
```

## Configuration

```typescript
import { KoineConfig } from '@patternzones/koine-sdk';

const config: KoineConfig = {
  baseUrl: 'http://localhost:3100',
  authKey: 'your-api-key',
  timeout: 300000,  // optional, default 5 min
  model: 'sonnet',  // optional default model
};
```

## Text Generation

```typescript
import { generateText } from '@patternzones/koine-sdk';

const result = await generateText(config, {
  prompt: 'Explain quantum computing',
  system: 'You are a helpful teacher',  // optional
  sessionId: 'continue-conversation',   // optional
});

console.log(result.text);
console.log(result.usage);
console.log(result.sessionId);
```

## Streaming

```typescript
import { streamText } from '@patternzones/koine-sdk';

const result = await streamText(config, {
  prompt: 'Write a short story',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

const fullText = await result.text;
const usage = await result.usage;
```

## Structured Output

```typescript
import { generateObject } from '@patternzones/koine-sdk';
import { z } from 'zod';

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

const result = await generateObject(config, {
  prompt: 'Extract: John is 30, email john@example.com',
  schema: PersonSchema,
});

console.log(result.object);  // typed as { name: string, age: number, email: string }
```

## Error Handling

```typescript
import { KoineError } from '@patternzones/koine-sdk';

try {
  const result = await generateText(config, { prompt: 'Hello' });
} catch (error) {
  if (error instanceof KoineError) {
    console.error(error.status, error.code, error.message);
  }
}
```

## Multi-turn Conversations

```typescript
const result1 = await generateText(config, { prompt: 'My name is Alice' });
const result2 = await generateText(config, {
  prompt: 'What is my name?',
  sessionId: result1.sessionId,
});
```

## Runnable Examples

See [docs/examples/typescript/](examples/typescript/) for complete, runnable examples:

- `hello.ts` — Basic text generation
- `extract-recipe.ts` — Structured output with Zod schemas
- `stream.ts` — Real-time streaming
- `conversation.ts` — Multi-turn session persistence
