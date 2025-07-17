/**
 * Prompt dynamic modification handlers index
 *
 * This file exports all prompt dynamic modification handlers
 */
import { registerPromptDynamicModificationHandler } from '../../promptConcat';
import { dynamicPositionHandler } from './dynamicPosition';
import { fullReplacementHandler } from './fullReplacement';
import { functionHandler } from './function';
import { modelContextProtocolHandler } from './modelContextProtocol';
import { retrievalAugmentedGenerationHandler } from './retrievalAugmentedGeneration';

/**
 * Register all prompt handlers
 */
export function registerAllPromptHandlers(): void {
  // Basic handlers (already exist in original codebase)
  registerPromptDynamicModificationHandler('fullReplacement', fullReplacementHandler);
  registerPromptDynamicModificationHandler('dynamicPosition', dynamicPositionHandler);

  // Advanced handlers (new implementations)
  registerPromptDynamicModificationHandler('retrievalAugmentedGeneration', retrievalAugmentedGenerationHandler);
  registerPromptDynamicModificationHandler('function', functionHandler);
  registerPromptDynamicModificationHandler('modelContextProtocol', modelContextProtocolHandler);
}
