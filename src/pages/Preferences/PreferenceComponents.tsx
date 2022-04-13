import styled, { keyframes } from 'styled-components';
import { Paper as PaperRaw, Typography, ListItem, TextField as TextFieldRaw } from '@material-ui/core';

export const Paper = styled(PaperRaw)`
  margin-top: 5px;
  margin-bottom: 30px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-color: ${({ theme }) => theme.palette.divider};
  background: ${({ theme }) => theme.palette.background.paper};
  color: ${({ theme }) => theme.palette.text.primary};
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
export const SectionTitle = styled(Typography)`
  padding-left: 0px !important;
  animation: ${animateMoveFromRight} 0.5s cubic-bezier(0.4, 0, 0.2, 1);
`;
SectionTitle.defaultProps = {
  variant: 'subtitle2',
};

export const TextField = styled(TextFieldRaw)`
  color: ${({ theme }) => theme.palette.text.primary};
`;
TextField.defaultProps = {
  variant: 'standard',
};

export const ListItemVertical: typeof ListItem = styled(ListItem)`
  flex-direction: column;
  align-items: flex-start;
  padding-bottom: 10px;

  & ${TextField} {
    margin-top: 20px;
  }
`;

export const TimePickerContainer = styled.div`
  margin-top: 10px;
  margin-bottom: 10px;
  display: flex;
  margin-right: 20px;
`;

export const Link = styled.span`
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
Link.defaultProps = {
  role: 'link',
  tabIndex: 0,
};
