import { List as ListRaw, ListItem as ListItemRaw, ListItemText as ListItemTextRaw } from '@mui/material';
import { styled } from '@mui/material/styles';

export const List = styled(ListRaw)`
  & > li > div {
    padding-top: 0;
    padding-bottom: 0;
  }
`;
export const ListItem = styled((props: React.ComponentProps<typeof ListItemRaw>) => <ListItemRaw {...props} />)`
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
export const ListItemText = styled((props: React.ComponentProps<typeof ListItemTextRaw>) => <ListItemTextRaw {...props} />)`
  color: ${({ theme }) => theme.palette.text.primary};
  input {
    color: ${({ theme }) => theme.palette.text.primary};
  }
  p,
  label {
    color: ${({ theme }) => theme.palette.text.secondary};
  }
`;
