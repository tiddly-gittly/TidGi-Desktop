import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Box, Typography } from '@mui/material';
import { ArrayFieldTemplateProps } from '@rjsf/utils';
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrayAddButton, ArrayContainer, ArrayHeader, ArrayItemCount, EmptyState, HelpTooltip, StyledFieldLabel } from '../components';
import { ArrayItemProvider } from '../context/ArrayItemContext';

/**
 * Enhanced Array Field Template
 * In RJSF 6.x, items are pre-rendered ReactElements, so we just display them
 * The drag-and-drop and collapse logic is handled in ArrayFieldItemTemplate
 */
export const ArrayFieldTemplate: React.FC<ArrayFieldTemplateProps> = (props) => {
  const { items, onAddClick, canAdd, title, schema, formData } = props;
  const { t } = useTranslation('agent');

  const description = schema.description;

  // Store the reordering callbacks for dnd
  const itemCallbacksRef = useRef<Map<number, { onMoveUp: () => void; onMoveDown: () => void }>>(new Map());

  // dnd-kit sensors with activation constraint
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  // Generate stable IDs for sortable items
  const itemIds = useMemo(() => items.map((_, index) => `item-${index}`), [items.length]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = Number.parseInt(String(active.id).replace('item-', ''), 10);
    const newIndex = Number.parseInt(String(over.id).replace('item-', ''), 10);

    if (Number.isNaN(oldIndex) || Number.isNaN(newIndex)) return;

    // Use RJSF's move callbacks to maintain form state consistency
    const callbacks = itemCallbacksRef.current.get(oldIndex);
    if (!callbacks) return;

    const steps = Math.abs(oldIndex - newIndex);
    for (let i = 0; i < steps; i += 1) {
      if (oldIndex < newIndex) {
        callbacks.onMoveDown();
      } else {
        callbacks.onMoveUp();
      }
    }
  }, []);

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
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {Array.isArray(formData)
                  ? items.map((item, index) => (
                    <ArrayItemProvider
                      key={itemIds[index]}
                      isInArrayItem
                      arrayItemCollapsible
                      itemData={formData[index]}
                      itemIndex={index}
                    >
                      {React.cloneElement(item as React.ReactElement)}
                    </ArrayItemProvider>
                  ))
                  : items}
              </Box>
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
