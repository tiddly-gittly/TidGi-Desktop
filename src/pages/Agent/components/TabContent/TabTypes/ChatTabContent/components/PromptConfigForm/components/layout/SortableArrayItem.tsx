import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DeleteIcon from '@mui/icons-material/Delete';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import { ArrayFieldItemTemplateType, FormContextType, RJSFSchema } from '@rjsf/utils';
import React, { useState } from 'react';
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

  const handleToggleExpanded = () => {
    setExpanded(!expanded);
  };

  // Debug: logging item for development purposes
  console.log(`item`, item);

  return (
    <div ref={setNodeRef} style={style}>
      <ArrayItemCard $isDragging={isDragging}>
        <ArrayItemHeader>
          <DragHandle {...attributes} {...listeners}>
            <DragHandleIcon fontSize='small' />
          </DragHandle>

          <ArrayItemTitle>
            {itemData && typeof itemData === 'object' && 'caption' in itemData ? (itemData as { caption: string }).caption : ''}
          </ArrayItemTitle>

          {isCollapsible && (
            <StyledExpandButton onClick={handleToggleExpanded}>
              {expanded ? <CollapseIcon /> : <ExpandIcon />}
            </StyledExpandButton>
          )}

          {item.buttonsProps.hasRemove && (
            <StyledDeleteButton
              onClick={item.buttonsProps.onDropIndexClick(item.index)}
              size='small'
              title={t('PromptConfig.RemoveItem', {
                defaultValue: 'Remove item',
              })}
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
