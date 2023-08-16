// DebugPanel.tsx
import React, { useRef } from 'react';
import { flushSync } from 'react-dom';
import Moveable from 'react-moveable';

import { DebugUIElements } from './DebugUIElements';
import { registerPlugin } from './plugins';
import { ButtonGroupPlugin } from './plugins/ButtonGroup';
import { TextFieldPlugin } from './plugins/TextField';
import { TextResultPlugin } from './plugins/TextResult';

registerPlugin(ButtonGroupPlugin);
registerPlugin(TextFieldPlugin);
registerPlugin(TextResultPlugin);

const DebugPanel: React.FC = () => {
  const moveableReference = useRef(null);

  return (
    <>
      <div ref={moveableReference} style={{ userSelect: 'none' }}>
        <DebugUIElements />
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
