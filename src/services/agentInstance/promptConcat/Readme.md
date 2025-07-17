# Prompt Concat Tools

Prompt engineering and message processing with a plugin-based architecture.

If final prompt is a food, then `handlerConfig.prompts` is the recipe. Chat history and user input are raw materials.

## Implementation

The `promptConcat` function uses a tapable hooks-based plugin system. Built-in plugins are registered by `pluginId` and loaded based on configuration in `defaultAgents.json`.

### Plugin System Architecture

1. **Hooks**: Uses tapable `AsyncSeriesWaterfallHook` for plugin execution
   - `processPrompts`: Modifies prompt tree during processing
   - `finalizePrompts`: Final processing before LLM call
   - `postProcess`: Handles response processing

2. **Built-in Plugins**: 
   - `fullReplacement`: Replaces content from various sources
   - `dynamicPosition`: Inserts content at specific positions
   - `retrievalAugmentedGeneration`: Retrieves content from wiki/external sources
   - `modelContextProtocol`: Integrates with external MCP servers
   - `toolCalling`: Processes function calls in responses
   - `autoReply`: Automatic follow-up response generation

3. **Plugin Registration**: 
   - Plugins are registered by `pluginId` field in the `plugins` array
   - Each plugin instance has its own configuration parameters
   - Built-in plugins are auto-registered on system initialization

### Plugin Lifecycle

1. **Initialization**: `initializePluginSystem()` registers all built-in plugins
2. **Configuration**: Plugins are loaded based on `promptConfig.plugins` array
3. **Execution**: Hooks execute plugins in registration order
4. **Error Handling**: Individual plugin failures don't stop the pipeline

### Adding New Plugins

1. Create plugin function in `plugins/` directory
2. Register in `plugins/index.ts`
3. Add `pluginId` to schema enum
4. Add parameter schema if needed

Each plugin receives a hooks object and registers handlers for specific hook points. Plugins can modify prompt trees, inject content, process responses, and trigger additional LLM calls.

### Example Plugin Structure

```typescript
export const myPlugin: PromptConcatPlugin = (hooks) => {
  hooks.processPrompts.tapAsync('myPlugin', async (context, callback) => {
    const { plugin, prompts, messages } = context;
    // Plugin logic here
    callback(null, context);
  });
};
```
