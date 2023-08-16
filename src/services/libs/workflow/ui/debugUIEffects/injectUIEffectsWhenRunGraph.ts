import { IP } from 'noflo';
import { InternalSocket } from 'noflo/lib/InternalSocket';
import type { Network } from 'noflo/lib/Network';
import { createUIEffectsContext } from './debugUIEffectsContext';
import { uiStore } from './store';

/**
 * Inject prepared debugUIEffectsContext to the graph that is about to run.
 * UI effect Plugins should be added before this function is called, so they can show up in the debugUIEffectsContext.
 */
export function injectUIEffectsWhenRunGraph(nofloNetwork: Network) {
  const debugUIEffectsContext = createUIEffectsContext(uiStore);
  for (const componentName in nofloNetwork.processes) {
    const networkProcess = nofloNetwork.processes[componentName];
    const uiEffectsSocket = new InternalSocket(); // Create a new socket
    networkProcess?.component?.inPorts?.ports?.ui_effects?.attach(uiEffectsSocket);
    uiEffectsSocket.connect(); // Connect the socket

    // Now, you can send the debugUIEffectsContext using the socket
    uiEffectsSocket.send(new IP('data', debugUIEffectsContext));
  }
}
