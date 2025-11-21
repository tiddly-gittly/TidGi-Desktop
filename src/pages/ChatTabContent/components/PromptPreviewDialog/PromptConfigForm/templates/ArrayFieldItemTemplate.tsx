import DragHandleIcon from '@mui/icons-material/DragHandle';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, IconButton } from '@mui/material';
import { ArrayFieldItemTemplateProps, FormContextType, getTemplate, getUiOptions, RJSFSchema } from '@rjsf/utils';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrayItemProvider } from '../context/ArrayItemContext';

/**
 * Custom Array Field Item Template with collapse and drag-and-drop support
 * In RJSF 6.x, this template is called by ArrayField to render each item
 */
export function ArrayFieldItemTemplate<T = unknown, S extends RJSFSchema = RJSFSchema, F extends FormContextType = FormContextType>(
  props: ArrayFieldItemTemplateProps<T, S, F>,
): React.ReactElement {
  const { children, index, hasToolbar, buttonsProps, registry, uiSchema } = props;
  const { t } = useTranslation('agent');
  const [expanded, setExpanded] = useState(false);

  const handleToggleExpanded = useCallback(() => {
    setExpanded((previous) => !previous);
  }, []);

  // Get the ArrayFieldItemButtonsTemplate to render buttons
  const uiOptions = getUiOptions<T, S, F>(uiSchema);
  const ArrayFieldItemButtonsTemplate = getTemplate<'ArrayFieldItemButtonsTemplate', T, S, F>(
    'ArrayFieldItemButtonsTemplate',
    registry,
    uiOptions,
  );

  return (
    <ArrayItemProvider isInArrayItem arrayItemCollapsible>
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          mb: 1,
          overflow: 'hidden',
        }}
      >
        {/* Header with controls */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1,
            bgcolor: 'background.default',
            borderBottom: expanded ? '1px solid' : 'none',
            borderColor: 'divider',
          }}
        >
          {/* Drag handle */}
          <Box
            sx={{
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              color: 'text.secondary',
              '&:active': { cursor: 'grabbing' },
            }}
          >
            <DragHandleIcon fontSize='small' />
          </Box>

          {/* Item title */}
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              component='span'
              sx={{
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'text.primary',
              }}
            >
              {t('PromptConfig.ItemIndex', { index: index + 1 })}
            </Box>
          </Box>

          {/* Expand/collapse button */}
          <IconButton
            size='small'
            onClick={handleToggleExpanded}
            title={expanded ? t('PromptConfig.Collapse') : t('PromptConfig.Expand')}
            sx={{ color: 'text.secondary' }}
          >
            {expanded ? <ExpandLessIcon fontSize='small' /> : <ExpandMoreIcon fontSize='small' />}
          </IconButton>

          {/* Action buttons (remove, move up/down, etc.) */}
          {hasToolbar && <ArrayFieldItemButtonsTemplate {...buttonsProps} />}
        </Box>

        {/* Content */}
        {expanded && (
          <Box sx={{ p: 2 }}>
            {children}
          </Box>
        )}
      </Box>
    </ArrayItemProvider>
  );
}
