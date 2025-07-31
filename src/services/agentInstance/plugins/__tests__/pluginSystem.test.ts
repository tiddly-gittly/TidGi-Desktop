/**
 * Tests for the enhanced plugin system after refactoring
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandlerHooks, registerAllBuiltInPlugins } from '../index';

describe('Plugin System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createHandlerHooks', () => {
    it('should create handler hooks with required hooks', () => {
      const hooks = createHandlerHooks();

      expect(hooks).toBeDefined();
      expect(hooks.userMessageReceived).toBeDefined();
      expect(hooks.agentStatusChanged).toBeDefined();
      expect(hooks.toolExecuted).toBeDefined();
      expect(hooks.responseUpdate).toBeDefined();
      expect(hooks.responseComplete).toBeDefined();
    });
  });

  describe('registerAllBuiltInPlugins', () => {
    it('should register plugins without throwing', () => {
      const hooks = createHandlerHooks();

      expect(() => {
        registerAllBuiltInPlugins(hooks);
      }).not.toThrow();
    });
  });
});
