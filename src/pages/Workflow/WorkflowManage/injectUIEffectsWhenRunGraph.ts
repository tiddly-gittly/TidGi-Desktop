import { INetworkServerToClientUpdate } from '@services/workflow/interface';
import { IP } from 'noflo';
import { InternalSocket } from 'noflo/lib/InternalSocket';
import type { Network } from 'noflo/lib/Network';

export interface IWorkflowServiceMethodForNetwork {
sendNetworkActionsToClient: (networkID: string, actions: INetworkServerToClientUpdate) => void;
}

/**
 * Inject prepared debugUIEffectsContext to the graph that is about to run.
 * UI effect Plugins should be added before this function is called, so they can show up in the debugUIEffectsContext.
 */
export function injectUIEffectsWhenRunGraph(networkID: string, nofloNetwork: Network, methods: IWorkflowServiceMethodForNetwork) {
  /**
 * This is a global object that contains all UI effects.
 */
  const uiEffectsContext: UIEffectsContext = {
      /** adds element and returns its ID */
  addElement(element: Pick<UIElementState, 'type' | 'props' | 'author'>) : string {
    methods.sendNetworkActionsToClient(networkID, {
      type: 'addElementToChat',
      payload: {
        chatID: networkID,
        element,
      },
    });
  },
  clearElements: () => void;
  removeElement: (id: string) => void;
  submitElement: (id: string, content: unknown) => void;
  /** update existing element with new props, props will merge with old props, undefined value will be omitted (to use old value) */
  updateElementProps: (element: Pick<UIElementState, 'id' | 'props'>) => void;
    onSubmit: async (uiElementID: string) => {
      return await new Promise((resolve) => {
        // Watch for submission of this field
        const unsubscribe = uiStore.subscribe(
          (state) => {
            const element = state.elements?.[uiElementID];
            if (element?.isSubmitted) {
              resolve(element.content);
              unsubscribe();
            }
          },
        );
      });
    },
  };
  for (const componentName in nofloNetwork.processes) {
    const networkProcess = nofloNetwork.processes[componentName];
    const uiEffectsSocket = new InternalSocket(); // Create a new socket
    networkProcess?.component?.inPorts?.ports?.ui_effects?.attach(uiEffectsSocket);
    uiEffectsSocket.connect(); // Connect the socket

    // Now, you can send the debugUIEffectsContext using the socket
    uiEffectsSocket.send(new IP('data', debugUIEffectsContext));
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
