import { List as ListRaw, ListItem as ListItemRaw, ListItemText as ListItemTextRaw } from '@mui/material';
import styled from 'styled-components';

export const List = styled(ListRaw)`
  & > li > div {
    padding-top: 0;
    padding-bottom: 0;
  }
`;
export const ListItem: typeof ListItemRaw = styled(ListItemRaw)`
  svg {
    color: ${({ theme }) => theme.palette.action.active};
  }
  p,
  label {
    color: ${({ theme }) => theme.palette.text.secondary};
  }
  div[role='button'] {
    color: ${({ theme }) => theme.palette.text.primary};
  }
`;
export const ListItemText: typeof ListItemTextRaw = styled(ListItemTextRaw)`
  color: ${({ theme }) => theme.palette.text.primary};
  input {
    color: ${({ theme }) => theme.palette.text.primary};
  }
  p,
  label {
    color: ${({ theme }) => theme.palette.text.secondary};
  }
`;
