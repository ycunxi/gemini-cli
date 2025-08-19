# Gemini CLI + Anthropic/Aider Integration Summary

## Overview
We attempted to integrate Anthropic models and Aider into the Gemini CLI to:
1. Support multiple LLM providers (not just Gemini)
2. Integrate Aider for token-efficient code editing
3. Enable tool execution across different model providers

## Key Discoveries

### 1. Architecture Understanding

#### Gemini CLI Structure
- **Monorepo**: Uses npm workspaces with packages:
  - `packages/cli` - Frontend/UI layer
  - `packages/core` - Business logic and tools
  - `packages/test-utils` - Testing utilities
  - `packages/vscode-ide-companion` - VS Code extension

#### Critical Files
- **Entry Point**: `packages/cli/index.ts` → `gemini.tsx`
- **Model Integration**: `packages/core/src/core/contentGenerator.ts`
- **Tool System**: `packages/core/src/tools/` directory
- **Client Logic**: `packages/core/src/core/client.ts`
- **Non-Interactive CLI**: `packages/cli/src/nonInteractiveCli.ts`

### 2. Model Integration Points

#### ContentGenerator Interface
The key abstraction for model providers:
```typescript
interface ContentGenerator {
  generateContent(request: GenerateContentParameters): Promise<GenerateContentResponse>
  generateContentStream(request: GenerateContentParameters): AsyncGenerator<GenerateContentResponse>
  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>
  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>
}
```

#### Authentication Types
- `USE_GEMINI` - Gemini API key
- `USE_VERTEX_AI` - Google Cloud credentials
- `LOGIN_WITH_GOOGLE` - OAuth
- `CLOUD_SHELL` - Google Cloud Shell
- **Custom providers** bypass these with environment variables

### 3. Tool Calling System

#### How Tools Work in Gemini CLI
1. Tools are registered in `Config.createToolRegistry()`
2. Model generates tool calls in response
3. Tool calls are extracted from model response
4. Tools are executed via `executeToolCall()`
5. Results are sent back to model

#### Tool Call Formats

**Gemini Format** (expected by CLI):
```javascript
{
  functionCall: {
    name: 'run_shell_command',
    args: { command: 'pwd' }
  }
}
```

**Anthropic Format** (what Claude outputs):
```xml
<run_shell_command>
<command>pwd</command>
</run_shell_command>
```

Or sometimes:
```xml
<function_calls>
<invoke name="run_shell_command">
<parameter name="command">pwd</parameter>
</invoke>
</function_calls>
```

### 4. Problems Encountered

#### Issue 1: Tool Call Format Mismatch
- Anthropic uses XML-like tags for tool calls
- Gemini expects specific JSON structure in `part.functionCall`
- Parser needed to convert between formats

#### Issue 2: Response Structure Differences
- Non-interactive mode looks for `resp.functionCalls` at response root
- Our provider only put function calls in `parts` array
- Fixed by adding function calls as top-level property

#### Issue 3: Model Hallucinations
- Anthropic models often hallucinate `<function_result>` blocks
- These fake results prevent actual tool execution
- Must be stripped before parsing

#### Issue 4: Interactive vs Non-Interactive Modes
- Tools work differently in interactive vs non-interactive modes
- Interactive mode has different tool execution flow
- Non-interactive mode requires specific response structure

#### Issue 5: JSON Generation
- Anthropic doesn't natively support JSON schema like Gemini
- Required prompt engineering to get JSON responses
- Used for internal functions like `checkNextSpeaker`

### 5. What We Built

#### Files Created/Modified

**New Provider System**:
- `packages/core/src/providers/base.ts` - Base interfaces
- `packages/core/src/providers/anthropic.ts` - Anthropic implementation
- `packages/core/src/providers/anthropic-tool-parser.ts` - XML to JSON parser
- `packages/core/src/providers/adapter.ts` - Adapter pattern
- `packages/core/src/providers/factory.ts` - Provider detection

**Aider Integration**:
- `packages/core/src/tools/aider-integration.ts` - Aider tools
- `packages/core/src/tools/aider-service.ts` - Persistent service concept
- `AIDER_INTEGRATION_STRATEGY.md` - Strategy document
- `AIDER_SERVICE_COMPARISON.md` - Comparison document

**Modified Core Files**:
- `packages/core/src/core/contentGenerator.ts` - Added provider detection
- `packages/core/src/config/config.ts` - Registered Aider tools

