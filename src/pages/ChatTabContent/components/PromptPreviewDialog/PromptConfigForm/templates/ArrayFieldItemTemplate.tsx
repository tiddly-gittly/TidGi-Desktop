import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, IconButton } from '@mui/material';
import { ArrayFieldItemTemplateProps, FormContextType, getTemplate, getUiOptions, RJSFSchema } from '@rjsf/utils';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrayItemProvider, useArrayItemContext } from '../context/ArrayItemContext';

/**
 * Custom Array Field Item Template with collapse and dnd-kit drag-and-drop support
 * In RJSF 6.x, this template is called by ArrayField to render each item
 */
export function ArrayFieldItemTemplate<T = unknown, S extends RJSFSchema = RJSFSchema, F extends FormContextType = FormContextType>(
  props: ArrayFieldItemTemplateProps<T, S, F>,
): React.ReactElement {
  const { children, index, hasToolbar, buttonsProps, registry, uiSchema } = props;
  const { t } = useTranslation('agent');
  const [expanded, setExpanded] = useState(false);

  // 从 context 获取当前项的数据
  const { itemData } = useArrayItemContext();

  // Use dnd-kit sortable
  const sortableId = `item-${index}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });

  // Store callbacks for dnd-kit to use
  useEffect(() => {
    // Store the callbacks on a data attribute so parent can access them
    if (setNodeRef) {
      const element = document.getElementById(sortableId);
      if (element) {
        (element as any).__rjsfMoveUp = buttonsProps.onMoveUpItem;
        (element as any).__rjsfMoveDown = buttonsProps.onMoveDownItem;
      }
    }
  }, [buttonsProps.onMoveUpItem, buttonsProps.onMoveDownItem, sortableId]);

  const handleToggleExpanded = useCallback(() => {
    setExpanded((previous) => !previous);
  }, []);

  // 获取当前项的数据来显示 caption
  const itemCaption = useMemo(() => {
    if (itemData && typeof itemData === 'object') {
      const data = itemData as Record<string, unknown>;
      return data.caption || data.title || '';
    }
    return '';
  }, [itemData]);

  // Get the ArrayFieldItemButtonsTemplate to render buttons
  const uiOptions = getUiOptions<T, S, F>(uiSchema);
  const ArrayFieldItemButtonsTemplate = getTemplate<'ArrayFieldItemButtonsTemplate', T, S, F>(
    'ArrayFieldItemButtonsTemplate',
    registry,
    uiOptions,
  );

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <Box
      id={sortableId}
      ref={setNodeRef}
      style={style}
      sx={{
        border: '1px solid',
        borderColor: isDragging ? 'primary.main' : 'divider',
        borderRadius: 1,
        mb: 1,
        overflow: 'hidden',
        opacity: isDragging ? 0.5 : 1,
        transition: (theme) =>
          theme.transitions.create(['border-color', 'opacity'], {
            duration: theme.transitions.duration.short,
          }),
      }}
    >
      {/* Header with controls */}
      <Box
        onClick={handleToggleExpanded}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          bgcolor: 'background.default',
          borderBottom: expanded ? '1px solid' : 'none',
          borderColor: 'divider',
          cursor: 'pointer',
          userSelect: 'none',
          transition: (theme) =>
            theme.transitions.create(['background-color'], {
              duration: theme.transitions.duration.short,
            }),
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
      >
        {/* Drag handle */}
        <Box
          {...attributes}
          {...listeners}
          sx={{
            cursor: isDragging ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            color: 'text.secondary',
            flexShrink: 0,
            padding: 0.5,
          }}
        >
          <DragHandleIcon fontSize='small' />
        </Box>

        {/* Item title - 显示 caption 或 index */}
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            component='span'
            sx={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'text.primary',
            }}
          >
            {itemCaption || t('PromptConfig.ItemIndex', { index: index + 1 })}
          </Box>
        </Box>

        {/* Expand/collapse button */}
        <IconButton
          size='small'
          onClick={(event) => {
            event.stopPropagation();
            handleToggleExpanded();
          }}
          title={expanded ? t('PromptConfig.Collapse') : t('PromptConfig.Expand')}
          sx={{ color: 'text.secondary' }}
        >
          {expanded ? <ExpandLessIcon fontSize='small' /> : <ExpandMoreIcon fontSize='small' />}
        </IconButton>

        {/* Action buttons (remove, move up/down, etc.) */}
        {hasToolbar && (
          <Box onClick={(event) => event.stopPropagation()}>
            <ArrayFieldItemButtonsTemplate {...buttonsProps} />
          </Box>
        )}
      </Box>

      {/* Content */}
      {expanded && (
        <Box sx={{ p: 2 }}>
          <ArrayItemProvider isInArrayItem arrayItemCollapsible itemData={itemData} itemIndex={index}>
            {children}
          </ArrayItemProvider>
        </Box>
      )}
    </Box>
  );
}

