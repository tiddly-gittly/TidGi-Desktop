/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import useToggle from 'beautiful-react-hooks/useToggle';
import type { Graph } from 'fbp-graph';
import { GraphEdge, GraphNode } from 'fbp-graph/lib/Types';
import { useCallback, useState } from 'react';
import { IFBPLibrary, INoFloUIComponent } from 'the-graph';
import { makeNewID } from './idUtils';

const unnamespace = (name: string) => {
  if (!name.includes('/')) {
    return name;
  }
  return name.split('/').pop() as string;
};

export function useMouseEvents({ graph, library, setGraph }: { graph?: Graph; library?: IFBPLibrary; setGraph: (graph: Graph) => void }) {
  const [selectedNodes, setSelectedNodes] = useState<GraphNode[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<GraphEdge[]>([]);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const [scale, setScale] = useState<number>(1);

  const onEdgeSelection = useCallback((edgeID: string, edge: GraphEdge, toggle: boolean) => {
    if (edgeID === undefined) {
      setSelectedEdges([]);
    } else if (toggle) {
      setSelectedEdges((previousEdges) => {
        const index = previousEdges.indexOf(edge);
        const isSelected = index !== -1;
        const shallowClone = [...previousEdges];
        if (isSelected) {
          shallowClone.splice(index, 1);
        } else {
          shallowClone.push(edge);
        }
        return shallowClone;
      });
    } else {
      setSelectedEdges([edge]);
    }
  }, []);

  const onNodeSelection = useCallback((nodeID: string, node: GraphNode, toggle: boolean) => {
    if (nodeID === undefined) {
      setSelectedNodes([]);
    } else if (toggle) {
      setSelectedNodes((previousNodes) => {
        const index = previousNodes.indexOf(node);
        const isSelected = index !== -1;
        const shallowClone = [...previousNodes];
        if (isSelected) {
          shallowClone.splice(index, 1);
        } else {
          shallowClone.push(node);
        }
        return shallowClone;
      });
    } else {
      setSelectedNodes([node]);
    }
  }, []);

  const onPanScale = useCallback((x: number, y: number, scale: number) => {
    setPan([-x, -y]);
    setScale(scale);
  }, []);

  const addNode = useCallback((component: INoFloUIComponent) => {
    if (graph === undefined) return;
    const componentName = component.name;
    const id = makeNewID(componentName);
    graph.startTransaction('addnode');
    const nameParts = componentName.split('/');
    graph.addNode(id, componentName, {
      label: nameParts.at(-1),
      x: Math.floor((-pan[0] + 334) / scale),
      y: Math.floor((-pan[1] + 100) / scale),
    });
    // Add IIPs for default values
    component.inports?.forEach?.((port) => {
      const value = port.default;
      if (value !== undefined) {
        graph.addInitial(value, id, port.name);
      }
    });
    graph.endTransaction('addnode');
  }, [graph, pan, scale]);

  return {
    pan,
    scale,
    onEdgeSelection,
    onNodeSelection,
    onPanScale,
    addNode,
    selectedNodes,
    selectedEdges,
  };
}
