import { sidebarWidth } from '@/constants/style';
import type { Graph } from 'fbp-graph';

import styled from 'styled-components';
import TheGraph from 'the-graph';
import type { IFBPLibrary, ITheGraphProps } from 'the-graph';
import 'the-graph/themes/the-graph-dark.css';
import 'the-graph/themes/the-graph-light.css';
import '@fortawesome/fontawesome-free/js/all.js';
import '@fortawesome/fontawesome-free/css/all.css';
import '@fortawesome/fontawesome-free/css/v4-font-face.css';

import { SearchComponents } from './components/SearchComponents';
import { useMenu } from './menu';
import { useMouseEvents } from './mouseEvents';
import { useSubscribeGraph } from './subscribe';

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

export interface IGraphEditorProps {
  animatedEdges?: any[];
  appView?: any;
  autolayout?: boolean;
  autolayouter?: any;
  copyNodes?: any[];
  debounceLibraryRefeshTimer?: any;
  displaySelectionGroup?: boolean;
  editable?: boolean;
  errorNodes?: any;
  forceSelection?: boolean;
  graph: Graph;
  graphChanges?: any[];
  graphView?: any;
  grid?: number;
  height?: number;
  icons?: any;
  library?: IFBPLibrary;
  maxZoom?: number;
  menus?: any;
  minZoom?: number;
  notifyView?: () => void;
  offsetX?: number;
  offsetY?: number;
  onContextMenu?: () => void;
  pan?: any;
  plugins?: object;
  readonly?: boolean;
  scale?: number;
  selectedEdges?: any[];
  selectedNodes?: any[];

  selectedNodesHash?: any;
  setGraph: (graph: Graph) => void;
  snap?: number;
  theme: 'light' | 'dark';
  width?: number;
}

export function GraphEditor(props: Partial<ITheGraphProps> & IGraphEditorProps) {
  const { library, theme, graph, readonly = false, setGraph } = props;
  // const initializeAutolayouter = () => {
  //   // Logic for initializing autolayouter
  //   const auto = klayNoflo.init({
  //     onSuccess: applyAutolayout,
  //     workerScript: 'vendor/klayjs/klay.js',
  //   });
  //   setAutolayouter(auto);
  // };
  // const applyAutolayout = (keilerGraph: any) => {
  //   // Logic for applying autolayout
  // };

  // methods
  const { subscribeGraph, unsubscribeGraph } = useSubscribeGraph({ readonly });
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
  const { addMenu, addMenuCallback, addMenuAction, getMenuDef } = useMenu();

  return (
    <>
      <TheGraphContainer className={`the-graph-${theme}`}>
        <TheGraph.App
          readonly={readonly}
          height={window.innerHeight}
          width={window.innerWidth}
          offsetX={sidebarWidth}
          getMenuDef={getMenuDef}
          onPanScale={onPanScale}
          onNodeSelection={onNodeSelection}
          onEdgeSelection={onEdgeSelection}
          {...props}
        />
      </TheGraphContainer>
      <ThumbnailContainer>
        <TheGraph.nav.Component
          height={162}
          width={216}
          graph={graph}
          viewrectangle={[pan[0] + sidebarWidth, pan[1], window.innerWidth, window.innerHeight]}
          viewscale={scale}
        />
      </ThumbnailContainer>
      <SearchComponents library={library} addNode={addNode} />
    </>
  );
}
