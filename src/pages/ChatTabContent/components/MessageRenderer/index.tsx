// Registry system for message renderers

import React, { Fragment, useMemo } from 'react';
import { BaseMessageRenderer } from './BaseMessageRenderer';
import { ThinkingMessageRenderer } from './ThinkingMessageRenderer';
import { MessageRendererProps, MessageRendererRegistration } from './types';

// Global registry for message renderers
const renderersRegistry = new Map<string, MessageRendererRegistration>();

/**
 * Register a new message renderer
 * @param id Unique identifier for this renderer
 * @param registration Renderer registration object
 */
export function registerMessageRenderer(id: string, registration: Omit<MessageRendererRegistration, 'id'>): void {
  renderersRegistry.set(id, { ...registration, id });
}

/**
 * Message renderer component that selects appropriate renderers for different parts of the message
 */
export const MessageRenderer: React.FC<MessageRendererProps> = ({ message, isUser }) => {
  // Get all applicable renderers for different parts of the message
  const rendererComponents = useMemo(() => {
    // For user messages, just use the base renderer
    if (isUser) {
      const SelectedRenderer = BaseMessageRenderer;
      return [<SelectedRenderer key='user-message' message={message} isUser={isUser} />];
    }

    // Convert registry to array and sort by priority
    const sortedRenderers = Array.from(renderersRegistry.values())
      .sort((a, b) => b.priority - a.priority);

    const components: React.ReactElement[] = []; // Use ReactElement type for better type safety
    let contentRendered = false;

    // First handle reasoning_content if present (highest priority)
    if (message.reasoning_content) {
      // Check for custom reasoning renderers
      const reasoningRenderers = sortedRenderers.filter(r => r.id === 'thinking' || r.id === 'reasoning');

      if (reasoningRenderers.length > 0) {
        // Use custom reasoning renderer if available
        const ReasoningRenderer = reasoningRenderers[0].renderer;
        components.push(
          <ReasoningRenderer
            key='reasoning-content'
            message={message}
            isUser={false}
          />,
        );
      } else {
        // Use our dedicated thinking renderer if no custom one is registered
        components.push(
          <ThinkingMessageRenderer
            key='reasoning-content'
            message={message}
            isUser={false}
          />,
        );
      }
      // We still need to render the main content separately
    }

    // Then, check for content pattern matches
    for (const registration of sortedRenderers) {
      if (
        registration.pattern &&
        registration.pattern.test(message.content) &&
        registration.id !== 'thinking' &&
        registration.id !== 'reasoning'
      ) {
        const ContentRenderer = registration.renderer;
        components.push(
          <ContentRenderer
            key={`pattern-${registration.id}`}
            message={message}
            isUser={false}
          />,
        );
        contentRendered = true;
        break; // Only use the first matching pattern for main content
      }
    }

    // Then, check for content type matches if no pattern matched
    if (!contentRendered && message.contentType) {
      for (const registration of sortedRenderers) {
        if (
          registration.contentType === message.contentType &&
          registration.id !== 'thinking' &&
          registration.id !== 'reasoning'
        ) {
          const ContentRenderer = registration.renderer;
          components.push(
            <ContentRenderer
              key={`content-type-${registration.id}`}
              message={message}
              isUser={false}
            />,
          );
          contentRendered = true;
          break; // Only use the first matching content type
        }
      }
    }

    // Check if this is an error message with metadata
    if (!contentRendered && message.metadata?.errorDetail) {
      // Find error renderer
      const errorRenderer = sortedRenderers.find(r => r.id === 'error');
      if (errorRenderer) {
        const ErrorRenderer = errorRenderer.renderer;
        components.push(
          <ErrorRenderer
            key='error-content'
            message={message}
            isUser={false}
          />,
        );
        contentRendered = true;
      }
    }

    // If no specific renderer matched for the content, use the base renderer
    if (!contentRendered) {
      // Check if we already have a base renderer
      const hasBaseRenderer = components.some(c => c.key === 'base-content');

      if (!hasBaseRenderer) {
        components.push(
          <BaseMessageRenderer
            key='base-content'
            message={message}
            isUser={false}
          />,
        );
      }
    }

    return components;
  }, [isUser, message]);

  return <Fragment>{rendererComponents}</Fragment>;
};
