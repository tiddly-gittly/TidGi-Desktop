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

import { useCallback, useEffect, useRef } from 'react';
import { useMenu } from './menu';
import { useMouseEvents } from './mouseEvents';
import { useSubscribeGraph } from './subscribe';

const Container = styled.main`
  .the-graph-app > svg, .the-graph-app > canvas {
    /* left: ${sidebarWidth}px!important; */
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
  snap?: number;
  theme: 'light' | 'dark';
  width?: number;
}

export function GraphEditor(props: Partial<ITheGraphProps> & IGraphEditorProps) {
  const { library, theme, graph, readonly = false } = props;
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

  const appReference = useRef<HTMLDivElement>(null);

  // methods
  const { subscribeGraph, unsubscribeGraph } = useSubscribeGraph({ readonly });
  const {
    pan,
    scale,
    handleEdgeSelection,
    handleNodeSelection,
    handlePanScale,
    // triggerAutolayout,
    // applyAutolayout,
    triggerFit,
    addNode,
    getPan,
    focusNode,
    registerComponent,
  } = useMouseEvents({
    graph,
    library,
    appReference,
  });

  const buildInitialLibrary = useCallback((graph: Graph) => {
    const components = TheGraph.library.componentsFromGraph(graph);
    components.forEach((component) => {
      registerComponent(component, true);
    });
  }, [registerComponent]);
  const { addMenu, addMenuCallback, addMenuAction, getMenuDef } = useMenu();

  // when ready
  useEffect(() => {
    // initializeAutolayouter();
    buildInitialLibrary(graph);
  }, [buildInitialLibrary]);

  // Attach nav
  function fitGraphInView() {
    // editor.triggerFit();
  }

  function panEditorTo() {}

  return (
    <Container className={`the-graph-${theme}`}>
      <TheGraph.App
        ref={appReference}
        readonly={readonly}
        height={window.innerHeight}
        width={window.innerWidth - sidebarWidth}
        offsetX={sidebarWidth}
        getMenuDef={getMenuDef}
        onPanScale={handlePanScale}
        {...props}
      />
      <ThumbnailContainer>
        <TheGraph.nav.Component
          height={162}
          width={216}
          graph={graph}
          onTap={fitGraphInView}
          onPanTo={panEditorTo}
          viewrectangle={[...pan, window.innerWidth, window.innerHeight]}
          viewscale={scale}
        />
      </ThumbnailContainer>
    </Container>
  );
}
