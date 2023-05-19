import styled, { css } from 'styled-components';

export const RootStyle = styled.div`
  .Mui-selected,
  .Mui-checked {
    ${({ theme }) =>
  theme.palette.mode === 'dark'
    ? css`
            color: ${theme.palette.primary.light} !important;
          `
    : ''};
  }
  .Mui-disabled {
    ${({ theme }) =>
  theme.palette.mode === 'dark'
    ? css`
            color: ${theme.palette.primary.dark} !important;
            -webkit-text-fill-color: ${theme.palette.primary.light};
          `
    : ''};
  }

  label,
  input,
  p {
    color: ${({ theme }) => theme.palette.text.primary};
  }
`;
