import SearchIcon from '@mui/icons-material/Search';
import { Divider as DividerRaw, List, ListItemButton, ListItemIcon as ListItemIconRaw, ListItemText } from '@mui/material';
import { keyframes, styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { PreferenceSections } from '@services/preferences/interface';
import type { ISectionRecord } from './useSections';

interface SectionSideBarProps {
  onSearchClick: () => void;
  sections: ISectionRecord;
}

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

export function SectionSideBar(props: SectionSideBarProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <SideBar>
      <List dense>
        <SideMenuListItem
          index={0}
          onClick={props.onSearchClick}
          data-testid='preference-section-search'
        >
          <ListItemIcon>
            <SearchIcon />
          </ListItemIcon>
          <ListItemText primary={t('Preference.Search')} />
        </SideMenuListItem>
        <Divider />
        {Object.keys(props.sections).map((sectionKey, index) => {
          const { Icon, text, ref, hidden } = props.sections[sectionKey as PreferenceSections];
          if (hidden === true) return null;
          return (
            <React.Fragment key={sectionKey}>
              {index > 0 && <Divider />}
              <SideMenuListItem
                index={index + 1}
                onClick={() => {
                  ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  // Log for E2E test
                  void window.service.native.log('debug', 'test-id-Preferences section clicked', { section: sectionKey });
                }}
                data-testid={`preference-section-${sectionKey}`}
              >
                <ListItemIcon>
                  <Icon />
                </ListItemIcon>
                <ListItemText primary={text} />
              </SideMenuListItem>
            </React.Fragment>
          );
        })}
      </List>
    </SideBar>
  );
}
