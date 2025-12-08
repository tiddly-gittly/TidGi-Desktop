/**
 * Prompt Modifiers
 *
 * Modifiers transform the prompt tree without involving LLM tool calling.
 * They work in the processPrompts and postProcess phases only.
 */

// Re-export defineModifier API
export { defineModifier, getAllModifiers, getModifier, registerModifier } from './defineModifier';
export type { InsertContentOptions, ModifierDefinition, ModifierHandlerContext, PostProcessModifierContext } from './defineModifier';

// Export modifiers
export { fullReplacementModifier, FullReplacementParameterSchema, getFullReplacementParameterSchema } from './fullReplacement';
export type { FullReplacementParameter } from './fullReplacement';

export { dynamicPositionModifier, DynamicPositionParameterSchema, getDynamicPositionParameterSchema } from './dynamicPosition';
export type { DynamicPositionParameter } from './dynamicPosition';

// Import for registration side effects
import { getAllModifiers } from './defineModifier';
import './fullReplacement';
import './dynamicPosition';

/**
 * Get all registered modifier functions as a map
 */
export function getModifierFunctions(): Map<string, (hooks: import('../../tools/types').PromptConcatHooks) => void> {
  const modifiers = getAllModifiers();
  const result = new Map<string, (hooks: import('../../tools/types').PromptConcatHooks) => void>();
  for (const [id, definition] of modifiers) {
    result.set(id, definition.modifier);
  }
  return result;
}
