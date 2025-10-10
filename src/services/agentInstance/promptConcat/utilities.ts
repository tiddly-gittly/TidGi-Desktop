/**
 * Utility functions for prompt concatenation
 */

import { lastValueFrom, Observable } from 'rxjs';
import { last } from 'rxjs/operators';
import { PromptConcatStreamState } from './promptConcat';

/**
 * Helper function to get the final result from a prompt concatenation stream
 * Useful for backend code that doesn't need intermediate updates
 *
 * @param stream Observable stream from concatPrompt
 * @returns Promise that resolves to the final state with flat prompts and processed prompts
 */
export async function getFinalPromptResult(
  stream: Observable<PromptConcatStreamState>,
): Promise<{
  flatPrompts: PromptConcatStreamState['flatPrompts'];
  processedPrompts: PromptConcatStreamState['processedPrompts'];
}> {
  const finalState = await lastValueFrom(stream.pipe(last()));

  if (!finalState) {
    throw new Error('Prompt concatenation stream ended without final result');
  }

  return {
    flatPrompts: finalState.flatPrompts,
    processedPrompts: finalState.processedPrompts,
  };
}
