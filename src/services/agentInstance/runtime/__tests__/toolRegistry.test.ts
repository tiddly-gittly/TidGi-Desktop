import { describe, expect, it, vi } from 'vitest';
import { desktopBuiltinToolDefinitions } from '../../tools/builtinToolDefinitions';
import { MemeLoopDesktopToolRegistry } from '../toolRegistry';

describe('MemeLoopDesktopToolRegistry ownership', () => {
  it('isolates tool definitions per runtime and disposes without affecting peers', () => {
    const first = new MemeLoopDesktopToolRegistry();
    const second = new MemeLoopDesktopToolRegistry();

    expect(first.getPromptPlugins().size).toBe(desktopBuiltinToolDefinitions.length);
    expect(second.getPromptPlugins().size).toBe(desktopBuiltinToolDefinitions.length);
    expect(first.getPromptPlugins()).not.toBe(second.getPromptPlugins());
    expect(first.getToolDefinitionRegistry().getAllToolDefinitions().size).toBe(desktopBuiltinToolDefinitions.length);
    expect(first.hasTool('wikiOperation')).toBe(true);
    expect(first.hasTool('wiki-operation')).toBe(false);
    expect(first.listTools()).toContain('ask-question');

    first.dispose();
    first.dispose();

    expect(() => first.getPromptPlugins()).toThrow('desktop_tool_registry_disposed');
    expect(second.getPromptPlugins().size).toBe(desktopBuiltinToolDefinitions.length);
    expect(second.getToolDefinitionRegistry().getAllToolDefinitions().size).toBe(desktopBuiltinToolDefinitions.length);
    second.dispose();
  });

  it('owns runtime plugin implementations and restores the host definition after unload', () => {
    const registry = new MemeLoopDesktopToolRegistry();
    const implementation = vi.fn();
    const schema = { type: 'object' };
    const unregister = registry.registerOwnedTool('ask-question', implementation, schema, 'execute');

    expect(registry.hasTool('ask-question')).toBe(true);
    expect(registry.getTool('ask-question')).toBe(implementation);
    expect(registry.getToolParameterSchema('ask-question')).toBe(schema);
    expect(unregister()).toBe(true);
    expect(unregister()).toBe(false);
    expect(registry.hasTool('ask-question')).toBe(true);
    expect(registry.getTool('ask-question')).toBeUndefined();
    expect(registry.getToolParameterSchema('ask-question')).toBeDefined();

    registry.dispose();
  });
});
