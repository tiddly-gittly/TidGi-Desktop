import { container } from '@services/container';
import { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IAgentService } from '../interface';
import { TaskContext, TaskYieldUpdate } from '../server';
import { Part, TextPart } from '../server/schema';

export async function* echoHandler(context: TaskContext) {
  // Create timestamp for all message metadata
  const now = new Date();

  // Send working status first
  yield {
    state: 'working',
    message: {
      role: 'agent',
      parts: [{ text: 'Processing your message...' }],
      metadata: {
        created: now.toISOString(),
      },
    },
  } as TaskYieldUpdate;

  // Get ai api service
  const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
  const agentService = container.get<IAgentService>(serviceIdentifier.Agent);

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
      metadata: {
        created: new Date().toISOString(),
      },
    },
  } as TaskYieldUpdate;

  // Get AI configuration
  const aiConfig = await agentService.getAIConfigByIds(context.task.id, context.agentId);
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
      if (response.status === 'update') {
        // Normal response update
        yield {
          state: 'working',
          message: {
            role: 'agent',
            parts: [{ text: `You said: ${userText}\n\nAI response: ${response.content}` }],
            metadata: {
              created: new Date().toISOString(),
              id: currentRequestId,
            },
          },
        } as TaskYieldUpdate;
      } else if (response.status === 'done') {
        // When done, return empty parts, because above result is already updated by ID to perform stream response, so no need to return full result here.
        yield {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [], // Empty parts when done
            metadata: {
              created: new Date().toISOString(),
            },
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
            metadata: {
              id: currentRequestId,
              created: new Date().toISOString(),
            },
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
        metadata: {
          id: currentRequestId,
          created: new Date().toISOString(),
        },
      },
    } as TaskYieldUpdate;
  } finally {
    // Ensure request is cancelled if needed
    if (context.isCancelled() && currentRequestId) {
      await externalAPIService.cancelAIRequest(currentRequestId);
    }
  }
}
