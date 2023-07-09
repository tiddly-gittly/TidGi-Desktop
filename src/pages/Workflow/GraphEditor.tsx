import { sidebarWidth } from '@/constants/style';
import { Graph } from 'fbp-graph';
import styled from 'styled-components';
import TheGraph, { type ITheGraphProps } from 'the-graph';
import 'the-graph/themes/the-graph-dark.css';
import 'the-graph/themes/the-graph-light.css';

// Component library
const library = {
  basic: {
    name: 'basic',
    description: 'basic demo component',
    icon: 'eye',
    inports: [
      { name: 'in0', type: 'all' },
      { name: 'in1', type: 'all' },
      { name: 'in2', type: 'all' },
    ],
    outports: [
      { name: 'out', type: 'all' },
    ],
  },
  tall: {
    name: 'tall',
    description: 'tall demo component',
    icon: 'cog',
    inports: [
      { name: 'in0', type: 'all' },
      { name: 'in1', type: 'all' },
      { name: 'in2', type: 'all' },
      { name: 'in3', type: 'all' },
      { name: 'in4', type: 'all' },
      { name: 'in5', type: 'all' },
      { name: 'in6', type: 'all' },
      { name: 'in7', type: 'all' },
      { name: 'in8', type: 'all' },
      { name: 'in9', type: 'all' },
      { name: 'in10', type: 'all' },
      { name: 'in11', type: 'all' },
      { name: 'in12', type: 'all' },
    ],
    outports: [
      { name: 'out0', type: 'all' },
    ],
  },
};
// Load empty graph
const graph = new Graph();

const Container = styled.main`
  .the-graph-app > svg, .the-graph-app > canvas {
    left: ${sidebarWidth}px!important;
  }
  &.the-graph-light .the-graph-app, &.the-graph-dark .the-graph-app {
    background-color: ${({ theme }) => theme.palette.background.default};
  }
`;

export interface IGraphEditorProps {
  theme: 'light' | 'dark';
}

export function GraphEditor(props: Partial<ITheGraphProps> & IGraphEditorProps) {
  return (
    <Container className={`the-graph-${props.theme}`}>
      <TheGraph.App readonly={false} height={window.innerHeight} width={window.innerWidth - sidebarWidth} library={library} graph={graph} offsetX={sidebarWidth} {...props} />
    </Container>
  );
}
