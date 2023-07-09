import { Graph, loadJSON } from 'fbp-graph/lib/Graph';
import TheGraph from 'the-graph';
import { IFbpGraphJSON } from './fbpGraphJSON.type';

export async function loadGraphJSON(graphData: IFbpGraphJSON): Promise<[Graph, TheGraph.IFBPLibrary]> {
  const graph = await loadJSON(JSON.stringify(graphData));

  const library = TheGraph.library.libraryFromGraph(graph);
  return [graph, library];
}
