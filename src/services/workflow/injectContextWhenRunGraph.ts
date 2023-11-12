import type { IWorkflowContext } from '@services/workflow/interface';
import { IP } from 'noflo';
import { InternalSocket } from 'noflo/lib/InternalSocket';
import type { Network } from 'noflo/lib/Network';
import { StoreApi } from 'zustand/vanilla';
import { WorkflowViewModelStoreState } from './viewModelStore';

/**
 * Inject prepared debugUIEffectsContext to the graph that is about to run.
 * UI effect Plugins should be added before this function is called, so they can show up in the debugUIEffectsContext.
 */
export function injectContextWhenRunGraph(networkID: string, nofloNetwork: Network, workflowViewModelStore: StoreApi<WorkflowViewModelStoreState>) {
  const context: IWorkflowContext = {
    id: networkID,
    /**
     * This is a global object that contains all UI effects.
     */
    store: workflowViewModelStore,
  };
  for (const componentName in nofloNetwork.processes) {
    const networkProcess = nofloNetwork.processes[componentName];
    const uiEffectsSocket = new InternalSocket(); // Create a new socket
    networkProcess?.component?.inPorts?.ports?.ui_effects?.attach(uiEffectsSocket);
    uiEffectsSocket.connect(); // Connect the socket

    // Now, you can send the context using the socket, then can be used in all nodes
    uiEffectsSocket.send(new IP('data', context));
  }
}

export type IUIEffect = (...payloads: unknown[]) => void;
export interface IUIEffectPlugin {
  /**
   * Return what you want to add to the UIEffectsContext
   * @returns An object contains many ui effect methods.
   */
  provideUIEffects: () => Record<string, IUIEffect>;
}
