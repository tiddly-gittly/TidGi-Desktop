import { UIElementState } from '@/pages/Workflow/libs/ui/debugUIEffects/store';
import { Typography } from '@mui/material';
import { useEffect, useRef } from 'react';
import { styled } from 'styled-components';
import { plugins } from './plugins';
import { useUIStore } from './useUIStore';

const Container = styled.div`
  padding: 0 1em;
  height: 100%;
  overflow-y: auto;
  &::-webkit-scrollbar {
    width: 0;
  }
`;

export function DebugUIElements() {
  const elements = useUIStore((state) =>
    Object.values(state.elements ?? {}).filter((element): element is UIElementState => element !== undefined).sort((a, b) => a.timestamp - b.timestamp)
  );
  const onSubmit = useUIStore((state) => state.submitElement);
  /**
   * Ref to the Container element for scrolling
   */
  const containerReference = useRef<HTMLDivElement | null>(null);

  // Scroll to the bottom when elements list changes
  useEffect(() => {
    if (containerReference.current !== null) {
      containerReference.current.scrollTop = containerReference.current.scrollHeight;
    }
  }, [elements]);
  return (
    <Container ref={containerReference}>
      {elements.map(element => {
        const { type, id, props = {}, isSubmitted, timestamp } = element;
        const plugin = plugins.find(p => p.type === type);
        if (plugin === undefined) {
          // TODO: return a placeholder element instead
          // eslint-disable-next-line unicorn/no-null
          return null;
        }
        const { Component } = plugin;
        return (
          <div key={id}>
            <Typography color='textSecondary'>
              {new Date(timestamp).toLocaleTimeString()}
            </Typography>
            <Component {...props} onSubmit={onSubmit} id={id} isSubmitted={isSubmitted} />
          </div>
        );
      })}
    </Container>
  );
}
