import { ReactNode } from 'react';

export interface UIPlugin {
  component: (props: any) => JSX.Element | ReactNode;
  type: string;
}

export const plugins: UIPlugin[] = [];

export const registerPlugin = (plugin: UIPlugin) => {
  plugins.push(plugin);
};
