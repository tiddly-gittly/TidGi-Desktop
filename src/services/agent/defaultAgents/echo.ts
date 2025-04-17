import { container } from '@services/container';
import { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { TaskContext, TaskYieldUpdate } from '../server';
import { Part, TextPart } from '../server/schema';

export async function* echoHandler(context: TaskContext) {
  // Send working status first
  yield {
    state: 'working',
    message: {
      role: 'agent',
      parts: [{ text: 'Processing your message...' }],
    },
  } as TaskYieldUpdate;

  // Get ai api service
  const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);

  // Check if cancelled
  if (context.isCancelled()) {
    yield { state: 'canceled' } as TaskYieldUpdate;
    return;
  }

  // Get user message text
  const userText = (context.userMessage.parts as TextPart[])
    .filter((part) => part.text)
    .map((part) => part.text)
    .join(' ');

  // Echo user message (initial feedback)
  yield {
    state: 'working',
    message: {
      role: 'agent',
      parts: [{ text: `You said: ${userText}\n\nGetting AI response...` }],
    },
  } as TaskYieldUpdate;

  // Get AI configuration
  const aiConfig = await externalAPIService.getAIConfig();

  // Use generateFromAI with improved error handling
  let currentRequestId: string | null = null;

  try {
    // Directly use the async generator with simplified error handling
    for await (
      const response of externalAPIService.generateFromAI(
        [{ role: 'user', content: userText }],
        aiConfig,
      )
    ) {
      // Store requestId for potential cancellation
      if (!currentRequestId && response.requestId) {
        currentRequestId = response.requestId;
      }

      // Check for cancellation
      if (context.isCancelled()) {
        if (currentRequestId) {
          await externalAPIService.cancelAIRequest(currentRequestId);
        }
        yield { state: 'canceled' } as TaskYieldUpdate;
        return;
      }

      // Handle different response states
      if (response.status === 'update' || response.status === 'done') {
        // Normal response update
        yield {
          state: response.status === 'done' ? 'completed' : 'working',
          message: {
            role: 'agent',
            parts: [{ text: `You said: ${userText}\n\nAI response: ${response.content}` }],
          },
        } as TaskYieldUpdate;
      } else if (response.status === 'error') {
        // Error with structured error details
        const parts: Part[] = [
          { text: `You said: ${userText}` },
        ];

        // If we have structured error details, add them as an error part
        if (response.errorDetail) {
          parts.push({
            type: 'error',
            error: {
              name: response.errorDetail.name,
              code: response.errorDetail.code,
              provider: response.errorDetail.provider,
            },
          });
        }

        yield {
          state: 'completed',
          message: {
            role: 'agent',
            parts,
          },
        } as TaskYieldUpdate;
        return;
      }
    }
  } catch (error) {
    // This should rarely happen since most errors are now handled in generateFromAI
    const errorMessage = error instanceof Error ? error.message : String(error);

    yield {
      state: 'completed',
      message: {
        role: 'agent',
        parts: [{ text: `You said: ${userText}\n\nUnexpected error: ${errorMessage}` }],
      },
    } as TaskYieldUpdate;
  } finally {
    // Ensure request is cancelled if needed
    if (context.isCancelled() && currentRequestId) {
      await externalAPIService.cancelAIRequest(currentRequestId);
    }
  }
}
