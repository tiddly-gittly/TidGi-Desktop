import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DeleteIcon from '@mui/icons-material/Delete';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import { ArrayFieldItemTemplateType, FormContextType, RJSFSchema } from '@rjsf/utils';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrayItemProvider } from '../../context/ArrayItemContext';
import { StyledDeleteButton } from '../controls';
import { ArrayItemCard, ArrayItemHeader, ArrayItemTitle, DragHandle, ItemContent } from './StyledArrayContainer';
import { CollapseIcon, ExpandIcon, StyledCollapse, StyledExpandButton } from './StyledCollapsible';

/** Interface for sortable array item component props */
export interface SortableArrayItemProps<T = unknown, S extends RJSFSchema = RJSFSchema, F extends FormContextType = FormContextType> {
  /** Array item data from RJSF */
  item: ArrayFieldItemTemplateType<T, S, F>;
  /** Index of this item in the array */
  index: number;
  /** Whether the item should be collapsible */
  isCollapsible?: boolean;
  /** Actual form data for this array item */
  itemData?: unknown;
}

/**
 * A sortable array item component with drag-and-drop functionality
 * Features:
 * - Drag handle for reordering
 * - Item title with index
 * - Delete button
 * - Collapse/expand toggle (when isCollapsible is true)
 * - Visual feedback when dragging
 */
export const SortableArrayItem = <T = unknown, S extends RJSFSchema = RJSFSchema, F extends FormContextType = FormContextType>({
  item,
  index,
  isCollapsible = true,
  itemData,
}: SortableArrayItemProps<T, S, F>) => {
  const { t } = useTranslation('agent');
  const [expanded, setExpanded] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.key,
    data: {
      type: 'array-item',
      index,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleToggleExpanded = useCallback(() => {
    setExpanded(!expanded);
  }, [expanded]);

  const handleHeaderClick = useCallback((event: React.MouseEvent) => {
    // Check if click target is clickable area (exclude buttons and drag handle)
    const target = event.target as HTMLElement;

    // Skip if clicking buttons or drag handle
    if (target.closest('button') || target.closest('[data-drag-handle]')) {
      return;
    }

    // Only handle click in collapsible mode
    if (isCollapsible) {
      handleToggleExpanded();
    }
  }, [isCollapsible, handleToggleExpanded]);

  const handleDeleteClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent event bubbling to header
    item.buttonsProps.onDropIndexClick(item.index)();
  }, [item.buttonsProps, item.index]);

  return (
    <div ref={setNodeRef} style={style}>
      <ArrayItemCard $isDragging={isDragging}>
        <ArrayItemHeader
          onClick={isCollapsible ? handleHeaderClick : undefined}
          $isCollapsible={isCollapsible}
        >
          <DragHandle {...attributes} {...listeners} data-drag-handle>
            <DragHandleIcon fontSize='small' />
          </DragHandle>

          <ArrayItemTitle sx={{ flex: 1 }}>
            {itemData && typeof itemData === 'object' && 'caption' in itemData ? (itemData as { caption: string }).caption : ''}
          </ArrayItemTitle>

          {isCollapsible && (
            <StyledExpandButton onClick={handleToggleExpanded}>
              {expanded ? <CollapseIcon /> : <ExpandIcon />}
            </StyledExpandButton>
          )}

          {item.buttonsProps.hasRemove && (
            <StyledDeleteButton
              onClick={handleDeleteClick}
              size='small'
              title={t('PromptConfig.RemoveItem')}
            >
              <DeleteIcon fontSize='small' />
            </StyledDeleteButton>
          )}
        </ArrayItemHeader>

        <StyledCollapse in={expanded} timeout='auto' unmountOnExit>
          <ItemContent>
            <ArrayItemProvider isInArrayItem={true} arrayItemCollapsible={isCollapsible}>
              {item.children}
            </ArrayItemProvider>
          </ItemContent>
        </StyledCollapse>
      </ArrayItemCard>
    </div>
  );
};
