/* eslint-disable @typescript-eslint/strict-boolean-expressions */
// DebugPanel.tsx
import React, { useRef } from 'react';
import { flushSync } from 'react-dom';
import Moveable from 'react-moveable';
import { styled } from 'styled-components';

import { DebugUIElements } from './DebugUIElements';
import { registerPlugin } from './plugins';
import { ButtonGroupPlugin } from './plugins/ButtonGroup';
import { TextFieldPlugin } from './plugins/TextField';
import { TextResultPlugin } from './plugins/TextResult';

registerPlugin(ButtonGroupPlugin);
registerPlugin(TextFieldPlugin);
registerPlugin(TextResultPlugin);

const Container = styled.div`
  position: absolute;
  right: 0;
  top: 0;
  overflow: visible;
  z-index: 100;
`;
const UIContainer = styled.div`
  width: ${({ theme }) => theme.workflow.debugPanel.width}px;
  height: ${({ theme }) => theme.workflow.debugPanel.height}px;

  background-color: ${({ theme }) => theme.palette.background.paper};
`;
const DragHandle = styled.div`
  width: 100%;
  height: 1em;
  background-color: ${({ theme }) => theme.palette.primary.main};
  cursor: move;
`;

export function DebugPanel({ graphIsRunning }: { graphIsRunning: boolean }) {
  const moveableReference = useRef(null);
  const draggableReference = useRef(null);

  return (
    <Container style={{ userSelect: 'none', display: graphIsRunning ? 'block' : 'none' }}>
      <UIContainer ref={moveableReference} >
        <DragHandle ref={draggableReference} />
        <DebugUIElements />
      </UIContainer>
      <Moveable
        target={moveableReference.current}
        dragTarget={draggableReference.current}
        origin={false}
        draggable={graphIsRunning}
        resizable={graphIsRunning}
        flushSync={flushSync}
        throttleDrag={1}
        onDrag={({
          target,
          transform,
        }) => {
          target.style.transform = transform;
        }}
        throttleResize={1}
        onResize={({
          target,
          width,
          height,
          delta,
        }) => {
          if (delta[0]) {
            target.style.width = `${width}px`;
          }
          if (delta[1]) {
            target.style.height = `${height}px`;
          }
        }}
      />
    </Container>
  );
}
