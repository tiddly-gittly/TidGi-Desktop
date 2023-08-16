import { UIElementState, uiStore, UIStoreState } from '@services/libs/workflow/ui/debugUIEffects/store';
import { styled } from 'styled-components';
import { useStore } from 'zustand';
import { plugins } from './plugins';
import { useUIStore } from './useUIStore';

const Container = styled.div`
  padding: 0 1em;
`;

export function DebugUIElements() {
  const elements = useUIStore((state) => Object.values(state.elements).filter((element): element is UIElementState => element !== undefined));
  const onSubmit = useUIStore((state) => state.submitElement);
  return (
    <Container>
      {elements.map(element => {
        const { type, id, props = {} } = element;
        const plugin = plugins.find(p => p.type === type);
        if (plugin === undefined) {
          // TODO: return a placeholder element instead
          // eslint-disable-next-line unicorn/no-null
          return null;
        }
        const { Component } = plugin;
        return <Component key={id} {...props} onSubmit={onSubmit} id={id} />;
      })}
    </Container>
  );
}
