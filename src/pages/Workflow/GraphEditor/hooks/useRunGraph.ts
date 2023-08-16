import { injectUIEffectsWhenRunGraph } from '@services/libs/workflow/ui/debugUIEffects/injectUIEffectsWhenRunGraph';
import { Graph as FbpGraph } from 'fbp-graph';
import { /* Graph as NofloGraph, */ type ComponentLoader, createNetwork } from 'noflo';
import type { Network } from 'noflo/lib/Network';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useRunGraph(fbpGraph?: FbpGraph, libraryLoader?: ComponentLoader) {
  const currentNetworkReference = useRef<Network | undefined>();
  const [graphIsRunning, setGraphIsRunning] = useState(false);
  const runGraph = useCallback(async () => {
    if (fbpGraph === undefined) return;
    setGraphIsRunning(true);
    try {
      /**
       * Similar to noflo-runtime-base's `src/protocol/Network.js`, transform FbpGraph to ~~NofloGraph~~ Network
       */
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
      injectUIEffectsWhenRunGraph(nofloNetwork);
      await nofloNetwork.start();
      nofloNetwork.once('end', () => {
        setGraphIsRunning(false);
      });
    } catch (error) {
      // TODO: show error on a debugger panel
      // network.once('process-error', onError);
      console.error(error);
      setGraphIsRunning(false);
    }
  }, [fbpGraph, libraryLoader]);
  const stopGraph = useCallback(async () => {
    await currentNetworkReference.current?.stop();
    setGraphIsRunning(false);
  }, []);
  useEffect(() => {
    return () => {
      void currentNetworkReference.current?.stop();
      setGraphIsRunning(false);
    };
  }, [currentNetworkReference]);
  return [runGraph, stopGraph, graphIsRunning] as const;
}
