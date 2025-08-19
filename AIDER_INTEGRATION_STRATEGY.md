# Aider Integration Strategy for Gemini CLI

## Problem Statement

Gemini CLI currently uses significantly more tokens than Aider because:
- **Full file contents** are sent for edits (vs Aider's unified diffs)
- **Entire workspace structure** is included in context
- **Complete conversation history** is maintained
- **Verbose tool responses** include full file contents

## Aider's Token Efficiency Techniques

### 1. Repository Map
```python
# Instead of sending full file tree, Aider sends:
src/
├── main.py (120 lines)
├── utils/
│   ├── parser.py (85 lines) 
│   └── validator.py (200 lines)
└── tests/
    └── test_main.py (150 lines)
```

### 2. Unified Diff Format
```diff
# Aider sends only changes:
--- a/src/main.py
+++ b/src/main.py
@@ -45,3 +45,5 @@ def process_data(input_file):
     data = load_file(input_file)
-    return process(data)
+    if validate(data):
+        return process(data)
+    raise ValueError("Invalid data")
```

### 3. Search/Replace Blocks
```python
# Aider's SEARCH/REPLACE format
<<<<<<< SEARCH
def calculate_total(items):
    return sum(items)
=======
def calculate_total(items):
    """Calculate the total of all items."""
    if not items:
        return 0
    return sum(items)
>>>>>>> REPLACE
```

## Integration Approaches

### Option 1: Aider as a Tool Provider (Implemented Above)
**Pros:**
- Quick to implement
- Maintains Gemini CLI's existing architecture
- Can be toggled on/off

**Cons:**
- Requires Aider installation
- Two separate systems running

### Option 2: Adopt Aider's Core Techniques Natively

#### A. Implement Unified Diff Editing
```typescript
// packages/core/src/tools/diff-edit.ts
export class DiffEditTool extends BaseDeclarativeTool {
  async execute(params: { file: string, diff: string }) {
    // Apply unified diff to file
    const patch = parsePatch(params.diff);
    const result = applyPatch(fileContent, patch);
    fs.writeFileSync(params.file, result);
  }
}
```

#### B. Create Repository Map Generator
```typescript
// packages/core/src/utils/repoMap.ts
export class RepoMapGenerator {
  async generateMap(rootDir: string): Promise<string> {
    // Generate compact tree with line counts
    // Exclude common ignored patterns
    // Include function/class signatures
  }
}
```

#### C. Implement Smart Context Selection
```typescript
// packages/core/src/core/contextManager.ts
export class SmartContextManager {
  async selectRelevantFiles(query: string): Promise<string[]> {
    // Use embeddings to find relevant files
    // Limit to most relevant N files
    // Include dependency graph
  }
}
```

### Option 3: Hybrid Approach (Recommended)

Combine both approaches for maximum flexibility:

1. **Add Aider tools** for complex multi-file edits
2. **Implement diff-based editing** for single file changes
3. **Add context optimization** to reduce token usage
4. **Make it configurable** via settings

## Implementation Plan

### Phase 1: Quick Win (1-2 days)
- [x] Create Aider tool integration
- [ ] Add to tool registry
- [ ] Test with both Gemini and Anthropic providers

### Phase 2: Native Diff Support (3-5 days)
- [ ] Implement unified diff parser
- [ ] Create diff-based edit tool
- [ ] Add diff preview in confirmation dialog
- [ ] Update edit corrector for diff format

### Phase 3: Context Optimization (1 week)
- [ ] Implement repository map generator
- [ ] Add smart file selection based on query
- [ ] Create token usage tracking
- [ ] Add context pruning strategies

### Phase 4: Advanced Integration (2 weeks)
- [ ] Implement Aider's chat format natively
- [ ] Add support for multi-file atomic edits
- [ ] Create intelligent refactoring tools
- [ ] Add git integration for better diffs

## Configuration

Add to `~/.gemini/settings.json`:
```json
{
  "editing": {
    "mode": "hybrid",  // "standard", "aider", "hybrid"
    "preferDiffs": true,
    "maxContextFiles": 10,
    "tokenBudget": 100000
  },
  "aider": {
    "path": "/usr/local/bin/aider",
    "model": "auto",  // Uses same model as Gemini CLI
    "autoCommit": false
  }
}
```

## Token Usage Comparison

### Current Gemini CLI Edit
```
Tokens used: ~5,000-10,000 per edit
- Full file content: 2,000 tokens
- Workspace structure: 1,000 tokens  
- Conversation history: 2,000 tokens
- Tool responses: 2,000 tokens
```

### With Aider Integration
```
Tokens used: ~500-1,500 per edit
- Unified diff: 200 tokens
- Repo map: 300 tokens
- Relevant context: 500 tokens
- Compact responses: 200 tokens
```

## Benefits of Integration

1. **80% reduction in token usage** for typical edits
2. **Faster response times** due to less data transfer
3. **Better multi-file refactoring** capabilities
4. **Git-aware editing** with proper commits
5. **Maintains Gemini CLI's flexibility** and tool ecosystem

## Testing Strategy

```bash
# Test Aider integration
npm test packages/core/src/tools/aider-integration.test.ts

# Compare token usage
node scripts/compare-token-usage.js --edit-tool standard
node scripts/compare-token-usage.js --edit-tool aider

# Benchmark performance
npm run benchmark:editing
```

## Migration Path for Users

1. **Opt-in initially**: Users can enable Aider tools manually
2. **A/B testing**: Compare effectiveness and token usage
3. **Gradual rollout**: Make diff-based editing default
4. **Full integration**: Aider techniques become core features

## Conclusion

Integrating Aider's token-efficient techniques into Gemini CLI will:
- Dramatically reduce API costs
- Improve response times
- Enable more complex operations within token limits
- Maintain backward compatibility
- Provide users with choice of editing strategies

The hybrid approach allows us to get immediate benefits while building native support for the most impactful optimizations.
