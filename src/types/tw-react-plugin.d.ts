declare module '$:/plugins/linonetwo/tw-react/widget.js' {
  import type React from 'react';
  import type { Widget } from 'tiddlywiki';

  export abstract class widget<Props = Record<string, unknown>> extends Widget {
    reactComponent: React.ComponentType<Props> | null;
    getProps?: () => Props;
    refreshSelf(): void;
    destroy(): void;
  }
}
