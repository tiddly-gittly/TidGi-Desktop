import { container } from '@services/container';
import { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { TaskContext, TaskYieldUpdate } from '../server';
import { TextPart } from '../server/schema';

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

  // Echo user message
  yield {
    state: 'working',
    message: {
      role: 'agent',
      parts: [{ text: `You said: ${userText}\n\nGetting AI response...` }],
    },
  } as TaskYieldUpdate;

  // Get AI configuration
  const aiConfig = await externalAPIService.getAIConfig();
  
  // Use generateFromAI instead of streamFromAI with observable-to-async-generator
  let currentRequestId: string | null = null;
  
  try {
    // Directly use the async generator
    for await (const response of externalAPIService.generateFromAI(
      [{ role: 'user', content: userText }],
      aiConfig
    )) {
      // Store requestId for cancellation
      if (!currentRequestId && response.requestId) {
        currentRequestId = response.requestId;
      }
      
      // Check for cancellation
      if (context.isCancelled()) {
        // Cancel the current request if we have a requestId
        if (currentRequestId) {
          await externalAPIService.cancelAIRequest(currentRequestId);
        }
        yield { state: 'canceled' } as TaskYieldUpdate;
        return;
      }
      
      // Handle different response states
      if (response.status === 'update' || response.status === 'done') {
        // Update UI
        yield {
          state: response.status === 'done' ? 'completed' : 'working',
          message: {
            role: 'agent',
            parts: [{ text: `You said: ${userText}\n\nAI response: ${response.content}` }],
          },
        } as TaskYieldUpdate;
      } else if (response.status === 'error') {
        // Handle error case
        yield {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [{ text: `You said: ${userText}\n\nError getting AI response: ${response.content}` }],
          },
        } as TaskYieldUpdate;
        return;
      }
    }
  } catch (error) {
    // Handle any unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in echoHandler:', errorMessage);
    
    yield {
      state: 'completed',
      message: {
        role: 'agent',
        parts: [{ text: `You said: ${userText}\n\nError processing AI response: ${errorMessage}` }],
      },
    } as TaskYieldUpdate;
  } finally {
    // Ensure request is cancelled if needed
    if (context.isCancelled() && currentRequestId) {
      await externalAPIService.cancelAIRequest(currentRequestId);
    }
  }
}
