# SDK Guide

## Installation

### TypeScript

```bash
bun add @patternzones/koine-sdk
# or: npm install @patternzones/koine-sdk
```

### Python

```bash
uv pip install koine-sdk
# or: pip install koine-sdk
```

## Configuration

### TypeScript

```typescript
import { createKoine } from '@patternzones/koine-sdk';

const koine = createKoine({
  baseUrl: 'http://localhost:3100',
  authKey: 'your-api-key',
  timeout: 300000,  // optional, default 5 min
  model: 'sonnet',  // optional default model
});
```

### Python

```python
from koine_sdk import create_koine

koine = create_koine(
    base_url="http://localhost:3100",
    auth_key="your-api-key",
    timeout=300.0,  # optional, default 5 min
    model="sonnet",  # optional default model
)
```

## Text Generation

### TypeScript

```typescript
const result = await koine.generateText({
  prompt: 'Explain quantum computing',
  system: 'You are a helpful teacher',  // optional
  sessionId: 'continue-conversation',   // optional
});

console.log(result.text);
console.log(result.usage);
console.log(result.sessionId);
```

### Python

```python
result = await koine.generate_text(
    prompt="Explain quantum computing",
    system="You are a helpful teacher",  # optional
    session_id="continue-conversation",  # optional
)

print(result.text)
print(result.usage)
print(result.session_id)
```

## Streaming

### TypeScript

```typescript
const result = await koine.streamText({
  prompt: 'Write a short story',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

const fullText = await result.text;
const usage = await result.usage;
```

### Python

```python
async with koine.stream_text(prompt="Write a short story") as result:
    async for chunk in result.text_stream:
        print(chunk, end="", flush=True)

    full_text = await result.text()
    usage = await result.usage()
```

## Structured Output

### TypeScript

```typescript
import { z } from 'zod';

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

const result = await koine.generateObject({
  prompt: 'Extract: John is 30, email john@example.com',
  schema: PersonSchema,
});

console.log(result.object);  // typed as { name: string, age: number, email: string }
```

### Python

```python
from pydantic import BaseModel

class Person(BaseModel):
    name: str
    age: int
    email: str

result = await koine.generate_object(
    prompt="Extract: John is 30, email john@example.com",
    schema=Person,
)

print(result.object)  # typed as Person
print(result.object.name, result.object.age)
```

## Error Handling

### TypeScript

```typescript
import { KoineError } from '@patternzones/koine-sdk';

try {
  const result = await koine.generateText({ prompt: 'Hello' });
} catch (error) {
  if (error instanceof KoineError) {
    console.error(error.status, error.code, error.message);
  }
}
```

### Python

```python
from koine_sdk import KoineError

try:
    result = await koine.generate_text(prompt="Hello")
except KoineError as e:
    print(f"Error [{e.code}]: {e}")
    if e.raw_text:
        print(f"Raw response: {e.raw_text}")
```

### Handling Concurrency Limits

The gateway limits concurrent requests to prevent resource exhaustion. When limits are exceeded, it returns a `429` status with `CONCURRENCY_LIMIT_ERROR`. The SDKs do not automatically retry—you should implement retry logic:

**TypeScript:**
```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof KoineError && error.code === 'CONCURRENCY_LIMIT_ERROR') {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

**Python:**
```python
async def with_retry(fn, max_retries=3):
    for i in range(max_retries):
        try:
            return await fn()
        except KoineError as e:
            if e.code == "CONCURRENCY_LIMIT_ERROR":
                await asyncio.sleep(1 * (i + 1))
                continue
            raise
    raise Exception("Max retries exceeded")
```

## Multi-turn Conversations

### TypeScript

```typescript
const result1 = await koine.generateText({ prompt: 'My name is Alice' });
const result2 = await koine.generateText({
  prompt: 'What is my name?',
  sessionId: result1.sessionId,
});
```

### Python

```python
result1 = await koine.generate_text(prompt="My name is Alice")
result2 = await koine.generate_text(
    prompt="What is my name?",
    session_id=result1.session_id,
)
```

## Runnable Examples

### TypeScript

See [`packages/sdks/typescript/examples/`](../packages/sdks/typescript/examples/) for complete, runnable examples:

- `hello.ts` — Basic text generation
- `extract-recipe.ts` — Structured output with Zod schemas
- `stream.ts` — Real-time streaming
- `conversation.ts` — Multi-turn session persistence

### Python

See [`packages/sdks/python/examples/`](../packages/sdks/python/examples/) for complete, runnable examples:

- `hello.py` — Basic text generation
- `extract_recipe.py` — Structured output with Pydantic schemas
- `stream.py` — Real-time streaming
- `conversation.py` — Multi-turn session persistence
