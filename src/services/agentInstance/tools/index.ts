/**
 * Agent Framework Plugin System
 *
 * This module provides a unified registration and hook system for:
 * 1. LLM Tools - Inject tool descriptions and handle AI tool calls
 * 2. Core Infrastructure - Message persistence, streaming, status (always enabled)
 *
 * All plugins are configured via the `plugins` array in agentFrameworkConfig.
 * Each plugin has a `toolId` that identifies it and a corresponding `xxxParam` object for configuration.
 */
// Re-export the pure definition API for LLM tools.
export { defineTool } from 'memeloop';
import type { ResponseHandlerContext, ToolDefinition, ToolExecutionResult, ToolHandlerContext } from 'memeloop';
export type { ResponseHandlerContext, ToolDefinition, ToolExecutionResult, ToolHandlerContext };
export { desktopBuiltinToolDefinitions } from './builtinToolDefinitions';
export { defineDesktopTool } from './defineToolDefinition';
