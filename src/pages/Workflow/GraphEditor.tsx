import { sidebarWidth } from '@/constants/style';
import { Graph } from 'fbp-graph';
import styled from 'styled-components';
import TheGraph from 'the-graph';
import type { IFBPLibrary, ITheGraphProps } from 'the-graph';
import 'the-graph/themes/the-graph-dark.css';
import 'the-graph/themes/the-graph-light.css';

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
  const { library, theme, graph } = props;
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

  // DEBUG: console appReference.current
  console.log(`appReference.current`, appReference.current);
  // methods
  const { subscribeGraph, unsubscribeGraph } = useSubscribeGraph({});
  const {
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

  return (
    <Container className={`the-graph-${theme}`}>
      <TheGraph.App
        ref={appReference}
        readonly={false}
        height={window.innerHeight}
        width={window.innerWidth - sidebarWidth}
        offsetX={sidebarWidth}
        getMenuDef={getMenuDef}
        {...props}
      />
    </Container>
  );
}
