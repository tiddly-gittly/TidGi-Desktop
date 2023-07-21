import { Graph as FbpGraph } from 'fbp-graph';
import { /* Graph as NofloGraph, */ type ComponentLoader, createNetwork } from 'noflo';
import type { Network } from 'noflo/lib/Network';
import { useEffect, useRef } from 'react';

export function useRunGraph(fbpGraph: FbpGraph, libraryLoader?: ComponentLoader) {
  const currentGraphReference = useRef<Network | undefined>();
  async function runGraph() {
    /**
     * Simillar to noflo-runtime-base's `src/protocol/Network.js`, transform FbpGraph to ~~NofloGraph~~ Network
     */
    const nofloGraph: Network = await createNetwork(fbpGraph, {
      subscribeGraph: false,
      delay: true,
      componentLoader: libraryLoader,
    });
    currentGraphReference.current = nofloGraph;
    await nofloGraph.start();
  }
  useEffect(() => {
    return () => {
      void currentGraphReference.current?.stop();
    };
  }, [currentGraphReference]);
  return runGraph;
}
