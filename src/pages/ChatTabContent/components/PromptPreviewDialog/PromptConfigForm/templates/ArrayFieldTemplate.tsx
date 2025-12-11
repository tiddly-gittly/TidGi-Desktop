import { closestCenter, DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Box, Typography } from '@mui/material';
import { ArrayFieldTemplateProps } from '@rjsf/utils';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrayAddButton, ArrayContainer, ArrayHeader, ArrayItemCount, EmptyState, HelpTooltip, StyledFieldLabel } from '../components';
import { ArrayItemProvider } from '../context/ArrayItemContext';
import { ExtendedFormContext } from '../index';
import { useArrayFieldStore } from '../store/arrayFieldStore';

/**
 * Enhanced Array Field Template with zustand state management
 * Uses store to manage expanded states independently from RJSF
 */
export const ArrayFieldTemplate: React.FC<ArrayFieldTemplateProps> = (props) => {
  const { items, onAddClick, canAdd, title, schema, registry } = props;
  const formData = props.formData as unknown[] | undefined;
  const fieldPathId = (props as unknown as { fieldPathId?: { path: (string | number)[] } }).fieldPathId;
  const { t } = useTranslation('agent');

  // Get formContext for direct data manipulation
  const formContext = registry.formContext as ExtendedFormContext | undefined;

  const description = schema.description;

  // Generate a stable field path for this array
  // Use title as fallback since idSchema might not be available
  const fieldPath = useMemo(() => title || 'array', [title]);

  // Get store actions and state
  const initializeField = useArrayFieldStore((state) => state.initializeField);
  const updateItemsData = useArrayFieldStore((state) => state.updateItemsData);
  const cleanupField = useArrayFieldStore((state) => state.cleanupField);

  // Track active drag item for overlay
  const [activeId, setActiveId] = useState<string | null>(null);

  // Initialize store when component mounts or items change
  useEffect(() => {
    const itemsData = Array.isArray(formData) ? formData : [];
    initializeField(fieldPath, items.length, itemsData);
  }, [fieldPath, items.length, initializeField]);

  // Update store when formData changes
  useEffect(() => {
    const itemsData = Array.isArray(formData) ? formData : [];
    updateItemsData(fieldPath, itemsData);
  }, [formData, fieldPath, updateItemsData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupField(fieldPath);
    };
  }, [fieldPath, cleanupField]);

  // dnd-kit sensors with activation constraint
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  // Generate stable IDs for sortable items
  const itemIds = useMemo(() => {
    return items.map((_, index) => `item-${index}`);
  }, [items.length]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = Number.parseInt(String(active.id).replace('item-', ''), 10);
    const newIndex = Number.parseInt(String(over.id).replace('item-', ''), 10);

    if (Number.isNaN(oldIndex) || Number.isNaN(newIndex)) return;
    if (!formData || !formContext?.onFormDataChange || !formContext.rootFormData) return;

    // Use arrayMove from dnd-kit to reorder the array
    const newArrayData = arrayMove([...formData], oldIndex, newIndex);

    // Update the root form data with the reordered array
    // Navigate to the array location using fieldPathId.path
    const path = fieldPathId?.path;
    if (!path || path.length === 0) {
      // If no path, this array is the root (unlikely but handle it)
      formContext.onFormDataChange(newArrayData as never);
      return;
    }

    // Deep clone and update the nested array
    const newRootData = structuredClone(formContext.rootFormData);
    let current: Record<string, unknown> = newRootData;
    
    // Navigate to parent of the array
    for (let pathIndex = 0; pathIndex < path.length - 1; pathIndex++) {
      const key = path[pathIndex];
      current = current[key] as Record<string, unknown>;
    }
    
    // Set the array at the final path segment
    const finalKey = path[path.length - 1];
    current[finalKey] = newArrayData;

    formContext.onFormDataChange(newRootData as never);
  }, [formData, formContext, fieldPathId]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  // Find active item for drag overlay
  const activeItem = useMemo(() => {
    if (!activeId) return null;
    const activeIndex = Number.parseInt(activeId.replace('item-', ''), 10);
    if (Number.isNaN(activeIndex)) return null;
    return items[activeIndex];
  }, [activeId, items]);

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
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {items.map((item, index) => {
                  const itemData = formData?.[index];
                  
                  return (
                    <ArrayItemProvider
                      key={itemIds[index]}
                      isInArrayItem
                      arrayItemCollapsible
                      itemData={itemData}
                      itemIndex={index}
                      arrayFieldPath={fieldPath}
                    >
                      {item}
                    </ArrayItemProvider>
                  );
                })}
              </Box>
            </SortableContext>
            <DragOverlay>
              {activeItem
                ? (
                  <Box
                    sx={{
                      opacity: 0.9,
                      cursor: 'grabbing',
                      transform: 'rotate(2deg)',
                    }}
                  >
                    {activeItem}
                  </Box>
                )
                : null}
            </DragOverlay>
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
