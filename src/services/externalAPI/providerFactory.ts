import { createLLMProviderFromAccountRoute } from 'memeloop/llm-providers';

/**
 * Exact Core provider-construction port owned by the Desktop host.
 *
 * Keeping the callable on a stable object lets host composition and future
 * provider plugins replace construction without changing provider account or
 * route data. The default remains Core's canonical implementation.
 */
export const desktopLlmProviderFactoryPort = {
  createFromAccountRoute: createLLMProviderFromAccountRoute,
};
