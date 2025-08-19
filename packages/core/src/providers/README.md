# Multi-Model Provider System for Gemini CLI

## Overview

This provider system enables the Gemini CLI to work with multiple LLM providers beyond Google's Gemini models, including custom endpoints like NVIDIA's proxy for Anthropic models.

## Architecture

The system consists of:

1. **Base Interface (`base.ts`)**: Defines the `IModelProvider` interface that all providers implement
2. **Provider Implementations**: Specific implementations for different model providers (e.g., `anthropic.ts`)
3. **Adapter (`adapter.ts`)**: Converts provider responses to the `ContentGenerator` interface expected by Gemini CLI
4. **Factory (`factory.ts`)**: Auto-detects and instantiates the appropriate provider based on environment variables

## Supported Providers

### 1. Custom Anthropic (NVIDIA Proxy)

For NVIDIA's proxy to Anthropic models:

```bash
# Set up environment variables
export ANTHROPIC_AUTH_TOKEN="your-auth-token"
export ANTHROPIC_BASE_URL="https://llm-proxy.perflab.nvidia.com/anthropic"
export ANTHROPIC_MODEL="claude-sonnet-4-20250514"

# Run the CLI
node bundle/gemini.js -p "Your prompt here"
```

The system will automatically detect these environment variables and use the Anthropic provider.

### 2. Google Gemini (Default)

If no custom provider environment variables are detected, the CLI falls back to the standard Gemini models using:
- OAuth login
- Gemini API key
- Vertex AI credentials
- Cloud Shell authentication

## Adding New Providers

To add support for a new model provider:

1. **Create a new provider implementation**:

```typescript
// packages/core/src/providers/openai.ts
import { IModelProvider } from './base.js';

export class OpenAIProvider implements IModelProvider {
  async generateContent(prompt: string | Content[], config?: any) {
    // Implement OpenAI API call
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      // ... API implementation
    });
    
    return {
      text: response.choices[0].message.content,
      // ... other fields
    };
  }
  
  // Implement other methods...
}
```

2. **Update the factory**:

```typescript
// packages/core/src/providers/factory.ts
export function detectProvider(): ContentGenerator | null {
  // Check for OpenAI
  if (process.env['OPENAI_API_KEY']) {
    console.log('🤖 Detected OpenAI configuration');
    return new ModelProviderAdapter(new OpenAIProvider());
  }
  
  // ... existing provider checks
}
```

3. **Build and test**:

```bash
npm run build
npm run bundle
OPENAI_API_KEY="your-key" node bundle/gemini.js -p "Test prompt"
```

## Environment Variables

The system supports automatic provider detection via environment variables:

| Provider | Required Variables | Optional Variables |
|----------|-------------------|-------------------|
| Anthropic (NVIDIA) | `ANTHROPIC_AUTH_TOKEN`<br>`ANTHROPIC_BASE_URL` | `ANTHROPIC_MODEL` |
| OpenAI (future) | `OPENAI_API_KEY` | `OPENAI_MODEL`<br>`OPENAI_BASE_URL` |
| Cohere (future) | `COHERE_API_KEY` | `COHERE_MODEL` |

## Type Compatibility

The provider system works within the existing `@google/genai` type system by:
- Implementing the `ContentGenerator` interface
- Converting provider-specific responses to `GenerateContentResponse` format
- Handling streaming responses appropriately
- Providing fallback implementations for optional features (token counting, embeddings)

## Limitations

1. **JSON Generation**: Some CLI features that require specific JSON schema generation may not work with all providers
2. **Embeddings**: Not all providers support embeddings (e.g., Anthropic)
3. **Token Counting**: Accurate token counting requires provider-specific implementations
4. **Tool Calling**: Advanced features like function calling may require additional adaptation

## Troubleshooting

### Provider not detected
- Ensure environment variables are properly exported
- Check that variables are accessible: `echo $VARIABLE_NAME`
- Verify the provider detection order in `factory.ts`

### Build errors
- Run `npm install` to ensure all dependencies are installed
- Check TypeScript errors with `npm run build`
- Ensure provider implementations match the `IModelProvider` interface

### Runtime errors
- Check API endpoint URLs and authentication tokens
- Verify network connectivity to the model provider
- Review error logs for specific API response issues

## Development

To develop and test the provider system:

```bash
# Install dependencies
npm install

# Make changes to provider files
# ... edit files in packages/core/src/providers/

# Build the project
npm run build

# Bundle for testing
npm run bundle

# Test with your provider
export YOUR_PROVIDER_VARS="..."
node bundle/gemini.js -p "Test prompt"
```

## Future Enhancements

- [ ] Add OpenAI provider support
- [ ] Add Cohere provider support  
- [ ] Implement provider-specific CLI arguments (`--provider openai`)
- [ ] Add retry logic and better error handling
- [ ] Support for provider-specific features (e.g., OpenAI functions, Anthropic artifacts)
- [ ] Unified configuration file support
- [ ] Provider switching during conversation
- [ ] Better JSON schema generation compatibility
