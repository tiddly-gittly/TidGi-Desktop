import { logger } from '@services/libs/log';
import { IExternalAPIService } from './interface';

export async function waitForAIStreamResult(
  prompt: string,
  aiConfig: Awaited<ReturnType<IExternalAPIService['getAIConfig']>>,
  externalAPIService: IExternalAPIService,
): Promise<string | undefined> {
  try {
    if (!aiConfig?.api?.summaryModel || !aiConfig?.api?.provider) {
      return undefined;
    }

    // Use the summary model for generation
    const config = {
      ...aiConfig,
      api: {
        ...aiConfig.api,
        model: aiConfig.api.summaryModel,
      },
    };

    const messages = [
      {
        role: 'user' as const,
        content: prompt,
      },
    ];

    // Use generateFromAI and get the final content
    // Note: response.content already contains accumulated content, not incremental
    let finalContent = '';
    const generator = externalAPIService.generateFromAI(messages, config);

    for await (const response of generator) {
      if (response.status === 'error') {
        logger.error('AI generation error', { errorDetail: response.errorDetail });
        return undefined;
      }

      // Update with latest content (it's already accumulated, not incremental)
      if (response.content) {
        finalContent = response.content;
      }

      if (response.status === 'done') {
        break;
      }
    }

    return finalContent.trim() || undefined;
  } catch (error) {
    logger.error('AI API call failed', { error });
    return undefined;
  }
}
