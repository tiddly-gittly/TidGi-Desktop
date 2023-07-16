import { sidebarWidth } from '@/constants/style';
import { useThemeObservable } from '@services/theme/hooks';
import { useContext, useRef, useState } from 'react';
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

import { WorkflowContext } from '../useContext';
import { SearchComponents } from './components/SearchComponents';
import { GraphTopToolbar } from './components/Toolbar';
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

  .the-graph-app > svg, .the-graph-app > canvas {
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
  const workflowContext = useContext(WorkflowContext);
  const library = useLibrary();
  const [readonly, setReadonly] = useState(false);

  // methods
  // const { subscribeGraph, unsubscribeGraph } = useSubscribeGraph({ readonly });
  const {
    pan,
    scale,
    onEdgeSelection,
    onNodeSelection,
    onPanScale,
    addNode,
    selectedNodes,
    selectedEdges,
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
          height={window.innerHeight}
          width={window.innerWidth}
          offsetX={sidebarWidth}
          getMenuDef={getMenuDef}
          onPanScale={onPanScale}
          onNodeSelection={onNodeSelection}
          onEdgeSelection={onEdgeSelection}
          getEditorRef={editorReference}
          readonly={readonly}
        />
      </TheGraphContainer>
      <ThumbnailContainer>
        <ThumbnailNav
          height={162}
          width={216}
          graph={graph}
          viewrectangle={[pan[0], pan[1], window.innerWidth - sidebarWidth, window.innerHeight]}
          viewscale={scale}
          onTap={() => {
            editorReference?.current?.triggerFit();
          }}
          onPanTo={(panTo) => {
            editorReference?.current?.setState(panTo);
          }}
        />
      </ThumbnailContainer>
      <SearchComponents library={library} addNode={addNode} />
      <GraphTopToolbar editorReference={editorReference} readonly={readonly} setReadonly={setReadonly} workflowContext={workflowContext} graph={graph} />
    </ErrorBoundary>
  );
}
