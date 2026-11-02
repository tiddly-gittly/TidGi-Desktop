import { logger } from '@services/libs/log';
import { collectPortableLlmTextResponse, type PortableLlmRequest } from 'memeloop';

import type { IExternalAPIService } from './interface';

export async function waitForAIStreamResult(
  prompt: string,
  aiConfig: Awaited<ReturnType<IExternalAPIService['getAIConfig']>>,
  externalAPIService: IExternalAPIService,
): Promise<string | undefined> {
  try {
    const selection = aiConfig.free;
    if (!selection) return undefined;
    const account = (await externalAPIService.getProviderAccounts()).find(candidate => candidate.providerId === selection.providerId);
    const route = account?.models.find(candidate => candidate.modelId === selection.modelId);
    if (!account || !route) return undefined;
    const request: PortableLlmRequest = {
      providerId: account.providerId,
      logicalModelId: route.modelId,
      wireModelId: route.wireModelId,
      apiMode: route.apiMode,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      ...(selection.parameters?.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: selection.parameters.maxOutputTokens }),
      ...(selection.parameters?.temperature === undefined
        ? {}
        : { temperature: selection.parameters.temperature }),
      ...(selection.parameters?.topP === undefined
        ? {}
        : { topP: selection.parameters.topP }),
    };
    const result = await collectPortableLlmTextResponse(
      externalAPIService.generatePortableLlm(request),
    );
    return result.trim() || undefined;
  } catch (error) {
    logger.error('AI API call failed', { error });
    return undefined;
  }
}
