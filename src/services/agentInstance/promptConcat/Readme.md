# Prompt Concat Tools

Pure functions for prompt engineering and message processing, with no side effects.

## Purpose

This module handles the transformation and preparation of conversation data into AI-ready prompts. It focuses purely on data processing without performing any external operations.

## Core Responsibilities

### Prompt Construction

- Convert conversation history into structured prompts
- Apply prompt templates and formatting rules
- Handle different AI model prompt formats
- Merge system prompts with user messages

### Message Processing

- Clean and normalize message content
- Apply content filters and transformations
- Handle message metadata and attachments
- Validate message structure and format

### Response Processing

- Parse and normalize AI responses
- Extract structured data from responses
- Apply post-processing transformations
- Prepare responses for storage

## Architecture Principles

- **Pure functions**: No side effects, predictable outputs
- **Composable**: Functions can be combined and reused
- **Type-safe**: Strong TypeScript typing throughout
- **Testable**: Easy to unit test without mocking

## Integration

These tools are consumed by buildInAgentHandlers for:

- Pre-processing user inputs before AI generation
- Post-processing AI outputs before storage
- Formatting prompts for different AI providers
- Normalizing conversation data

For actual AI generation, tool calling, retry logic, and multi-round processing, see [buildInAgentHandlers](../buildInAgentHandlers/Readme.md).

## Key Modules

- **Prompt builders**: Template-based prompt construction
- **Message formatters**: Standardized message processing
- **Response handlers**: AI output processing and validation
- **Schema validators**: Type checking and data validation
