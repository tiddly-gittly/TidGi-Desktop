/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable unicorn/prevent-abbreviations */
import type { Graph } from 'fbp-graph';
import type { GraphEdge, GraphNode } from 'fbp-graph/lib/Types';
import { useCallback, useState } from 'react';

function deleteNode(graph: Graph, itemKey: string, item: GraphNode) {
  graph.removeNode(itemKey);
}
function deleteEdge(graph: Graph, itemKey: string, item: GraphEdge) {
  graph.removeEdge(item.from.node, item.from.port, item.to.node, item.to.port);
}
const contextMenus = {
  main: null,
  selection: null,
  nodeInport: null,
  nodeOutport: null,
  graphInport: null,
  graphOutport: null,
  edge: {
    icon: 'long-arrow-right',
    s4: {
      icon: 'trash',
      iconLabel: 'delete',
      action: deleteEdge,
    },
  },
  node: {
    s4: {
      icon: 'trash',
      iconLabel: 'delete',
      action: deleteNode,
    },
  },
  group: {
    icon: 'th',
    s4: {
      icon: 'trash',
      iconLabel: 'ungroup',
      action(graph: Graph, itemKey: string) {
        graph.removeGroup(itemKey);
      },
    },
  },
};

export function useMenu() {
  const [menus, setMenus] = useState<Record<string, any>>(contextMenus);
  const addMenu = useCallback((type: string, options: { icon: string; label: string }) => {
    setMenus(previousMenus => ({
      ...previousMenus,
      [type]: options,
    }));
  }, []);

  const addMenuCallback = useCallback((type: string, callback: Function) => {
    setMenus(previousMenus => {
      if (!previousMenus[type]) {
        return previousMenus;
      }
      return {
        ...previousMenus,
        [type]: { ...previousMenus[type], callback },
      };
    });
  }, []);

  const addMenuAction = useCallback((type: string, direction: string, options: any) => {
    setMenus(previousMenus => {
      const menu = previousMenus[type] || {};
      return {
        ...previousMenus,
        [type]: { ...menu, [direction]: options },
      };
    });
  }, []);

  const getMenuDef = useCallback((options: { graph: any; item: any; itemKey: any; type: string }) => {
    if (options.type && menus[options.type]) {
      const defaultMenu = menus[options.type];
      if (defaultMenu.callback) {
        return defaultMenu.callback(defaultMenu, options);
      }
      return defaultMenu;
    }
    return null;
  }, [menus]);

  return { addMenu, addMenuCallback, addMenuAction, getMenuDef };
}
