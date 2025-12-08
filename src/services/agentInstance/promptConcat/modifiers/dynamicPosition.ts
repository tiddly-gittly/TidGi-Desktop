/**
 * Dynamic Position Modifier
 *
 * Inserts content at a specific position relative to a target element.
 */
import { logger } from '@services/libs/log';
import { identity } from 'lodash';
import { z } from 'zod/v4';
import type { IPrompt } from '../promptConcatSchema';
import { registerModifier } from './defineModifier';

const t = identity;

/**
 * Dynamic Position Parameter Schema
 */
export const DynamicPositionParameterSchema = z.object({
  targetId: z.string().meta({
    title: t('Schema.Position.TargetIdTitle'),
    description: t('Schema.Position.TargetId'),
  }),
  position: z.enum(['before', 'after', 'relative']).meta({
    title: t('Schema.Position.TypeTitle'),
    description: t('Schema.Position.Type'),
  }),
}).meta({
  title: t('Schema.Position.Title'),
  description: t('Schema.Position.Description'),
});

export type DynamicPositionParameter = z.infer<typeof DynamicPositionParameterSchema>;

export function getDynamicPositionParameterSchema() {
  return DynamicPositionParameterSchema;
}

/**
 * Dynamic Position Modifier Definition
 */
const dynamicPositionDefinition = registerModifier({
  modifierId: 'dynamicPosition',
  displayName: 'Dynamic Position',
  description: 'Insert content at a specific position relative to a target element',
  configSchema: DynamicPositionParameterSchema,

  onProcessPrompts({ config, modifierConfig, findPrompt }) {
    // dynamicPosition requires content from modifierConfig
    if (!modifierConfig.content) {
      return;
    }

    const { targetId, position } = config;
    const found = findPrompt(targetId);

    if (!found) {
      logger.warn('Target prompt not found for dynamicPosition', {
        targetId,
        modifierId: modifierConfig.id,
      });
      return;
    }

    const newPart: IPrompt = {
      id: `dynamic-${modifierConfig.id}-${Date.now()}`,
      caption: modifierConfig.caption ?? 'Dynamic Content',
      text: modifierConfig.content,
    };

    switch (position) {
      case 'before':
        found.parent.splice(found.index, 0, newPart);
        break;
      case 'after':
        found.parent.splice(found.index + 1, 0, newPart);
        break;
      case 'relative':
        if (!found.prompt.children) {
          found.prompt.children = [];
        }
        found.prompt.children.push(newPart);
        break;
      default:
        logger.warn(`Unknown position: ${position as string}`);
        return;
    }

    logger.debug('Dynamic position insertion completed', {
      targetId,
      position,
      contentLength: modifierConfig.content.length,
      modifierId: modifierConfig.id,
    });
  },
});

export const dynamicPositionModifier = dynamicPositionDefinition.modifier;
