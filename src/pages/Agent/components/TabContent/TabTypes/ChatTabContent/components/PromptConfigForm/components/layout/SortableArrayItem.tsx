import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DeleteIcon from '@mui/icons-material/Delete';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import { ArrayFieldItemTemplateType } from '@rjsf/utils';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrayItemProvider } from '../../context/ArrayItemContext';
import { StyledDeleteButton } from '../controls';
import { ArrayItemCard, ArrayItemHeader, ArrayItemTitle, DragHandle, ItemContent } from './StyledArrayContainer';
import { CollapseIcon, ExpandIcon, StyledCollapse, StyledExpandButton } from './StyledCollapsible';

interface SortableArrayItemProps {
  /** The array item data from RJSF */
  item: ArrayFieldItemTemplateType;
  /** The index of this item in the array */
  index: number;
  /** Whether the item should be collapsible */
  isCollapsible?: boolean;
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
export const SortableArrayItem: React.FC<SortableArrayItemProps> = ({ item, index, isCollapsible = true }) => {
  const { t } = useTranslation('agent');
  const [expanded, setExpanded] = useState(true);

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

  return (
    <div ref={setNodeRef} style={style}>
      <ArrayItemCard $isDragging={isDragging}>
        <ArrayItemHeader>
          <DragHandle {...attributes} {...listeners}>
            <DragHandleIcon fontSize='small' />
          </DragHandle>

          <ArrayItemTitle>
            {t('PromptConfig.ArrayItem', {
              defaultValue: '项目 {{index}}',
              index: index + 1,
            })}
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
                defaultValue: '删除项目',
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
