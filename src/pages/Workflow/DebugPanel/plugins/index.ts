export interface UIPlugin {
  Component: (props: any) => JSX.Element;
  type: string;
}

export const plugins: UIPlugin[] = [];

export const registerPlugin = (plugin: UIPlugin) => {
  plugins.push(plugin);
};
