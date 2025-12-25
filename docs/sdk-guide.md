# SDK Guide

## Installation

### TypeScript

```bash
npm install @patternzones/koine-sdk
```

### Python

```bash
pip install koine-sdk
```

## Configuration

### TypeScript

```typescript
import { KoineConfig } from '@patternzones/koine-sdk';

const config: KoineConfig = {
  baseUrl: 'http://localhost:3100',
  authKey: 'your-api-key',
  timeout: 300000,  // optional, default 5 min
  model: 'sonnet',  // optional default model
};
```

### Python

```python
from koine_sdk import KoineConfig

config = KoineConfig(
    base_url="http://localhost:3100",
    auth_key="your-api-key",
    timeout=300.0,  # optional, default 5 min
    model="sonnet",  # optional default model
)
```

## Text Generation

### TypeScript

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

### Python

```python
from koine_sdk import generate_text

result = await generate_text(
    config,
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

### Python

```python
from koine_sdk import stream_text

async with stream_text(config, prompt="Write a short story") as result:
    async for chunk in result.text_stream:
        print(chunk, end="", flush=True)

    full_text = await result.text()
    usage = await result.usage()
```

## Structured Output

### TypeScript

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

### Python

```python
from pydantic import BaseModel
from koine_sdk import generate_object

class Person(BaseModel):
    name: str
    age: int
    email: str

result = await generate_object(
    config,
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
  const result = await generateText(config, { prompt: 'Hello' });
} catch (error) {
  if (error instanceof KoineError) {
    console.error(error.status, error.code, error.message);
  }
}
```

### Python

```python
from koine_sdk import KoineError, generate_text

try:
    result = await generate_text(config, prompt="Hello")
except KoineError as e:
    print(f"Error [{e.code}]: {e}")
    if e.raw_text:
        print(f"Raw response: {e.raw_text}")
```

## Multi-turn Conversations

### TypeScript

```typescript
const result1 = await generateText(config, { prompt: 'My name is Alice' });
const result2 = await generateText(config, {
  prompt: 'What is my name?',
  sessionId: result1.sessionId,
});
```

### Python

```python
result1 = await generate_text(config, prompt="My name is Alice")
result2 = await generate_text(
    config,
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
