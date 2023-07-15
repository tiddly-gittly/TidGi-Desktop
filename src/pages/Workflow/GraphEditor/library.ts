import { Component, ComponentLoader, InPort } from 'noflo';
import type BasePort from 'noflo/lib/BasePort';
import { useEffect, useState } from 'react';
import type { IFBPLibrary, INoFloProtocolComponent, INoFloProtocolComponentPort, INoFloUIComponent, INoFloUIComponentPort } from 'the-graph';

/**
 * Covert FBP Protocol component to the-graph library component
 * @url https://github.com/noflo/noflo-ui/blob/22d26eca71b52cd5181dd253f76bdb13c6bfecd4/src/runtime.js#L17C1-L33
 */
export function componentForLibrary(component: INoFloProtocolComponent): INoFloUIComponent {
  return {
    name: component.name,
    icon: component.icon ?? 'cog',
    description: component.description ?? '',
    subgraph: component.subgraph ?? false,
    inports: component.inPorts?.map(portForLibrary) ?? [],
    outports: component.outPorts?.map(portForLibrary) ?? [],
  };
}

/**
 * Convert noflo instance return by `componentDefinition.getComponent()`, to the input of `componentForLibrary`
 * @url https://github.com/noflo/noflo-runtime-base/blob/36ff1a439e1df9ad7611afd3cda908cce9e14fe2/src/protocol/Component.js#L186-L211
 */
export function componentToProtocolComponent(name: string, instance: Component): INoFloProtocolComponent {
  const inPorts: INoFloProtocolComponentPort[] = [];
  const outPorts: INoFloProtocolComponentPort[] = [];
  // support old noflo.Component that put BasePort directly in inPorts https://github.com/noflo/noflo/blob/6187566f761a463af95dd186de55dc488e2f03b8/src/lib/Component.js#L314
  const inPortInstances = instance.inPorts.ports ?? instance.inPorts as unknown as BasePort[];
  const outPortInstances = instance.outPorts.ports ?? instance.outPorts as unknown as BasePort[];
  Object.keys(inPortInstances).forEach((portName) => {
    const port = inPortInstances[portName];
    if (port === undefined || (typeof port === 'function') || !port.canAttach()) return;
    inPorts.push(processPort(portName, port));
  });
  Object.keys(outPortInstances).forEach((portName) => {
    const port = outPortInstances[portName];
    if (port === undefined || (typeof port === 'function') || !port.canAttach()) return;
    outPorts.push(processPort(portName, port));
  });

  const icon = instance?.getIcon() ?? 'gear';

  return {
    name,
    description: instance.description,
    subgraph: instance.isSubgraph(),
    icon,
    inPorts,
    outPorts,
  };
}

function processPort(portName: string, port: BasePort): INoFloProtocolComponentPort {
  /* eslint-disable @typescript-eslint/strict-boolean-expressions */
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  /* eslint-disable @typescript-eslint/no-unsafe-member-access */

  // Required port properties
  const portSerialized: INoFloProtocolComponentPort = {
    id: portName,
    type: (port?.getDataType?.() as string | undefined) ?? 'all',
    schema: port?.getSchema?.() as string | undefined,
    required: port?.isRequired?.() ?? false,
    default: ((port as InPort)?.hasDefault?.() ?? false) ? port.options.default : undefined,
    description: port.getDescription(),
    values: port.options.values,
  };
  return portSerialized;
}

function portForLibrary(port: INoFloProtocolComponentPort): INoFloUIComponentPort {
  return {
    ...port,
    name: port.id,
    description: port.description || port.type,
  };
}

export async function getBrowserComponentLibrary() {
  const loader = new ComponentLoader('');
  const componentList = await loader.listComponents();
  const libraryToLoad: IFBPLibrary = {};
  Object.entries(componentList).forEach(([name, componentDefinitionRaw]) => {
    if (typeof componentDefinitionRaw === 'string') {
      // TODO: handle these ComponentDefinition types
      return;
    }
    if ('getComponent' in componentDefinitionRaw) {
      const componentInstance = componentDefinitionRaw.getComponent();
      libraryToLoad[name] = componentForLibrary(componentToProtocolComponent(name, componentInstance));
    }
  });
  return libraryToLoad;
}

// const registerComponent = (definition: Component, generated: boolean) => {
//   const component = getComponent(definition.name);
//   if (component && generated) {
//     return;
//   }
//   if (library === undefined) return;
//   library[definition.name] = definition;
//   // debounceLibraryRefesh();
//   if (definition.name.includes('/')) {
//     const unnamespaced = unnamespace(definition.name);
//     registerComponent({
//       ...definition,
//       name: unnamespaced,
//       unnamespaced: true,
//     }, false);
//   }
// };

export function useLibrary() {
  // load library bundled by webpack noflo-component-loader from installed noflo related npm packages
  const [library, setLibrary] = useState<IFBPLibrary | undefined>();
  useEffect(() => {
    void (async () => {
      const libraryToLoad = await getBrowserComponentLibrary();
      setLibrary(libraryToLoad);
    })();
  }, []);
  return library;
}
