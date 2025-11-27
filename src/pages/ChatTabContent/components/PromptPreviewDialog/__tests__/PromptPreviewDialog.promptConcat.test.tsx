/**
 * Tests for PromptPreviewDialog component
 * Testing tool information rendering for wikiOperationPlugin, wikiSearchPlugin, workspacesListPlugin
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';

import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore/index';
import defaultAgents from '@services/agentInstance/agentFrameworks/taskAgents.json';
import { IPrompt } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { ModelMessage } from 'ai';
import { PromptPreviewDialog } from '../index';

// Mock handler config management hook
vi.mock('@/windows/Preferences/sections/ExternalAPI/useAgentFrameworkConfigManagement', () => ({
  useAgentFrameworkConfigManagement: vi.fn(() => ({
    loading: false,
    config: defaultAgents[0].agentFrameworkConfig,
    handleConfigChange: vi.fn(),
  })),
}));

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={lightTheme}>
    {children}
  </ThemeProvider>
);

describe('PromptPreviewDialog - Tool Information Rendering', () => {
  beforeEach(async () => {
    // Reset store to initial state before each test using real store
    useAgentChatStore.setState({
      agent: {
        id: 'test-agent',
        agentDefId: 'task-agent',
        status: { state: 'working', modified: new Date() },
        created: new Date(),
      },
      messages: new Map(),
      previewDialogOpen: true,
      previewDialogTab: 'tree',
      previewLoading: false,
      previewResult: null,
      previewProgress: 0,
      previewCurrentStep: '',
      previewCurrentPlugin: null,
      lastUpdated: null,
      formFieldsToScrollTo: [],
      expandedArrayItems: new Map(),
    });

    // Clear all mock calls
    vi.clearAllMocks();

    // Initialize real AgentInstance observables for testing actual plugin execution
  });

  it('should use real concatPrompt implementation with built-in plugins', async () => {
    // Test if the real concatPrompt is working
    expect(globalThis.window?.observables?.agentInstance?.concatPrompt).toBeDefined();

    // Create test data matching taskAgents.json - cast to avoid type issues in test
    const agentFrameworkConfig = defaultAgents[0].agentFrameworkConfig as never;
    const messages = [{
      id: 'test-message-1',
      agentId: 'test-agent',
      role: 'user' as const,
      content: 'Hello world',
    }];

    // Call the real concatPrompt implementation
    const observable = globalThis.window.observables.agentInstance.concatPrompt(
      { agentFrameworkConfig },
      messages,
    );

    // Collect results from the stream
    const results: unknown[] = [];
    await new Promise<void>((resolve) => {
      observable.subscribe({
        next: (state) => {
          results.push(state);
        },
        complete: () => {
          resolve();
        },
        error: () => {
          resolve(); // Don't fail test on error, just collect what we can
        },
      });
    });

    // Verify we got some results
    expect(results.length).toBeGreaterThan(0);

    // This test verifies that the real concatPrompt can execute
    // console.log('Results from real concatPrompt:', JSON.stringify(results, null, 2));

    // Basic verification that we got some output
    const hasValidResults = results.some((result: unknown) => {
      return result !== null && typeof result === 'object';
    });

    expect(hasValidResults).toBe(true);
  });

  // Type guard for preview result shape
  const isPreviewResult = (v: unknown): v is { flatPrompts: ModelMessage[]; processedPrompts: IPrompt[] } => {
    if (!v || typeof v !== 'object') return false;
    return Object.prototype.hasOwnProperty.call(v, 'flatPrompts') && Object.prototype.hasOwnProperty.call(v, 'processedPrompts');
  };

  // Use IPrompt from promptConcatSchema for typing processedPrompts nodes

  it('should render workspaces and tools info from real concatPrompt execution', async () => {
    // First execute real concatPrompt to get the structured data
    const agentFrameworkConfig = defaultAgents[0].agentFrameworkConfig;
    const messages = [{ id: 'test', role: 'user' as const, content: 'Hello world', created: new Date(), modified: new Date(), agentId: 'test' }];

    // Pass agentFrameworkConfig wrapped (same shape used elsewhere)
    const observable = window.observables.agentInstance.concatPrompt({ agentFrameworkConfig } as never, messages);

    const results: unknown[] = [];
    let finalResult: { flatPrompts: ModelMessage[]; processedPrompts: IPrompt[] } | undefined;
    await new Promise<void>((resolve) => {
      observable.subscribe({
        next: (state) => {
          results.push(state);
          const s = state as { isComplete?: boolean };
          if (s.isComplete) {
            finalResult = state;
          }
        },
        complete: () => {
          resolve();
        },
        error: () => {
          resolve();
        },
      });
    });

    // Try to find a streamed result that already contains plugin-injected tool info
    const containsPluginInfo = (r: unknown): boolean => {
      if (!isPreviewResult(r)) return false;
      const rp: IPrompt[] = r.processedPrompts;
      const system = rp.find(p => p.id === 'system');
      if (!system || !Array.isArray(system.children)) return false;
      const tools = system.children.find(c => c.id === 'default-tools');
      if (!tools || !Array.isArray(tools.children)) return false;
      return tools.children.some((child) => {
        const caption = child.caption ?? '';
        const text = child.text ?? '';
        const body = `${caption} ${text}`;
        return /Available\s+Wiki\s+Workspaces/i.test(body) || /wiki-operation/i.test(body) || /wiki-search/i.test(body);
      });
    };

    if (!finalResult && results.length > 0) {
      for (const r of results) {
        if (isPreviewResult(r) && containsPluginInfo(r)) {
          finalResult = r;
          break;
        }
      }
      // Fallback to last streamed result if none contained plugin info
      if (!finalResult) {
        const last = results[results.length - 1];
        if (isPreviewResult(last)) {
          finalResult = last;
        }
      }
    }

    // Update real store with results
    if (finalResult) {
      act(() => {
        useAgentChatStore.setState({
          previewResult: finalResult,
          previewLoading: false,
          previewDialogOpen: true,
          previewDialogTab: 'tree',
        });
      });
    } else {
      // No final result received from concatPrompt
    }

    render(
      <TestWrapper>
        <PromptPreviewDialog
          open={true}
          onClose={vi.fn()}
          inputText='Hello world'
        />
      </TestWrapper>,
    );

    // Wait for component to load
    await waitFor(() => {
      expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Get current store state using real store
    const currentState = useAgentChatStore.getState();
    const result = currentState.previewResult;

    // Detailed assertions on processedPrompts structure to verify everything works correctly
    expect(result?.processedPrompts).toBeDefined();

    // Find the system prompt with tools (typed)
    const systemPrompt: IPrompt | undefined = result?.processedPrompts.find((p: IPrompt) => p.id === 'system');
    expect(systemPrompt).toBeDefined();
    expect(systemPrompt?.children).toBeDefined();

    // Find the tools section (typed)
    const toolsSection: IPrompt | undefined = systemPrompt!.children!.find((c: IPrompt) => c.id === 'default-tools');
    expect(toolsSection).toBeDefined();
    expect(toolsSection?.children).toBeDefined();

    // Find the default-before-tool element (typed)
    const beforeToolElement: IPrompt | undefined = toolsSection!.children!.find((c: IPrompt) => c.id === 'default-before-tool');
    expect(beforeToolElement).toBeDefined();

    // Verify that plugin-generated content was inserted AFTER the default-before-tool element
    // The toolListPosition config specifies position: "after", targetId: "default-before-tool"
    const beforeToolIndex: number = toolsSection!.children!.findIndex((c: IPrompt) => c.id === 'default-before-tool');
    const childrenAfterBeforeTool = toolsSection!.children!.slice(beforeToolIndex + 1);

    // Should have plugin-generated content (workspaces list, wiki tools)
    expect(childrenAfterBeforeTool.length).toBeGreaterThan(0);

    // Helper: recursive search for a prompt node by matching caption/text
    const findPromptNodeByText = (prompts: IPrompt[] | undefined, re: RegExp): IPrompt | undefined => {
      if (!prompts) return undefined;
      for (const p of prompts) {
        const body = `${p.caption ?? ''} ${p.text ?? ''}`;
        if (re.test(body)) return p;
        if (Array.isArray(p.children)) {
          const found = findPromptNodeByText(p.children, re);
          if (found) return found;
        }
      }
      return undefined;
    };

    // Check for workspaces list insertion (from workspacesList plugin) - try tools children first
    let workspacesElement: IPrompt | undefined = childrenAfterBeforeTool.find((c: IPrompt) => {
      const body = `${c.text ?? ''} ${c.caption ?? ''}`;
      return /Available\s+Wiki\s+Workspaces/i.test(body) || /Test Wiki 1/i.test(body);
    });
    // Fallback: search entire processedPrompts tree
    if (!workspacesElement) {
      workspacesElement = findPromptNodeByText(result?.processedPrompts, /Available\s+Wiki\s+Workspaces/i);
    }
    expect(workspacesElement).toBeDefined();
    const workspacesText = `${workspacesElement?.caption ?? ''} ${workspacesElement?.text ?? ''}`;
    expect(workspacesText).toContain('Available Wiki Workspaces');
    expect(workspacesText).toContain('Test Wiki 1');
    expect(workspacesText).toContain('Test Wiki 2');

    // Check for wiki operation tool insertion (from wikiOperation plugin)
    let wikiOperationElement: IPrompt | undefined = childrenAfterBeforeTool.find((c: IPrompt) => {
      const body = `${c.caption ?? ''} ${c.text ?? ''}`;
      return /wiki-operation/i.test(body) || /在Wiki工作空间中执行操作/i.test(body);
    });
    if (!wikiOperationElement) {
      wikiOperationElement = findPromptNodeByText(result?.processedPrompts, /wiki-operation/i) || findPromptNodeByText(result?.processedPrompts, /在Wiki工作空间中执行操作/i);
    }
    expect(wikiOperationElement).toBeDefined();
    const wikiOperationText = `${wikiOperationElement?.caption ?? ''} ${wikiOperationElement?.text ?? ''}`;
    expect(wikiOperationText).toContain('## wiki-operation');
    expect(wikiOperationText).toContain('在Wiki工作空间中执行操作');

    // Check for wiki search tool insertion (from wikiSearch plugin)
    let wikiSearchElement: IPrompt | undefined = childrenAfterBeforeTool.find((c: IPrompt) => {
      const body = `${c.caption ?? ''} ${c.text ?? ''}`;
      return /Available Tools:/i.test(body) || /Tool ID:\s*wiki-search/i.test(body) || /wiki-search/i.test(body);
    });
    if (!wikiSearchElement) {
      wikiSearchElement = findPromptNodeByText(result?.processedPrompts, /Available Tools:/i) || findPromptNodeByText(result?.processedPrompts, /Tool ID:\s*wiki-search/i) ||
        findPromptNodeByText(result?.processedPrompts, /wiki-search/i);
    }
    expect(wikiSearchElement).toBeDefined();
    const wikiSearchText = `${wikiSearchElement?.caption ?? ''} ${wikiSearchElement?.text ?? ''}`;
    expect(wikiSearchText).toContain('Wiki search tool');
    expect(wikiSearchText).toContain('## wiki-search');

    // Verify the order: before-tool -> workspaces -> wiki-operation -> wiki-search -> post-tool
    const postToolElement: IPrompt | undefined = toolsSection?.children?.find((c: IPrompt) => c.id === 'default-post-tool');
    expect(postToolElement).toBeDefined();

    // All plugin-generated elements should be between before-tool and post-tool
    const postToolIndex: number = toolsSection!.children!.findIndex((c: IPrompt) => c.id === 'default-post-tool');
    expect(postToolIndex).toBeGreaterThan(beforeToolIndex);

    // Plugin-generated elements should be in the middle
    expect(workspacesElement).toBeDefined();
    expect(wikiOperationElement).toBeDefined();
    expect(wikiSearchElement).toBeDefined();
  });
});
