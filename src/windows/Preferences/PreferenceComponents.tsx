import { InputLabel as InputLabelRaw, ListItem as ListItemRaw, Paper as PaperRaw, TextField as TextFieldRaw, Typography } from '@mui/material';
import { keyframes, styled } from '@mui/material/styles';
import { ReactNode } from 'react';

export const Paper = styled(PaperRaw)`
  margin-top: 5px;
  margin-bottom: 30px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-color: ${({ theme }) => theme.palette.divider};
  background: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
`;

export const PageRoot = styled('div')`
  padding: 20px;
  overflow-x: hidden;
`;

export const PageInner = styled('div')`
  width: 100%;
  max-width: 550px;
  /* Use min-width so the skeleton placeholders never cause a narrower layout that
     makes the scrollbar appear momentarily during progressive section rendering. */
  min-width: 300px;
  float: right;
  box-sizing: border-box;
`;

const animateMoveFromRight = keyframes`
  from {
    transform: translate3d(40px, 0, 0);
    opacity: 0;
  }

  to {
    transform:translate3d(0px, 0, 0);
    opacity: 1;
  }
`;
export const SectionTitle = styled((props: { children?: ReactNode } & React.ComponentProps<typeof Typography>) => <Typography variant='subtitle2' {...props} />)`
  padding-left: 0px !important;
  animation: ${animateMoveFromRight} 0.5s cubic-bezier(0.4, 0, 0.2, 1);
`;

export const TextField = styled((props: React.ComponentProps<typeof TextFieldRaw>) => <TextFieldRaw variant='standard' {...props} />)`
  color: ${({ theme }) => theme.palette.text.primary};
  input {
    color: ${({ theme }) => theme.palette.text.primary};
  }
  p,
  label {
    color: ${({ theme }) => theme.palette.text.secondary};
  }
`;

export const InputLabel = styled(InputLabelRaw)`
  color: ${({ theme }) => theme.palette.text.primary};
`;
export const ListItemVertical = styled(ListItemRaw)`
  flex-direction: column;
  align-items: flex-start;
  padding-bottom: 10px;

  & .MuiTextField-root {
    margin-top: 20px;
  }
`;

export const TimePickerContainer = styled('div')`
  margin-top: 10px;
  margin-bottom: 10px;
  display: flex;
  margin-right: 20px;
`;

export const Link = styled((props: { children?: ReactNode } & React.HTMLAttributes<HTMLSpanElement>) => <span role='link' tabIndex={0} {...props} />)`
  cursor: pointer;
  font-weight: 500px;
  outline: none;
  &:hover {
    text-decoration: underline;
  }
  &:focus {
    text-decoration: underline;
  }
`;
