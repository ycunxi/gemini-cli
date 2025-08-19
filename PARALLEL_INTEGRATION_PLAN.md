# Parallel Integration Plan: Gemini + Anthropic

## Core Principle
**Two independent paths that never interfere with each other**

## Architecture Design

```
User Input
    ↓
Model Selection (-m flag or default)
    ↓
    ├─→ [Gemini Path] (default or gemini-*)
    │   ├─→ Original ContentGenerator
    │   ├─→ Original Tool System
    │   └─→ Original Response Handling
    │
    └─→ [Anthropic Path] (claude-* or anthropic-*)
        ├─→ Custom ContentGenerator
        ├─→ Tool Call Converter
        └─→ Adapted Response Handling
```

## Implementation Strategy

### 1. Model Router (Entry Point)
```typescript
// In createContentGenerator()
export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const modelName = gcConfig?.getModel() || config.model;
  
  // ONLY use Anthropic if explicitly requested
  if (modelName && (modelName.includes('claude') || modelName.includes('anthropic'))) {
    // Check if Anthropic is configured
    if (process.env['ANTHROPIC_AUTH_TOKEN']) {
      return createAnthropicContentGenerator(config, gcConfig);
    } else {
      throw new Error('Anthropic model requested but ANTHROPIC_AUTH_TOKEN not set');
    }
  }
  
  // DEFAULT: Original Gemini path - unchanged
  return createOriginalGeminiContentGenerator(config, gcConfig, sessionId);
}
```

### 2. Keep Original Gemini Path Intact
- Don't modify ANY existing Gemini code
- Extract current logic into `createOriginalGeminiContentGenerator()`
- This ensures Gemini always works as before

### 3. Anthropic Path Requirements

#### For Interactive Mode (Priority)
1. **Tool Call Detection**: Parse XML format from Anthropic
2. **Tool Call Conversion**: Convert to Gemini's expected format
3. **Response Structure**: Match what interactive mode expects
4. **Confirmation Dialogs**: Work with existing confirmation system

#### For Non-Interactive Mode (Later)
1. Fix the `functionCalls` property issue
2. Ensure proper response structure
3. Handle YOLO mode correctly

### 4. Environment Variable Strategy

```bash
# Gemini Configuration (existing)
export GEMINI_API_KEY="..."

# Anthropic Configuration (new, optional)
export ANTHROPIC_AUTH_TOKEN="..."
export ANTHROPIC_BASE_URL="..."
export ANTHROPIC_MODEL="..."
```

**Rules**:
- If no model specified → Use Gemini
- If Gemini model specified → Use Gemini path
- If Anthropic model specified + env vars set → Use Anthropic path
- If Anthropic model specified + no env vars → Error with clear message

### 5. File Organization

```
packages/core/src/
├── core/
│   └── contentGenerator.ts       # Router logic only
├── gemini/                        # NEW: Gemini-specific (move existing)
│   └── geminiContentGenerator.ts # Original code
└── providers/                     # Anthropic and other providers
    ├── anthropic/
    │   ├── anthropicProvider.ts
    │   ├── toolParser.ts
    │   └── responseAdapter.ts
    └── base.ts                    # Common interfaces
```

### 6. Testing Strategy

#### Phase 1: Preserve Gemini
1. Ensure all existing Gemini tests pass
2. Test with/without model flag
3. Verify no regression

#### Phase 2: Add Anthropic
1. Test model selection logic
2. Test tool call parsing
3. Test interactive mode first
4. Test non-interactive mode later

### 7. Feature Flags (Optional but Recommended)

```typescript
interface FeatureFlags {
  enableAnthropicProvider: boolean;
  debugProviderSelection: boolean;
  logToolCallConversion: boolean;
}

// Can be controlled via env vars
const features = {
  enableAnthropicProvider: process.env['ENABLE_ANTHROPIC'] === 'true',
  debugProviderSelection: process.env['DEBUG_PROVIDER'] === 'true',
  logToolCallConversion: process.env['LOG_TOOL_CONVERSION'] === 'true',
};
```

## Implementation Steps

### Step 1: Refactor Without Changing Behavior
1. Extract current contentGenerator logic to separate function
2. Add router that always calls the original function
3. Test that everything still works

### Step 2: Add Anthropic Path
1. Implement Anthropic provider
2. Add model detection logic
3. Route to Anthropic ONLY when explicitly requested
4. Test both paths independently

### Step 3: Fix Tool Calling for Anthropic
1. Focus on interactive mode first
2. Parse tool calls from XML
3. Convert to expected format
4. Test with simple tools (echo, pwd)

### Step 4: Polish
1. Add better error messages
2. Add debug logging (optional)
3. Document usage

## Success Criteria

✅ **Gemini Path**:
- Works exactly as before
- No changes to existing behavior
- All original tests pass
- Default when no model specified

✅ **Anthropic Path**:
- Only activates with explicit model selection
- Tools work in interactive mode
- Clear error messages if misconfigured
- No interference with Gemini path

## Key Files to Modify (Minimal)

1. `packages/core/src/core/contentGenerator.ts` - Add router logic
2. `packages/core/src/providers/anthropic.ts` - Anthropic implementation
3. No other core files should be touched initially

## What NOT to Do

❌ Don't modify existing tool implementations
❌ Don't change the ContentGenerator interface
❌ Don't alter the response pipeline for Gemini
❌ Don't make Anthropic the default
❌ Don't add complex abstractions initially

## Benefits of This Approach

1. **Zero Risk**: Gemini path unchanged
2. **Clean Separation**: No code mixing
3. **Easy Rollback**: Can disable Anthropic easily
4. **Incremental**: Can add features gradually
5. **Testable**: Each path tested independently
