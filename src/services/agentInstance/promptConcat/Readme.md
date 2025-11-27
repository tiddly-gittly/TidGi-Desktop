# Prompt Concat Tools

Prompt engineering and message processing with a tool-based architecture.

If final prompt is a food, then `agentFrameworkConfig.prompts` is the recipe. Chat history and user input are raw materials.

## Implementation

The `promptConcat` function uses a tapable hooks-based tool system. Built-in tools are registered by `toolId` and loaded based on configuration in `taskAgents.json`.

### Tool System Architecture

1. **Hooks**: Uses tapable `AsyncSeriesWaterfallHook` for tool execution
   - `processPrompts`: Modifies prompt tree during processing
   - `finalizePrompts`: Final processing before LLM call
   - `postProcess`: Handles response processing

2. **Built-in Tools**:
   - `fullReplacement`: Replaces content from various sources
   - `dynamicPosition`: Inserts content at specific positions
   - `retrievalAugmentedGeneration`: Retrieves content from wiki/external sources
   - `modelContextProtocol`: Integrates with external MCP servers
   - `toolCalling`: Processes function calls in responses

3. **Tool Registration**:
   - Tools are registered by `toolId` field in the `plugins` array
   - Each tool instance has its own configuration parameters
   - Built-in tools are auto-registered on system initialization

### Tool Lifecycle

1. **Registration**: Tools are registered during initialization
2. **Configuration**: Tools are loaded based on `agentFrameworkConfig.plugins` array
3. **Execution**: Hooks execute tools in registration order
4. **Error Handling**: Individual tool failures don't stop the pipeline

### Adding New Tools

1. Create tool function in `tools/` directory
2. Register in `tools/index.ts`
3. Add `toolId` to schema enum
4. Add parameter schema if needed

Each tool receives a hooks object and registers handlers for specific hook points. Tools can modify prompt trees, inject content, process responses, and trigger additional LLM calls.

### Example Tool Structure

```typescript
export const myTool: PromptConcatTool = (hooks) => {
  hooks.processPrompts.tapAsync('myTool', async (context, callback) => {
    const { tool, prompts, messages } = context;
    // Tool logic here
    callback(null, context);
  });
};
```
