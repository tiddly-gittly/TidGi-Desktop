import { defaultAnimateLayoutChanges, useSortable } from '@dnd-kit/sortable';
import type { AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, Checkbox, IconButton } from '@mui/material';
import { ArrayFieldItemTemplateProps, FormContextType, getTemplate, getUiOptions, RJSFSchema } from '@rjsf/utils';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { ArrayItemProvider, useArrayItemContext } from '../context/ArrayItemContext';
import { ExtendedFormContext } from '../index';
import { useArrayFieldStore } from '../store/arrayFieldStore';

/**
 * Custom animateLayoutChanges that always animates when wasDragging is true.
 * This ensures smooth transitions after drag ends when items are reordered.
 */
const animateLayoutChanges: AnimateLayoutChanges = (arguments_) => defaultAnimateLayoutChanges({ ...arguments_, wasDragging: true });

/**
 * Custom Array Field Item Template with collapse and dnd-kit drag-and-drop support
 * Uses zustand store for state management to avoid re-render flashing
 */
export function ArrayFieldItemTemplate<T = unknown, S extends RJSFSchema = RJSFSchema, F extends FormContextType = FormContextType>(
  props: ArrayFieldItemTemplateProps<T, S, F>,
): React.ReactElement {
  const { children, index, hasToolbar, buttonsProps, registry, uiSchema } = props;
  const { t } = useTranslation('agent');
  const formContext = registry.formContext as ExtendedFormContext | undefined;

  // Get item context - includes the stable fieldPath from parent ArrayFieldTemplate
  const arrayItemContext = useArrayItemContext();
  const { itemData } = arrayItemContext;

  // Use arrayFieldPath from context (set by parent ArrayFieldTemplate)
  // This ensures consistent path between template and item
  const fieldPath = arrayItemContext.arrayFieldPath ?? 'array';

  // Get ALL relevant store data in one subscription
  // Use useShallow to prevent unnecessary re-renders
  const {
    expandedStates,
    stableItemIds: allStableItemIds,
    setItemExpanded,
    registerMoveCallbacks,
  } = useArrayFieldStore(
    useShallow((state) => ({
      expandedStates: state.expandedStates,
      stableItemIds: state.stableItemIds,
      setItemExpanded: state.setItemExpanded,
      registerMoveCallbacks: state.registerMoveCallbacks,
    })),
  );

  // Get data for this specific item
  const expanded = expandedStates[fieldPath]?.[index] ?? false;
  const stableItemId = allStableItemIds[fieldPath]?.[index] ?? `item-${index}`;

  // Register move callbacks so they can be accessed during drag operations
  useEffect(() => {
    if (buttonsProps.hasMoveUp || buttonsProps.hasMoveDown) {
      registerMoveCallbacks(fieldPath, index, {
        onMoveUp: buttonsProps.onMoveUpItem,
        onMoveDown: buttonsProps.onMoveDownItem,
      });
    }
  }, [fieldPath, index, buttonsProps.onMoveUpItem, buttonsProps.onMoveDownItem, buttonsProps.hasMoveUp, buttonsProps.hasMoveDown, registerMoveCallbacks]);

  // Use dnd-kit sortable with stable ID from store
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stableItemId,
    animateLayoutChanges,
  });

  const handleToggleExpanded = useCallback(() => {
    setItemExpanded(fieldPath, index, !expanded);
  }, [fieldPath, index, expanded, setItemExpanded]);

  // 获取当前项的数据来显示 caption
  const itemCaption = useMemo(() => {
    if (itemData && typeof itemData === 'object') {
      const data = itemData as Record<string, unknown>;
      const caption = data.caption || data.title || '';
      return typeof caption === 'string' ? caption : '';
    }
    return '';
  }, [itemData]);

  const itemEnabled = useMemo(() => (itemData as Record<string, unknown> | undefined)?.enabled !== false, [itemData]);

  const handleToggleEnabled = useCallback(() => {
    const pathSegments: Array<string | number> | null = Array.isArray(arrayItemContext.arrayFieldPathSegments)
      ? (arrayItemContext.arrayFieldPathSegments)
      : null;
    if (!formContext?.onFormDataChange || !formContext.rootFormData || !pathSegments || pathSegments.length === 0 || index === undefined) {
      return;
    }

    const newRootData = structuredClone(formContext.rootFormData);
    let parent: Record<string | number, unknown> | undefined = newRootData as Record<string | number, unknown>;
    for (let pathIndex = 0; pathIndex < pathSegments.length - 1; pathIndex += 1) {
      parent = parent?.[pathSegments[pathIndex]] as Record<string | number, unknown> | undefined;
      if (!parent) return;
    }

    const arrayKey = pathSegments[pathSegments.length - 1];
    const targetArray = Array.isArray(parent?.[arrayKey]) ? [...(parent?.[arrayKey] as unknown[])] : undefined;
    if (!targetArray || targetArray[index] === undefined) {
      return;
    }

    const currentItem = { ...(targetArray[index] as Record<string, unknown> ?? {}) };
    currentItem.enabled = !itemEnabled;
    targetArray[index] = currentItem;
    parent[arrayKey] = targetArray;

    formContext.onFormDataChange(newRootData as never);
  }, [arrayItemContext.arrayFieldPathSegments, formContext, index, itemEnabled]);

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
      id={stableItemId}
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

        <Checkbox
          size='small'
          checked={itemEnabled}
          onChange={handleToggleEnabled}
          onClick={(event) => {
            event.stopPropagation();
          }}
          slotProps={{ input: { 'aria-label': t('Prompt.Enabled') } }}
          sx={{ p: 0.5, mr: 0.5 }}
        />

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
          <Box
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
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
