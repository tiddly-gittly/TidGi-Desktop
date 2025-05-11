import { container } from '@services/container';
import { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { promptConcat } from './promptConcatUtils/promptConcat';
import { canceled, completed, working } from './statusUtilities';
import { AgentHandlerContext } from './type';

/**
 * Example agent handler
 * Generates responses based on AgentHandlerContext
 *
 * @param context - Agent handling context
 */
export async function* basicPromptConcatHandler(context: AgentHandlerContext) {
  // Send working status first
  yield working('Processing your message...', context);

  // Get service instances
  const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);

  // Get latest user message
  const messages = context.agent.messages;
  const [userMessage] = messages;
  if (messages.length === 0 || !userMessage.content || userMessage.role !== 'user') {
    yield completed('No user message found to process.', context);
    return;
  }

  // Ensure AI configuration exists
  const aiApiConfig = {
    ...await externalAPIService.getAIConfig(),
    ...context.agentDef.aiApiConfig,
    ...context.agent.aiApiConfig,
  };

  // Check if cancelled
  if (context.isCancelled()) {
    yield canceled();
    return;
  }

  // Process prompts using common handler function
  try {
    // Create a configuration object conforming to the AgentPromptDescription interface
    const promptDescription = {
      id: context.agentDef.id,
      api: aiApiConfig.api,
      modelParameters: aiApiConfig.modelParameters,
      promptConfig: {
        prompts: [],
        promptDynamicModification: [],
        response: [],
        responseDynamicModification: [],
      },
    };

    const { flatPrompts } = promptConcat(promptDescription, context);

    // Generate AI response
    let currentRequestId: string | undefined = undefined;

    try {
      for await (const response of externalAPIService.generateFromAI(flatPrompts, aiApiConfig)) {
        if (!currentRequestId && response.requestId) {
          currentRequestId = response.requestId;
        }

        if (context.isCancelled()) {
          if (currentRequestId) {
            await externalAPIService.cancelAIRequest(currentRequestId);
          }
          yield canceled();
          return;
        }

        if (response.status === 'update' || response.status === 'done') {
          const state = response.status === 'done' ? 'completed' : 'working';
          if (state === 'completed') {
            yield completed(response.content, context, currentRequestId);
          } else {
            yield working(response.content, context, currentRequestId);
          }
        } else if (response.status === 'error') {
          yield completed(`Error: ${response.errorDetail?.message || 'Unknown error'}`, context);
          return;
        }
      }
      // Reset request ID after processing
      currentRequestId = undefined;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield completed(`Unexpected error: ${errorMessage}`, context);
    } finally {
      if (context.isCancelled() && currentRequestId) {
        await externalAPIService.cancelAIRequest(currentRequestId);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    yield completed(`Error processing prompt: ${errorMessage}`, context);
  }
}
