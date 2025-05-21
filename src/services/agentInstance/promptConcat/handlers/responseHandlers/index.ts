/**
 * Response handlers index
 *
 * Registers and exports all response handlers
 */
import { registerResponseDynamicModificationHandler, registerResponseProcessingHandler } from '../../responseConcat';
import { handleAutoReply } from './autoReply';
import { handleAutoReroll } from './autoReroll';
import { handleFullReplacement } from './fullReplacement';
import { handleToolCalling } from './toolCalling';

// Register all response dynamic modification handlers
registerResponseDynamicModificationHandler('fullReplacement', handleFullReplacement);

// Register all response processing handlers
registerResponseProcessingHandler('toolCalling', handleToolCalling);
registerResponseProcessingHandler('autoReroll', handleAutoReroll);
registerResponseProcessingHandler('autoReply', handleAutoReply);

// Export all handlers for direct use
export { handleAutoReply, handleAutoReroll, handleFullReplacement, handleToolCalling };
