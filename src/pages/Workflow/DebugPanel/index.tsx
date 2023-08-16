// DebugPanel.tsx
import React, { useRef } from 'react';
import { flushSync } from 'react-dom';
import Moveable from 'react-moveable';
import { useStore } from 'zustand';

import { UIElementState, uiStore, UIStoreState } from '@services/libs/workflow/ui/debugUIEffects/store';
import { plugins, registerPlugin } from './plugins';
import { ButtonGroupPlugin } from './plugins/ButtonGroup';
import { TextFieldPlugin } from './plugins/TextField';
import { TextResultPlugin } from './plugins/TextResult';

registerPlugin(ButtonGroupPlugin);
registerPlugin(TextFieldPlugin);
registerPlugin(TextResultPlugin);

function useUIStore<T>(selector: (state: UIStoreState) => T) {
  return useStore(uiStore, selector);
}

const DebugPanel: React.FC = () => {
  const moveableReference = useRef(null);
  const elements = useUIStore((state) => Object.values(state.elements).filter((element): element is UIElementState => element !== undefined));

  return (
    <>
      <div ref={moveableReference} style={{ userSelect: 'none' }}>
        {elements.map(element => {
          const plugin = plugins.find(p => p.type === element.type);
          // eslint-disable-next-line unicorn/no-null
          return (plugin === undefined) ? null : plugin.component(element.props);
        })}
      </div>
      <Moveable
        target={moveableReference.current}
        draggable={true}
        resizable={true}
        flushSync={flushSync}
        onDrag={({
          target,
          beforeDelta,
          beforeDist,
          left,
          top,
          right,
          bottom,
          delta,
          dist,
          transform,
          clientX,
          clientY,
        }) => {
          console.log('onDrag left, top', left, top);
          // target!.style.left = `${left}px`;
          // target!.style.top = `${top}px`;
          console.log('onDrag translate', dist);
          target.style.transform = transform;
        }}
      />
    </>
  );
};

export default DebugPanel;
