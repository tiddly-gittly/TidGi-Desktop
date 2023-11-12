import { useThemeObservable } from '@services/theme/hooks';
import { useContext, useEffect, useRef, useState } from 'react';
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

import { useTheme } from '@mui/material';
import { DebugPanel } from '../DebugPanel';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import { SearchComponentsBar } from './components/SearchComponents';
import { GraphTopToolbar } from './components/Toolbar';
import { FBPGraphReferenceContext, WorkflowContext } from './hooks/useContext';
import { useFBPGraphReference } from './hooks/useFBPGraphReference';
import { useMenu } from './hooks/useMenu';
import { useMouseEvents } from './hooks/useMouseEvents';
import { useRunGraph } from './hooks/useRunGraph';
import { useSaveLoadGraph } from './hooks/useSaveLoadGraph';
import { useLibrary } from '../../../services/workflow/library';

const TheGraphContainer = styled.main`
  /**
  logic inside the-graph calculate mouse event position xy using window.innerWidth,
  so we have to let it be full-screen so it can calculate correctly.
  And we hide the left side overflow to let it looks like it's not full-screen (when left sidebar opened).
  */
  width: ${({ theme }) => window.innerWidth - theme.sidebar.width}px;
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
  left: ${({ theme }) => theme.sidebar.width}px;
  z-index: 1;
  overflow: hidden;
`;
const NodeDetailsContainer = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  z-index: 1;
  overflow: auto;
  width: ${({ theme }) => theme.workflow.nodeDetailPanel.width}px;
  max-height: 100vh;
  height: fit-content;
  &::-webkit-scrollbar {
    width: 0;
  }
`;

export function GraphEditor() {
  const { t } = useTranslation();
  const systemTheme = useThemeObservable();
  const muiTheme = useTheme();

  const [graph, setGraph] = useSaveLoadGraph();
  const workflowContext = useContext(WorkflowContext);
  const [library, libraryLoader] = useLibrary();
  const [readonly, setReadonly] = useState(false);
  const [debugPanelOpened, setDebugPanelOpened] = useState(false);

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
  const fBPGraphReference = useFBPGraphReference(graph);
  const { getMenuDef } = useMenu();
  const editorReference = useRef<ITheGraphEditor>();
  const [runGraph, stopGraph, graphIsRunning, currentNetworkID] = useRunGraph();
  // auto open debug panel when run graph
  useEffect(() => {
    if (graphIsRunning) {
      setDebugPanelOpened(true);
    }
  }, [graphIsRunning, setDebugPanelOpened]);
  if ((graph === undefined) || (library === undefined)) return <div>{t('Loading')}</div>;

  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <FBPGraphReferenceContext.Provider value={fBPGraphReference}>
        <TheGraphContainer className={`the-graph-${systemTheme?.shouldUseDarkColors === true ? 'dark' : 'light'}`}>
          <TheGraph.App
            graph={graph}
            library={library}
            height={window.innerHeight}
            width={window.innerWidth}
            offsetX={muiTheme.sidebar.width}
            getMenuDef={getMenuDef}
            onPanScale={onPanScale}
            onNodeSelection={onNodeSelection}
            onEdgeSelection={onEdgeSelection}
            getEditorRef={editorReference}
            readonly={readonly}
          />
        </TheGraphContainer>
        <NodeDetailsContainer>
          <NodeDetailPanel selectedNodes={selectedNodes} library={library} />
        </NodeDetailsContainer>
        <ThumbnailContainer>
          <ThumbnailNav
            height={muiTheme.workflow.thumbnail.height}
            width={muiTheme.workflow.thumbnail.width}
            graph={graph}
            viewrectangle={[pan[0], pan[1], window.innerWidth - muiTheme.sidebar.width, window.innerHeight]}
            viewscale={scale}
            onTap={() => {
              editorReference?.current?.triggerFit();
            }}
            onPanTo={(panTo) => {
              editorReference?.current?.setState(panTo);
            }}
          />
        </ThumbnailContainer>
        <SearchComponentsBar library={library} addNode={addNode} />
        <GraphTopToolbar
          editorReference={editorReference}
          readonly={readonly}
          setReadonly={setReadonly}
          workflowContext={workflowContext}
          graph={graph}
          runGraph={runGraph}
          stopGraph={stopGraph}
          graphIsRunning={graphIsRunning}
          debugPanelOpened={debugPanelOpened}
          setDebugPanelOpened={setDebugPanelOpened}
        />
        <DebugPanel graphIsRunning={graphIsRunning} debugPanelOpened={debugPanelOpened} setDebugPanelOpened={setDebugPanelOpened} networkID={currentNetworkID} />
      </FBPGraphReferenceContext.Provider>
    </ErrorBoundary>
  );
}
