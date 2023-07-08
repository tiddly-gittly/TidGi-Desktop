import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { IPage } from '@services/pages/interface';
import { SortablePageSelectorButton } from './SortablePageSelectorButton';

export interface ISortableListProps {
  pagesList: IPage[];
  showSideBarIcon: boolean;
  showSideBarText: boolean;
}

export function SortablePageSelectorList({ pagesList, showSideBarText, showSideBarIcon }: ISortableListProps): JSX.Element {
  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const pageIDs = pagesList?.map((page) => page.id) ?? [];

  return (
    <DndContext
      sensors={dndSensors}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={async ({ active, over }) => {
        if (over === null || active.id === over.id) return;
        const oldIndex = pageIDs.indexOf(active.id);
        const newIndex = pageIDs.indexOf(over.id);

        const newPagesList = arrayMove(pagesList, oldIndex, newIndex);
        const newPages: Record<string, IPage> = {};
        newPagesList.forEach((page, index) => {
          newPages[page.id] = page;
          newPages[page.id].order = index;
        });

        await window.service.pages.setPages(newPages);
      }}
    >
      <SortableContext items={pageIDs} strategy={verticalListSortingStrategy}>
        {pagesList
          .sort((a, b) => a.order - b.order)
          .map((page, index) => (
            <SortablePageSelectorButton
              key={`item-${page.id}`}
              index={index}
              page={page}
              showSidebarTexts={showSideBarText}
              showSideBarIcon={showSideBarIcon}
            />
          ))}
      </SortableContext>
    </DndContext>
  );
}
