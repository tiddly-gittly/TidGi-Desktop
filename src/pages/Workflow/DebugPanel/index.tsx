/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import ClearAllIcon from '@mui/icons-material/ClearAll';
import CloseIcon from '@mui/icons-material/Close';
import { Dispatch, SetStateAction, useRef } from 'react';
import { flushSync } from 'react-dom';
import Moveable from 'react-moveable';
import { styled } from 'styled-components';

import { Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { DebugUIElements } from './DebugUIElements';
import { registerPlugin } from './plugins';
import { ButtonGroupPlugin } from './plugins/ButtonGroup';
import { TextFieldPlugin } from './plugins/TextField';
import { TextResultPlugin } from './plugins/TextResult';
import { useUIStore } from './useUIStore';

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
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;
const DragHandle = styled.div<{ $graphIsRunning: boolean }>`
  width: 100%;
  height: 1.5em;
  margin-bottom: 0.5em;
  background-color: ${({ theme, $graphIsRunning }) => $graphIsRunning ? theme.palette.primary.main : theme.palette.primary.light};
  cursor: move;

  display: flex;
  flex-direction: row;
  justify-content: flex-end;

  & > svg {
    cursor: pointer;
  }
`;

export function DebugPanel(
  { graphIsRunning, debugPanelOpened, setDebugPanelOpened }: { debugPanelOpened: boolean; graphIsRunning: boolean; setDebugPanelOpened: Dispatch<SetStateAction<boolean>> },
) {
  const { t } = useTranslation();
  const clearDebugPanelElements = useUIStore((state) => state.clearElements);
  const moveableReference = useRef(null);
  const draggableReference = useRef(null);

  return (
    <Container style={{ userSelect: 'none', display: debugPanelOpened ? 'block' : 'none' }}>
      <UIContainer ref={moveableReference}>
        <DragHandle ref={draggableReference} $graphIsRunning={graphIsRunning}>
          <Tooltip title={t('Workflow.ClearDebugPanel')}>
            <ClearAllIcon
              onClick={clearDebugPanelElements}
            />
          </Tooltip>
          <Tooltip title={t('Workflow.ToggleDebugPanel')}>
            <CloseIcon
              onClick={() => {
                setDebugPanelOpened(false);
              }}
            />
          </Tooltip>
        </DragHandle>
        <DebugUIElements />
      </UIContainer>
      <Moveable
        target={moveableReference.current}
        dragTarget={draggableReference.current}
        origin={false}
        draggable={debugPanelOpened}
        resizable={debugPanelOpened}
        flushSync={flushSync}
        throttleDrag={1}
        onDrag={({
          target,
          transform,
        }) => {
          target.style.transform = transform;
        }}
        throttleResize={1}
        renderDirections={['sw']}
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
