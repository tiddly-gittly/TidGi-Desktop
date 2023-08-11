import { Graph as FbpGraph } from 'fbp-graph';
import { /* Graph as NofloGraph, */ type ComponentLoader, createNetwork } from 'noflo';
import type { Network } from 'noflo/lib/Network';
import { useEffect, useRef } from 'react';

export function useRunGraph(fbpGraph: FbpGraph, libraryLoader?: ComponentLoader) {
  const currentNetworkReference = useRef<Network | undefined>();
  async function runGraph() {
    /**
     * Similar to noflo-runtime-base's `src/protocol/Network.js`, transform FbpGraph to ~~NofloGraph~~ Network
     */
    // fbpGraph.addInitial('aaa', fbpGraph.nodes[1].id, 'in');
    const nofloNetwork: Network = await createNetwork(fbpGraph, {
      subscribeGraph: false,
      delay: true,
      componentLoader: libraryLoader,
    });
    currentNetworkReference.current = nofloNetwork;
    nofloNetwork.on('process-error', (processError: { error: Error }) => {
      if (typeof console.error === 'function') {
        console.error(processError.error);
      } else {
        console.log(processError.error);
      }
    });
    await nofloNetwork.connect();
    await nofloNetwork.start();
  }
  useEffect(() => {
    return () => {
      void currentNetworkReference.current?.stop();
    };
  }, [currentNetworkReference]);
  return runGraph;
}
