import { Divider as DividerRaw, List, ListItemButton, ListItemIcon as ListItemIconRaw, ListItemText } from '@mui/material';
import { keyframes, styled } from '@mui/material/styles';
import React from 'react';

import type { IWorkspaceSectionRecord, WorkspaceSections } from './useWorkspaceSections';

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
  sections: IWorkspaceSectionRecord;
}

export function WorkspaceSectionSideBar({ sections }: WorkspaceSectionSideBarProps): React.JSX.Element {
  return (
    <SideBar>
      <List dense>
        {(Object.keys(sections) as WorkspaceSections[]).map((sectionKey, index) => {
          const { Icon, text, ref, hidden } = sections[sectionKey];
          if (hidden === true) return <React.Fragment key={sectionKey} />;
          return (
            <React.Fragment key={sectionKey}>
              {index > 0 && <Divider />}
              <SideMenuListItem
                index={index}
                onClick={() => {
                  ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
