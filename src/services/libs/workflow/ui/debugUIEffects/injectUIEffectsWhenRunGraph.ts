import { IP } from 'noflo';
import type { Network } from 'noflo/lib/Network';
import { debugUIEffectsContext } from './debugUIEffectsContext';

/**
 * Inject prepared debugUIEffectsContext to the graph that is about to run.
 * UI effect Plugins should be added before this function is called, so they can show up in the debugUIEffectsContext.
 */
export function injectUIEffectsWhenRunGraph(nofloNetwork: Network) {
  for (const componentName in nofloNetwork.processes) {
    const networkProcess = nofloNetwork.processes[componentName];
    networkProcess?.component?.inPorts?.ports?.ui_effects?.attach(new IP('data', debugUIEffectsContext));
  }
}
