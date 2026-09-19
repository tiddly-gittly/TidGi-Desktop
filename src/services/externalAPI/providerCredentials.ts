import type { ProviderAccountConfig } from 'memeloop';

import { isLoopbackOpenAIBaseURL } from './openAIBaseURL';

/** Providers that intentionally work without a persisted API key. */
export function providerAllowsEmptyCredential(account: Pick<ProviderAccountConfig, 'providerType' | 'baseUrl'>): boolean {
  return account.providerType === 'ollama' || account.providerType === 'comfyui' ||
    (account.providerType === 'openai-compatible' && isLoopbackOpenAIBaseURL(account.baseUrl));
}

/** Runtime credential check. The caller is responsible for checking enabled/routes. */
export function hasUsableProviderCredential(
  account: Pick<ProviderAccountConfig, 'providerType' | 'baseUrl'>,
  apiKey: string | undefined,
): boolean {
  return providerAllowsEmptyCredential(account) || (apiKey?.trim().length ?? 0) > 0;
}

/** Renderer-safe credential check based only on the opaque account reference. */
export function hasUsableProviderCredentialReference(
  account: Pick<ProviderAccountConfig, 'providerType' | 'baseUrl' | 'secretRef'>,
): boolean {
  return providerAllowsEmptyCredential(account) || account.secretRef !== undefined;
}
