/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { Graph } from 'fbp-graph';
import { RefObject, useCallback, useState } from 'react';
import TheGraph, { IFBPComponent } from 'the-graph';

const unnamespace = (name: string) => {
  if (!name.includes('/')) {
    return name;
  }
  return name.split('/').pop() as string;
};

export function useMouseEvents({ graph, library, appReference }: { appReference: RefObject<HTMLDivElement>; graph: Graph; library?: TheGraph.IFBPLibrary }) {
  const [selectedNodes, setSelectedNodes] = useState<any[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<any[]>([]);

  const [icons, setIcons] = useState<any[]>([]);
  const [pan, setPan] = useState<any[]>([0, 0]);
  const [scale, setScale] = useState<number>(1);

  const handleEdgeSelection = useCallback((itemKey: any, item: any, toggle: boolean) => {
    if (itemKey === undefined) {
      setSelectedEdges([]);
    } else if (toggle) {
      setSelectedEdges((edges) => {
        const index = edges.indexOf(item);
        const isSelected = index !== -1;
        const shallowClone = [...edges];
        if (isSelected) {
          shallowClone.splice(index, 1);
        } else {
          shallowClone.push(item);
        }
        return shallowClone;
      });
    } else {
      setSelectedEdges([item]);
    }
  }, []);

  const handleNodeSelection = useCallback((itemKey: any, item: any, toggle: boolean) => {
    if (itemKey === undefined) {
      setSelectedNodes([]);
    } else if (toggle) {
      setSelectedNodes((nodes) => {
        const index = nodes.indexOf(item);
        const isSelected = index !== -1;
        const shallowClone = [...nodes];
        if (isSelected) {
          shallowClone.splice(index, 1);
        } else {
          shallowClone.push(item);
        }
        return shallowClone;
      });
    } else {
      setSelectedNodes([item]);
    }
  }, []);

  const handlePanScale = useCallback((x: number, y: number, scale: number) => {
    setPan([x, y]);
    setScale(scale);
  }, []);

  // const triggerAutolayout = () => {
  //   const portInfo = graphView ? graphView.portInfo : null;
  //   autolayouter.layout({
  //     graph,
  //     portInfo,
  //     direction: 'RIGHT',
  //     options: {
  //       intCoordinates: true,
  //       algorithm: 'de.cau.cs.kieler.klay.layered',
  //       layoutHierarchy: true,
  //       spacing: 36,
  //       borderSpacing: 20,
  //       edgeSpacingFactor: 0.2,
  //       inLayerSpacingFactor: 2,
  //       nodePlace: 'BRANDES_KOEPF',
  //       nodeLayering: 'NETWORK_SIMPLEX',
  //       edgeRouting: 'POLYLINE',
  //       crossMin: 'LAYER_SWEEP',
  //       direction: 'RIGHT',
  //     },
  //   });
  // };

  // const applyAutolayout = (keilerGraph) => {
  //   graph.startTransaction('autolayout');
  //   TheGraph.autolayout.applyToGraph(graph, keilerGraph, { snap });
  //   graph.endTransaction('autolayout');
  //   triggerFit();
  // };

  const triggerFit = () => {
    if (appReference.current) {
      appReference.current.triggerFit();
    }
  };

  const addNode = (id, component, metadata) => {
    if (graph) {
      graph.addNode(id, component, metadata);
    }
  };

  const getPan = () => {
    if (!appReference.current) {
      return [0, 0];
    }
    return [appReference.current.state.x, appReference.current.state.y];
  };

  const focusNode = (node) => {
    appReference.current.focusNode(node);
  };

  const getComponent = (name: string): IFBPComponent | undefined => {
    return library?.[name];
  };

  const registerComponent = (definition: TheGraph.IFBPComponent, generated: boolean) => {
    const component = getComponent(definition.name);
    if (component && generated) {
      return;
    }
    if (library === undefined) return;
    library[definition.name] = definition;
    // debounceLibraryRefesh();
    if (definition.name.includes('/')) {
      const unnamespaced = unnamespace(definition.name);
      registerComponent({
        ...definition,
        name: unnamespaced,
        unnamespaced: true,
      }, false);
    }
  };

  // const debounceLibraryRefesh = () => {
  // // Breaking the "no debounce" rule, this fixes #76 for subgraphs
  //   if (props.debounceLibraryRefeshTimer) {
  //     clearTimeout(props.debounceLibraryRefeshTimer);
  //   }
  //   props.debounceLibraryRefeshTimer = setTimeout(() => {
  //     if (graphView) {
  //       graphView.markDirty({ libraryDirty: true });
  //     }
  //   }, 200);
  // };

  return {
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
    getComponent,
    // toJSON,
    // debounceLibraryRefesh,
  };
}
