import { Graph } from 'fbp-graph';
import { useCallback, useState } from 'react';
import { graphEvents, graphPortEvents, graphRenameEvents } from './constants';

export interface IGraphChangeEvent {
  event: string;
  payload: any;
}

export function useSubscribeGraph(context: {
  readonly?: boolean;
}) {
  const { readonly } = context;
  const [trackGraphChange, setTrackGraphChange] = useState<Record<string, ((payload: any) => void) | ((from: any, to: any) => void)>>({});
  const [graphChanges, setGraphChanges] = useState<IGraphChangeEvent[]>([]);
  // const [autolayout, setAutolayout] = useState<boolean>(false);

  const subscribeGraph = useCallback((graph: Graph) => {
    const trackChange = trackGraphChange;

    graphEvents.forEach((event) => {
      trackChange[event] = (payload: any) => {
        setGraphChanges((previousChanges) => [
          ...previousChanges,
          {
            event,
            payload,
          },
        ]);

        // if (autolayout) {
        //   triggerAutolayout();
        // }
      };
      graph.on(event, trackChange[event]);
    });
    graphRenameEvents.forEach((event) => {
      trackChange[event] = (from: any, to: any) => {
        setGraphChanges((previousChanges) => [
          ...previousChanges,
          {
            event,
            payload: {
              from,
              to,
            },
          },
        ]);
      };
      graph.on(event, trackChange[event]);
    });
    graphPortEvents.forEach((event) => {
      trackChange[event] = (pub: any, priv: any) => {
        setGraphChanges((previousChanges) => [
          ...previousChanges,
          {
            event,
            payload: {
              public: pub,
              node: priv.process,
              port: priv.port,
              metadata: priv.metadata,
            },
          },
        ]);
      };
      graph.on(event, trackChange[event]);
    });

    trackChange.endTransaction = () => {
      // fire('changed', graph);

      if (graphChanges.length > 0) {
        if (!readonly) {
          // fire('graphChanges', graphChanges);
        }
        setGraphChanges([]);
      }
    };
    graph.on('endTransaction', trackChange.endTransaction);

    setTrackGraphChange(trackChange);
  }, [graphEvents, graphRenameEvents, graphPortEvents, trackGraphChange, graphChanges]);

  const unsubscribeGraph = useCallback((graph: Graph) => {
    if (!trackGraphChange) {
      return;
    }
    const allEvents = [...graphEvents, ...graphRenameEvents, ...graphPortEvents];
    allEvents.forEach((event) => {
      if (!trackGraphChange[event]) {
        return;
      }
      graph.removeListener(event, trackGraphChange[event]);
      const trackChange = trackGraphChange;
      delete trackChange[event];
      setTrackGraphChange(trackChange);
    });

    if (trackGraphChange.endTransaction) {
      graph.removeListener('endTransaction', trackGraphChange.endTransaction);
      const trackChange = trackGraphChange;
      delete trackChange.endTransaction;
      setTrackGraphChange(trackChange);
    }
  }, [graphEvents, graphRenameEvents, graphPortEvents, trackGraphChange]);

  return { subscribeGraph, unsubscribeGraph };
}
