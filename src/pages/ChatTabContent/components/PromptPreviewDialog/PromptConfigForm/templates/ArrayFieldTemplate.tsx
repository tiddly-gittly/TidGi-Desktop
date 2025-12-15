import { closestCenter, DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Box, Typography } from '@mui/material';
import { ArrayFieldTemplateProps } from '@rjsf/utils';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
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
  const fieldPathId = (props as unknown as { fieldPathId?: { path: (string | number)[]; $id?: string } }).fieldPathId;
  const { t } = useTranslation('agent');

  // Get formContext for direct data manipulation
  const formContext = registry.formContext as ExtendedFormContext | undefined;

  const description = schema.description;

  // Generate a stable field path for this array
  // Use fieldPathId from RJSF which contains the actual property path
  const fieldPath = useMemo(() => {
    // First try to use fieldPathId which contains the actual path like ["prompts"] or ["prompts", 0, "children"]
    if (fieldPathId?.path && Array.isArray(fieldPathId.path) && fieldPathId.path.length > 0) {
      return fieldPathId.path.join('_');
    }
    // Fallback to fieldPathId.$id with root_ prefix removed
    if (fieldPathId?.$id) {
      return fieldPathId.$id.replace(/^root_/, '');
    }
    return title || 'array';
  }, [fieldPathId?.path, fieldPathId?.$id, title]);

  // Get ALL store data and functions in one subscription to avoid multiple subscriptions
  // Use useShallow to prevent unnecessary re-renders when the returned object has the same values
  const {
    initializeField,
    updateItemsData,
    cleanupField,
    moveItem,
    stableItemIds: allStableItemIds,
    itemsOrder: allItemsOrder,
  } = useArrayFieldStore(
    useShallow((state) => ({
      initializeField: state.initializeField,
      updateItemsData: state.updateItemsData,
      cleanupField: state.cleanupField,
      moveItem: state.moveItem,
      stableItemIds: state.stableItemIds,
      itemsOrder: state.itemsOrder,
    })),
  );

  // Get data for this specific fieldPath
  const stableItemIds = allStableItemIds[fieldPath] ?? [];
  const itemsOrder = allItemsOrder[fieldPath] ?? [];

  // Track active drag item for overlay
  const [activeId, setActiveId] = useState<string | null>(null);

  // Initialize store when component mounts or items change
  useEffect(() => {
    const itemsData = Array.isArray(formData) ? formData : [];
    initializeField(fieldPath, items.length, itemsData);
  }, [fieldPath, items.length, initializeField]);

  // Update store when formData changes (from RJSF)
  // Use ref to track previous formData and only update when content actually changes
  const previousFormDataReference = React.useRef<unknown[] | undefined>(undefined);
  const previousLengthReference = React.useRef<number>(-1);

  useEffect(() => {
    const itemsData = Array.isArray(formData) ? formData : [];
    const currentLength = itemsData.length;

    // Only update if:
    // 1. This is the first render (previousLengthReference.current === -1)
    // 2. Length changed
    // 3. Content changed (only check if length is the same)
    if (previousLengthReference.current === -1 || previousLengthReference.current !== currentLength) {
      previousFormDataReference.current = itemsData;
      previousLengthReference.current = currentLength;
      updateItemsData(fieldPath, itemsData);
    } else if (previousFormDataReference.current) {
      // Length is the same, do a shallow comparison of items
      let hasChanged = false;
      for (let itemIndex = 0; itemIndex < itemsData.length; itemIndex++) {
        if (itemsData[itemIndex] !== previousFormDataReference.current[itemIndex]) {
          hasChanged = true;
          break;
        }
      }
      if (hasChanged) {
        previousFormDataReference.current = itemsData;
        updateItemsData(fieldPath, itemsData);
      }
    }
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
