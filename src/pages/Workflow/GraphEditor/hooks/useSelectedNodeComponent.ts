import { GraphNode } from 'fbp-graph/lib/Types';
import { useMemo } from 'react';
import { IFBPLibrary, INoFloUIComponent } from 'the-graph';

export function useSelectedNodeComponent(nodeInfos: GraphNode[], library: IFBPLibrary): Array<{ component: INoFloUIComponent; node: GraphNode }> {
  const nodeAndComponent = useMemo(() =>
    nodeInfos.map((nodeInfo) => {
      const component = library[nodeInfo.component];
      return { node: nodeInfo, component };
    }), [library, nodeInfos]);
  return nodeAndComponent;
}
