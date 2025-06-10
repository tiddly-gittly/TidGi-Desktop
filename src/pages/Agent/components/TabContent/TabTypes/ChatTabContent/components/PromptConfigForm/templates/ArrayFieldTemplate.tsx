/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Box, Typography } from '@mui/material';
import { ArrayFieldTemplateProps } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrayAddButton, ArrayContainer, ArrayHeader, ArrayItemCount, EmptyState, HelpTooltip, SortableArrayItem, StyledFieldLabel } from '../components';

/**
 * Enhanced Array Field Template with drag-and-drop functionality
 */
export const ArrayFieldTemplate: React.FC<ArrayFieldTemplateProps> = (props) => {
  const { items, onAddClick, canAdd, title, schema, formData, idSchema } = props;
  const { t } = useTranslation('agent');

  const arrayPath = idSchema.$id.replace(/^root_/, '');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeIndex = items.findIndex((item) => item.key === active.id);
    const overIndex = items.findIndex((item) => item.key === over.id);
    if (activeIndex !== overIndex && activeIndex !== -1 && overIndex !== -1) {
      const activeItem = items[activeIndex];
      activeItem.buttonsProps.onReorderClick(activeIndex, overIndex)();
    }
  };

  const description = schema.description;
  const itemIds = items.map((item) => item.key);

  // Check if array items should be collapsible
  // For now, enable collapsible for all array items with object content
  const isItemsCollapsible = true;

  return (
    <ArrayContainer>
      {title && (
        <ArrayHeader>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <StyledFieldLabel component='h3' variant='subtitle1'>
              {t(title)}
            </StyledFieldLabel>
            {typeof description === 'string' && description && <HelpTooltip description={description} />}
          </Box>
          {items.length > 0 && <ArrayItemCount>{t('PromptConfig.ItemCount', { count: items.length })}</ArrayItemCount>}
        </ArrayHeader>
      )}

      {canAdd && items.length > 0 && (
        <ArrayAddButton
          onAddClick={onAddClick}
          variant='top'
        />
      )}

      {items.length === 0
        ? (
          <EmptyState>
            <Typography variant='body2'>{t('PromptConfig.EmptyArray')}</Typography>
          </EmptyState>
        )
        : (
          <DndContext
            sensors={sensors}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              {items.map((item, index) => {
                const semanticPath = [...arrayPath.split('_'), index.toString()];
                return (
                  <SortableArrayItem
                    key={item.key}
                    item={item}
                    index={index}
                    isCollapsible={isItemsCollapsible}
                    itemData={Array.isArray(formData) ? formData[index] : undefined}
                    semanticPath={semanticPath}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}

      {canAdd && (
        <ArrayAddButton
          onAddClick={onAddClick}
          variant={items.length === 0 ? 'top' : 'default'}
        />
      )}
    </ArrayContainer>
  );
};
