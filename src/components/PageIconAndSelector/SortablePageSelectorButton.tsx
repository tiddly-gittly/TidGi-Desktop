import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IPage } from '@services/pages/interface';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';

import { getBuildInPageName } from '@services/pages/getBuildInPageName';
import { WindowNames } from '@services/windows/WindowProperties';
import { getBuildInPageIcon } from './getBuildInPageIcon';
import { PageSelectorBase } from './PageSelectorBase';

export interface ISortableItemProps {
  index: number;
  page: IPage;
  showSideBarIcon: boolean;
  showSidebarTexts: boolean;
}

export function SortablePageSelectorButton({ index, page, showSidebarTexts, showSideBarIcon }: ISortableItemProps): JSX.Element {
  const { t } = useTranslation();
  const { active, id, type } = page;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };
  const [pageClickedLoading, pageClickedLoadingSetter] = useState(false);
  const [, setLocation] = useLocation();
  const onPageClick = useCallback(async () => {
    pageClickedLoadingSetter(true);
    try {
      const oldActivePage = await window.service.pages.getActivePage();
      await window.service.pages.setActivePage(type, oldActivePage?.type);
      setLocation(`/${WindowNames.main}/${type}/`);
    } catch (error) {
      if (error instanceof Error) {
        await window.service.native.log('error', error.message);
      }
    }
    pageClickedLoadingSetter(false);
  }, [setLocation, type]);
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
