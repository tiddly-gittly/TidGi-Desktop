/**
 * Response handlers index
 *
 * Registers and exports all response handlers
 */
import { registerResponseDynamicModificationHandler, registerResponseProcessingHandler } from '../../responseConcat';
import { handleFullReplacement } from './fullReplacement';
import { handleToolCalling } from './toolCalling';

// Register all response dynamic modification handlers
registerResponseDynamicModificationHandler('fullReplacement', handleFullReplacement);
// Register all response processing handlers
registerResponseProcessingHandler('toolCalling', handleToolCalling);
