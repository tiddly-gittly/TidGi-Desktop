import { type Graph, loadJSON } from 'fbp-graph/lib/Graph';
import { mapValues, sample } from 'lodash';
import TheGraph from 'the-graph';
import { IFbpGraphJSON } from './fbpGraphJSON.type';

export async function loadGraphJSON(graphData: IFbpGraphJSON): Promise<[Graph, TheGraph.IFBPLibrary]> {
  const graph = await loadJSON(JSON.stringify(graphData));

  const library = TheGraph.library.libraryFromGraph(graph);
  // DEBUG: console library
  console.log(`library`, library);
  return [
    graph,
    mapValues(library, component => {
      component.icon = sample(Object.keys(TheGraph.FONT_AWESOME));
      return component;
    }),
  ];
}