### 6. Working Features

✅ **Text Generation**: Anthropic models can generate text responses
✅ **Model Selection**: `-m` flag correctly routes to different providers
✅ **Environment Detection**: Auto-detects Anthropic credentials
✅ **JSON Responses**: Anthropic can generate JSON with prompt engineering
✅ **Basic Integration**: Models are properly instantiated and called

### 7. Non-Working Features

❌ **Tool Execution**: Tools aren't being executed in non-interactive mode
❌ **Tool Parsing**: Parser finds tool calls but doesn't convert them correctly
❌ **Aider Integration**: Aider tools defined but not properly executing
❌ **Original Gemini**: May have broken original Gemini functionality

### 8. Key Learnings

#### Technical Insights

1. **Tool Call Detection Problem**: 
   - The parser is being called AFTER the response is already processed
   - By the time we parse, the response structure is already set
   - Need to intercept earlier in the pipeline

2. **Response Pipeline**:
   ```
   API Response → Provider → ContentGenerator → 
   GenerateContentResponse → Client → Tool Execution
   ```
   
3. **Critical Integration Point**:
   - Must convert tool calls BEFORE creating GenerateContentResponse
   - Need to set `functionCalls` property at response level
   - Parts array alone is insufficient

4. **Aider Token Efficiency**:
   - Aider uses unified diffs (much smaller than full file replacements)
   - Has repository map for context
   - Caches conversation history
   - Spawning per command loses these benefits

### 9. Recommended Approach for Clean Integration

#### Step 1: Minimal Provider Integration
1. Create simple provider interface
2. Implement Anthropic provider with proper tool call conversion
3. Ensure tool calls are in correct format BEFORE response creation
4. Test thoroughly before adding complexity

#### Step 2: Fix Tool Execution
1. Ensure `functionCalls` property is set at response level
2. Handle both interactive and non-interactive modes
3. Test with simple tools first (ls, read_file)

#### Step 3: Aider Integration
1. Start with simple subprocess spawning
2. Test token usage comparison
3. Only then consider persistent service

#### Step 4: Preserve Original Functionality
1. Use feature flags or environment variables
2. Only activate custom providers when explicitly configured
3. Ensure Gemini model still works as default

### 10. Environment Variables Used

```bash
# Anthropic Configuration
export ANTHROPIC_AUTH_TOKEN="your-token"
export ANTHROPIC_BASE_URL="https://llm-proxy.perflab.nvidia.com/anthropic"
export ANTHROPIC_MODEL="claude-sonnet-4-20250514"

# Gemini Configuration  
export GEMINI_API_KEY="your-gemini-key"
```

### 11. Testing Commands

```bash
# Build the project
npm run build && npm run bundle

# Test with Gemini
node bundle/gemini.js -y -p "List files"

# Test with Anthropic
node bundle/gemini.js -m claude-sonnet-4-20250514 -y -p "List files"

# Interactive mode
node bundle/gemini.js -m claude-sonnet-4-20250514

# Direct Aider usage
aider --model anthropic/claude-sonnet-4-20250514 \
      --api-base https://llm-proxy.perflab.nvidia.com/anthropic \
      --message "Your instruction" file.py
```

### 12. Critical Bug Found

The main issue is that Anthropic's response text contains tool calls as XML strings, but:
1. These aren't being parsed into `functionCall` objects
2. Even when parsed, they're not in the right place in the response structure
3. The non-interactive CLI expects `resp.functionCalls` which we're not providing

## Recommendation

1. **Revert to clean state** to preserve working Gemini functionality
2. **Create a minimal branch** with just the provider abstraction
3. **Focus on tool call conversion** as the primary challenge
4. **Test incrementally** with each feature addition
5. **Use feature flags** to enable/disable custom providers

## Files to Preserve (contain valuable logic)

- `anthropic-tool-parser.ts` - Has the regex patterns for parsing
- `AIDER_INTEGRATION_STRATEGY.md` - Documents the token efficiency benefits
- `demo-aider-service.js` - Shows performance comparison
- This summary document

## Next Steps

1. Git reset to clean state
2. Create new branch for integration
3. Implement minimal provider interface
4. Add Anthropic with proper tool conversion
5. Test thoroughly before adding complexity
6. Consider Aider as separate feature
