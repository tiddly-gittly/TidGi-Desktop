# buildInAgentHandlers

Built-in agent handlers that orchestrate AI conversation flows with advanced features like tool calling, multi-round processing, and response handling.

## Architecture

### Core Handler

- **basicPromptConcatHandler**: Main conversation orchestrator that manages the complete AI interaction lifecycle

### Middleware System

- **continueRoundHandlers**: Middleware for determining when to continue with additional AI rounds
  - Tool calling detection and execution
  - Extensible priority-based handler registry
  - Configurable continuation logic
  - **Side effects allowed**: Can invoke tools and perform external operations

- **promptConcat middleware**: Pipeline for dynamic prompt modifications
  - Each handler receives full prompt tree context
  - Supports prompt injection, replacement, and conditional logic
  - Chainable modifications with source path tracking
  - Pure function design for predictable transformations
  - **No side effects**: May have async external requests but no state mutations

### Key Features

- **Multi-round conversations**: Automatic continuation for tool calling and complex interactions
- **Cancellation support**: Graceful handling of user-initiated cancellations
- **Error resilience**: Comprehensive error handling and retry logic
- **Extensible architecture**: Plugin-style handlers for custom continuation logic

## Responsibilities

- AI API integration and response streaming
- Tool calling detection and execution coordination
- Message history management
- State transitions (working → completed/cancelled)
- Integration with promptConcat for pure prompt processing

## Flow

1. Receive user message and context
2. Use promptConcat to build AI prompts
3. Stream AI responses with real-time status updates
4. Check for continuation needs (tool calling, etc.)
5. Process responses and manage conversation state
6. Repeat until conversation naturally concludes
