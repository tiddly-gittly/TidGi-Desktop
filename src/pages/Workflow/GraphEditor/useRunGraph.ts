import { Graph as FbpGraph } from 'fbp-graph';
import { /* Graph as NofloGraph, */ type ComponentLoader, createNetwork } from 'noflo';
import type { Network } from 'noflo/lib/Network';
import { useEffect, useRef } from 'react';

export function useRunGraph(fbpGraph: FbpGraph, libraryLoader?: ComponentLoader) {
  const currentNetworkReference = useRef<Network | undefined>();
  async function runGraph() {
    // DEBUG: console fbpGraph
    console.log(`fbpGraph`, fbpGraph);
    /**
     * Similar to noflo-runtime-base's `src/protocol/Network.js`, transform FbpGraph to ~~NofloGraph~~ Network
     */
    const nofloNetwork: Network = await createNetwork(fbpGraph, {
      subscribeGraph: false,
      delay: true,
      componentLoader: libraryLoader,
    });
    // DEBUG: console nofloNetwork
    console.log(`nofloNetwork`, nofloNetwork);
    currentNetworkReference.current = nofloNetwork;
    await nofloNetwork.start();
  }
  useEffect(() => {
    return () => {
      void currentNetworkReference.current?.stop();
    };
  }, [currentNetworkReference]);
  return runGraph;
}
