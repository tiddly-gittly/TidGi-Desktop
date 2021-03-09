// this component is to fix
// -webkit-app-region: drag; not working when set to an element in BrowserView
// This is a workaround for the issue
// You can put the draggable divs at the same region in BrowserWindow,
// then even if you put a BrowserView on top of that region, that region is still draggable.

import { usePromiseValue } from '@/helpers/use-service-value';
import { WindowNames } from '@services/windows/WindowProperties';
import React from 'react';
import styled, { css } from 'styled-components';

const Root = styled.div<{ sidebar?: boolean }>`
  height: 22;
  width: 100vw;
  webkit-app-region: drag;
  user-select: none;
  background: transparent;
  position: absolute;
  top: 0;
  left: 0;
  ${({ sidebar }) =>
    sidebar &&
    css`
      /** BrowserView has different position & width because of sidebar, sidebar width is 68px */
      width: calc(100vw - 68px);
      left: 68;
    `}
`;

export default function DraggableRegion(): JSX.Element | null {
  const platform = usePromiseValue(async () => (await window.service.context.get('platform')) as string);
  const titleBar = usePromiseValue(async () => (await window.service.preference.get('titleBar')) as boolean);
  const sidebar = usePromiseValue(async () => (await window.service.preference.get('sidebar')) as boolean);
  const hideMenuBar = usePromiseValue(async () => (await window.service.preference.get('hideMenuBar')) as boolean);
  // on macOS or menubar mode, if all bars are hidden
  // the top 22px part of BrowserView should be draggable
  if ((platform === 'darwin' || (window.meta.windowName === WindowNames.main && hideMenuBar === false)) && !titleBar) {
    return <Root sidebar={sidebar} />;
  }

  return null;
}
