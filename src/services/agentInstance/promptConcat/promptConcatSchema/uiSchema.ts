import type { UiSchema } from '@rjsf/utils';

/**
 * UI Schema for Handler Configuration Form
 * Defines the layout, widgets, and styling for the prompt configuration form
 */
export const HANDLER_CONFIG_UI_SCHEMA: UiSchema = {
  'ui:order': ['prompts', 'plugins', 'response', '*'],
  prompts: {
    'ui:options': {
      orderable: true,
      variant: 'primary',
    },
    items: {
      'ui:order': ['id', 'caption', 'enabled', 'role', 'text', 'children', '*'],
      'ui:compactFields': ['id', 'caption', 'enabled', 'role'], // Fields to display in 2-column layout
      text: {
        'ui:widget': 'textarea',
        'ui:options': {
          rows: 4,
        },
      },
      tags: {
        'ui:widget': 'TagsWidget',
      },
      children: {
        'ui:options': {
          orderable: true,
        },
        items: {
          'ui:order': ['id', 'caption', 'enabled', 'role', 'text', 'children', '*'],
          'ui:compactFields': ['id', 'caption', 'enabled', 'role'],
          text: {
            'ui:widget': 'textarea',
            'ui:options': {
              rows: 4,
            },
          },
          tags: {
            'ui:widget': 'TagsWidget',
          },
        },
      },
    },
  },
  plugins: {
    'ui:options': {
      orderable: true,
      variant: 'info',
    },
    items: {
      'ui:order': ['id', 'caption', 'pluginId', '*'],
      'ui:compactFields': ['id', 'caption', 'pluginId'],
      fullReplacementParam: {
        'ui:field': 'ConditionalField',
        'ui:condition': {
          dependsOn: 'pluginId',
          showWhen: 'fullReplacement',
        },
      },
      dynamicPositionParam: {
        'ui:field': 'ConditionalField',
        'ui:condition': {
          dependsOn: 'pluginId',
          showWhen: 'dynamicPosition',
        },
      },
      retrievalAugmentedGenerationParam: {
        'ui:field': 'ConditionalField',
        'ui:condition': {
          dependsOn: 'pluginId',
          showWhen: 'retrievalAugmentedGeneration',
        },
      },
      modelContextProtocolParam: {
        'ui:field': 'ConditionalField',
        'ui:condition': {
          dependsOn: 'pluginId',
          showWhen: 'modelContextProtocol',
        },
      },
    },
  },
  response: {
    'ui:options': {
      variant: 'success',
    },
    items: {
      'ui:order': ['id', 'enabled', 'type', 'config', '*'],
      'ui:compactFields': ['id', 'enabled', 'type'],
      config: {
        'ui:options': {
          variant: 'info',
        },
      },
    },
  },
  // ...existing code...
};
