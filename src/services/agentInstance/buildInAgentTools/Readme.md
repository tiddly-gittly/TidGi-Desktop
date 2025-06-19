# buildInAgentTools

Built-in agent tools that extend AI capabilities through external integrations and function calling.

## Overview

This module provides predefined tools that AI agents can invoke during conversations to perform specific tasks beyond text generation.

## Tool Categories

### System Tools

- File operations (read, write, search)
- System information retrieval
- Process management

### External Integrations

- Web search and content retrieval
- API calls to external services
- Database queries

### Workspace Tools

- TiddlyWiki workspace operations
- Note management and searching
- Cross-workspace communication

## Architecture

Tools are designed as pure functions with clear interfaces:

- **Input validation**: Type-safe parameter checking
- **Error handling**: Graceful failure with meaningful messages
- **Async support**: Non-blocking operations for external calls
- **Serializable results**: JSON-compatible return values

## Usage

Tools are automatically registered and made available to AI agents through the tool calling system in buildInAgentHandlers. Each tool defines:

- Function signature and parameters
- Description for AI model understanding
- Execution logic and error handling
- Result formatting and validation

## Integration

Tools integrate with the agent handler system through:

1. **Tool discovery**: Automatic registration and enumeration
2. **Parameter validation**: Runtime type checking
3. **Execution**: Sandboxed function calls
4. **Result processing**: Standardized response formatting
