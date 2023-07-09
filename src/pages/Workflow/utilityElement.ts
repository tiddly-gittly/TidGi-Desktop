import type { Graph } from 'fbp-graph';
import { type RefObject, useEffect } from 'react';
import TheGraph from 'the-graph';

// const Thumbnail = styled.canvas`
//   border: 1px solid;
//   width: 300px;
//   height: 200px;

//   position: absolute;
//   bottom: 0;
//   right: 0;
//   z-index: 1;
// `;
/**
 * 
 * ```ts
 * const thumbnailReference = useRef<HTMLCanvasElement>(null);
 * useThumbnail(graph, thumbnailReference, theme);
 * <Thumbnail ref={thumbnailReference} id='thumb' />
 * ```
 * @param graph 
 * @param thumbnailElementReference 
 * @param theme 
 */
export function useThumbnail(graph: Graph, thumbnailElementReference: RefObject<HTMLCanvasElement>, theme: 'dark' | 'light') {
  useEffect(() => {
    // Render the numbnail
    const thumb = thumbnailElementReference.current;
    if (thumb === null) return;
    const properties = TheGraph.thumb.styleFromTheme(theme);
    properties.width = thumb.width;
    properties.height = thumb.height;
    properties.nodeSize = 60;
    properties.lineWidth = 1;
    const context = thumb.getContext('2d');
    TheGraph.thumb.render(context, graph, properties);
  }, [graph, theme, thumbnailElementReference]);
}
