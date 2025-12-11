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
  const moveItem = useArrayFieldStore((state) => state.moveItem);
  // Get stable item IDs from store - these persist across re-renders
  const stableItemIds = useArrayFieldStore((state) => state.stableItemIds[fieldPath] ?? []);
  // Get items order from store - used for optimistic rendering during drag
  const itemsOrder = useArrayFieldStore((state) => state.itemsOrder[fieldPath] ?? []);

  // Track active drag item for overlay
  const [activeId, setActiveId] = useState<string | null>(null);

  // Initialize store when component mounts or items change
  useEffect(() => {
    const itemsData = Array.isArray(formData) ? formData : [];
    initializeField(fieldPath, items.length, itemsData);
  }, [fieldPath, items.length, initializeField]);

  // Update store when formData changes (from RJSF)
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

  // Use stable IDs from store, fallback to index-based IDs if store not initialized yet
  const itemIds = useMemo(() => {
    if (stableItemIds.length === items.length) {
      return stableItemIds;
    }
    // Fallback during initialization
    return items.map((_, index) => `item-${index}`);
  }, [stableItemIds, items.length]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    // Find indices by looking up the stable IDs
    const oldIndex = itemIds.indexOf(String(active.id));
    const newIndex = itemIds.indexOf(String(over.id));

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    if (!formData || !formContext?.onFormDataChange || !formContext.rootFormData) {
      return;
    }

    // IMPORTANT: Update store state FIRST (synchronously) for optimistic rendering
    // This moves stableItemIds, expandedStates, and itemsOrder together
    // The component will immediately re-render with the new order, avoiding the
    // ~500-700ms delay while waiting for RJSF to update formData
    moveItem(fieldPath, oldIndex, newIndex);

    // Create the new array data with reordered items
    const newArrayData = arrayMove([...formData], oldIndex, newIndex);

    // Update the root form data with the reordered array
    // This triggers RJSF to re-render, but the UI already shows the new order
    // thanks to the optimistic update above
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
  }, [formData, formContext, fieldPathId, itemIds, moveItem, fieldPath]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  // Find active item for drag overlay using stable IDs
  const activeItem = useMemo(() => {
    if (!activeId) return null;
    const activeIndex = itemIds.indexOf(activeId);
    if (activeIndex === -1) return null;
    return items[activeIndex];
  }, [activeId, items, itemIds]);

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
                {itemsOrder.map((originalIndex, renderPosition) => {
                  // itemsOrder[renderPosition] tells us which original item should be at this position
                  // This enables optimistic rendering - store updates immediately, RJSF updates later
                  const item = items[originalIndex];
                  const itemData = formData?.[originalIndex];
                  const stableId = itemIds[renderPosition];

                  if (!item) return null;

                  return (
                    <ArrayItemProvider
                      key={stableId}
                      isInArrayItem
                      arrayItemCollapsible
                      itemData={itemData}
                      itemIndex={renderPosition}
                      arrayFieldPath={fieldPath}
                      arrayFieldPathSegments={fieldPathId?.path}
                    >
                      {item}
                    </ArrayItemProvider>
                  );
                })}
              </Box>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
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
