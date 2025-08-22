import { closestCenter, DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrayFieldItemTemplateType } from '@rjsf/utils';
import React, { useState } from 'react';

interface DragAndDropProviderProps {
  /** Array items to be sortable */
  items: ArrayFieldItemTemplateType[];
  /** Callback when items are reordered */
  onReorder: (activeIndex: number, overIndex: number) => void;
  /** Children components that will be draggable */
  children: React.ReactNode;
}

/**
 * Drag and drop provider for array items
 * Features:
 * - Keyboard and pointer sensor support
 * - Visual drag overlay
 * - Accessible drag and drop
 */
export const DragAndDropProvider: React.FC<DragAndDropProviderProps> = ({
  items,
  onReorder,
  children,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const activeIndex = items.findIndex(item => item.key === active.id);
      const overIndex = items.findIndex(item => item.key === over.id);

      if (activeIndex !== -1 && overIndex !== -1) {
        onReorder(activeIndex, overIndex);
      }
    }

    setActiveId(null);
  };

  const activeItem = items.find(item => item.key === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map(item => item.key)}
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>

      <DragOverlay>
        {activeItem
          ? (
            <div style={{ opacity: 0.5 }}>
              {activeItem.children}
            </div>
          )
          : null}
      </DragOverlay>
    </DndContext>
  );
};
