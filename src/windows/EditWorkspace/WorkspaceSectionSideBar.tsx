import SearchIcon from '@mui/icons-material/Search';
import { Divider as DividerRaw, List, ListItemButton, ListItemIcon as ListItemIconRaw, ListItemText } from '@mui/material';
import { keyframes, styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { IGenericSectionDefinition } from '@services/preferences/definitions/types';
import { allWorkspaceSections } from '@services/workspaces/definitions/registry';

const SideBar = styled('div')`
  position: fixed;
  width: 200px;
  background-color: ${({ theme }) => theme.palette.background.default};
  color: ${({ theme }) => theme.palette.text.primary};
`;

const ListItemIcon = styled(ListItemIconRaw)`
  color: ${({ theme }) => theme.palette.text.primary};
`;

const Divider = styled(DividerRaw)`
  border-color: ${({ theme }) => theme.palette.divider};
`;

const animateMoveFromLeft = keyframes`
  from {
    transform: translate3d(-40px, 0, 0);
    opacity: 0;
  }
  to {
    transform: translate3d(0px, 0, 0);
    opacity: 1;
  }
`;

const SideMenuListItem = styled(ListItemButton)<{ index: number }>`
  opacity: 0;
  animation: ${animateMoveFromLeft} 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  animation-fill-mode: forwards;
  animation-delay: ${({ index }) => index * 0.05}s;
`;

interface WorkspaceSectionSideBarProps {
  sectionRefs: Map<string, React.RefObject<HTMLSpanElement | null>>;
  hiddenSections?: Set<string>;
  onSearchClick: () => void;
}

export function WorkspaceSectionSideBar({ sectionRefs, hiddenSections, onSearchClick }: WorkspaceSectionSideBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const visibleSections = allWorkspaceSections.filter((s) => !hiddenSections?.has(s.id) && !s.hidden);

  return (
    <SideBar>
      <List dense>
        <SideMenuListItem
          index={0}
          onClick={onSearchClick}
          data-testid='workspace-section-search'
        >
          <ListItemIcon>
            <SearchIcon />
          </ListItemIcon>
          <ListItemText primary={t('Preference.Search')} />
        </SideMenuListItem>
        {visibleSections.map((section: IGenericSectionDefinition, index: number) => {
          const { Icon } = section;
          return (
            <React.Fragment key={section.id}>
              <Divider />
              <SideMenuListItem
                index={index + 1}
                onClick={() => {
                  sectionRefs.get(section.id)?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                data-testid={`preference-section-${section.id}`}
              >
                <ListItemIcon>
                  <Icon />
                </ListItemIcon>
                <ListItemText primary={t(section.titleKey, section.ns ? { ns: section.ns } : undefined)} />
              </SideMenuListItem>
            </React.Fragment>
          );
        })}
      </List>
    </SideBar>
  );
}
