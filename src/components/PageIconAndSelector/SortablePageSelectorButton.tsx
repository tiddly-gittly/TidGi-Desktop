import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IPage } from '@services/pages/interface';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getBuildInPageName } from '@services/pages/getBuildInPageName';
import { getBuildInPageIcon } from './getBuildInPageIcon';
import { PageSelectorBase } from './PageSelectorBase';

export interface ISortableItemProps {
  index: number;
  page: IPage;
  pageCount: number;
  showSideBarIcon: boolean;
  showSidebarTexts: boolean;
}

export function SortablePageSelectorButton({ index, page, showSidebarTexts, pageCount, showSideBarIcon }: ISortableItemProps): JSX.Element {
  const { t } = useTranslation();
  const { active, id, type } = page;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };
  const [pageClickedLoading, pageClickedLoadingSetter] = useState(false);
  const onPageClick = useCallback(async () => {
    pageClickedLoadingSetter(true);
    try {
      await window.service.pages.openPage(type);
    } catch (error) {
      if (error instanceof Error) {
        await window.service.native.log('error', error.message);
      }
    }
    pageClickedLoadingSetter(false);
  }, [type]);
  const name = useMemo(() => {
    return getBuildInPageName(type, t);
  }, [type, t]);
  const icon = useMemo(() => {
    return getBuildInPageIcon(type);
  }, [type]);
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <PageSelectorBase
        icon={icon}
        pageClickedLoading={pageClickedLoading}
        pageCount={pageCount}
        showSideBarIcon={showSideBarIcon}
        onClick={onPageClick}
        active={active}
        id={id}
        key={id}
        pageName={name}
        index={index}
        showSidebarTexts={showSidebarTexts}
      />
    </div>
  );
}
