import styled from '@mui/styled-engine';
import { describe, expect, it } from 'vitest';

describe('Material-UI Styled Engine Integration', () => {
  it('should import styled function correctly', () => {
    expect(styled).toBeDefined();
    expect(typeof styled).toBe('function');
  });

  it('should create a styled component', () => {
    const StyledDiv = styled('div')`
      color: red;
    `;

    expect(StyledDiv).toBeDefined();
    expect(typeof StyledDiv).toBe('function');
  });
});
