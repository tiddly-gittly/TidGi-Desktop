import { Graph } from 'fbp-graph';
import { useEffect, useRef } from 'react';

export function useFBPGraphReference(graph: Graph | undefined) {
  const fbpGraphReference = useRef<Graph | undefined>(graph);
  useEffect(() => {
    fbpGraphReference.current = graph;
    return () => {
      fbpGraphReference.current = undefined;
    };
  }, [graph]);
  return fbpGraphReference;
}
