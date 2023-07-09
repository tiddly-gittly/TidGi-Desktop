import { useEffect, useState } from 'react';

export function useOnChange(props) {
  const { graph, unsubscribeGraph, svgcontainer, subscribeGraph } = props;
  const [selectedNodesHash, setSelectedNodesHash] = useState<any>({});
  const [errorNodes, setErrorNodes] = useState<any[]>([]);
  const [animatedEdges, setAnimatedEdges] = useState<any[]>([]);

  // useEffect(() => {
  //   // equivalent to `graphChanged` in the Polymer component

  //   if (graph) {
  //     unsubscribeGraph(graph);
  //   }

  //   if (props.appView) {
  //     ReactDOM.unmountComponentAtNode(svgcontainer);
  //   }

  //   if (graph) {
  //     subscribeGraph(graph);
  //   }
  // }, [props.graph]);

  // useEffect(() => {
  //   // equivalent to `selectedNodesChanged` in the Polymer component
  //   const newSelectedNodesHash = {};
  //   props.selectedNodes.forEach((item) => {
  //     newSelectedNodesHash[item.id] = true;
  //   });
  //   setSelectedNodesHash(newSelectedNodesHash);
  // }, [props.selectedNodes]);

  // useEffect(() => {
  //   // equivalent to `selectedNodesHashChanged` in the Polymer component
  //   if (graphView) {
  //     graphView.setSelectedNodes(selectedNodesHash);
  //   }
  // }, [selectedNodesHash, graphView]);

  // useEffect(() => {
  //   // equivalent to `errorNodesChanged` in the Polymer component
  //   if (graphView) {
  //     graphView.setErrorNodes(props.errorNodes);
  //   }
  // }, [props.errorNodes, graphView]);

  // useEffect(() => {
  //   // equivalent to `selectedEdgesChanged` in the Polymer component
  //   if (graphView) {
  //     graphView.setSelectedEdges(props.selectedEdges);
  //   }
  // }, [props.selectedEdges, graphView]);

  // useEffect(() => {
  //   // equivalent to `animatedEdgesChanged` in the Polymer component
  //   if (graphView) {
  //     graphView.setAnimatedEdges(props.animatedEdges);
  //   }
  // }, [props.animatedEdges, graphView]);

  // useEffect(() => {
  //   // equivalent to `iconsChanged` in the Polymer component
  //   if (graphView) {
  //     Object.keys(props.icons).forEach((nodeId) => {
  //       graphView.updateIcon(nodeId, props.icons[nodeId]);
  //     });
  //   }
  // }, [props.icons, graphView]);
}
