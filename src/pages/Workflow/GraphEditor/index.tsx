import { sidebarWidth } from '@/constants/style';
import { useThemeObservable } from '@services/theme/hooks';
import { useRef } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import type { ITheGraphEditor } from 'the-graph';
import TheGraph from 'the-graph';
import { Component as ThumbnailNav } from 'the-graph/the-graph-nav/the-graph-nav';
import 'the-graph/themes/the-graph-dark.css';
import 'the-graph/themes/the-graph-light.css';
import '@fortawesome/fontawesome-free/js/all.js';
import '@fortawesome/fontawesome-free/css/all.css';
import '@fortawesome/fontawesome-free/css/v4-font-face.css';

import { SearchComponents } from './components/SearchComponents';
import { useLibrary } from './library';
import { useMenu } from './menu';
import { useMouseEvents } from './mouseEvents';
import { useSaveLoadGraph } from './useSaveLoadGraph';

const TheGraphContainer = styled.main`
  /**
  logic inside the-graph calculate mouse event position xy using window.innerWidth,
  so we have to let it be full-screen so it can calculate correctly.
  And we hide the left side overflow to let it looks like it's not full-screen (when left sidebar opened).
  */
  width: ${window.innerWidth - sidebarWidth}px;
  overflow-x: hidden;
  left: ${sidebarWidth}px;
  .the-graph-app > svg, .the-graph-app > canvas {
    left: -${sidebarWidth}px !important;
  }
  &.the-graph-light .the-graph-app, &.the-graph-dark .the-graph-app {
    background-color: ${({ theme }) => theme.palette.background.default};
  }
  & .icon {
    /* fix with v4-font-face */
    font-family: 'FontAwesome' !important;
  }
`;
const ThumbnailContainer = styled.div`
  position: absolute;
  bottom: 0;
  right: 0;
  z-index: 1;
  overflow: hidden;
`;

export function GraphEditor() {
  const { t } = useTranslation();
  const theme = useThemeObservable();

  const [graph, setGraph] = useSaveLoadGraph();
  const library = useLibrary();

  // methods
  // const { subscribeGraph, unsubscribeGraph } = useSubscribeGraph({ readonly });
  const {
    pan,
    scale,
    onEdgeSelection,
    onNodeSelection,
    onPanScale,
    // triggerAutolayout,
    // applyAutolayout,
    addNode,
  } = useMouseEvents({
    graph,
    library,
    setGraph,
  });
  const { getMenuDef } = useMenu();
  const editorReference = useRef<ITheGraphEditor>();
  if ((graph === undefined) || (library === undefined)) return <div>{t('Loading')}</div>;
  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <TheGraphContainer className={`the-graph-${theme?.shouldUseDarkColors === true ? 'dark' : 'light'}`}>
        <TheGraph.App
          graph={graph}
          library={library}
          readonly={false}
          height={window.innerHeight}
          width={window.innerWidth}
          offsetX={sidebarWidth}
          getMenuDef={getMenuDef}
          onPanScale={onPanScale}
          onNodeSelection={onNodeSelection}
          onEdgeSelection={onEdgeSelection}
          getEditorRef={editorReference}
        />
      </TheGraphContainer>
      <ThumbnailContainer>
        <ThumbnailNav
          height={162}
          width={216}
          graph={graph}
          viewrectangle={[pan[0] + sidebarWidth * scale, pan[1], window.innerWidth - sidebarWidth * scale, window.innerHeight]}
          viewscale={scale}
          onTap={() => {
            editorReference?.current?.triggerFit();
          }}
          onPanTo={(panTo, event) => {
            editorReference?.current?.setState(panTo);
          }}
        />
      </ThumbnailContainer>
      <SearchComponents library={library} addNode={addNode} />
    </ErrorBoundary>
  );
}
