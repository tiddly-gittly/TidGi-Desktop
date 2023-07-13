/**
 * @param componentName `node.component`
 * @url https://github.com/flowhub/the-graph/blob/b4ca641f4ace6181e14068f84658c502166022fb/the-graph-editor/clipboard.js
 */
export function makeNewID(componentName: string) {
  let number_ = 60_466_176; // 36^5
  number_ = Math.floor(Math.random() * number_);
  const id = `${componentName}_${number_.toString(36)}`;
  return id;
}
