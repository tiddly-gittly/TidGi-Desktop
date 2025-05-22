import { z } from 'zod/v4';
import { HandlerConfigSchema } from './index';

/**
 * Pre-generated JSON Schema for just the handler configuration part
 * This can be used when only the handler configuration is needed
 * It contains the prompt configuration without the parent agent structure
 */
export const promptConcatHandlerConfigJsonSchema = z.toJSONSchema(HandlerConfigSchema);
