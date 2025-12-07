import { Accordion, AccordionSummary, Paper } from '@mui/material';
import { Button as ButtonRaw, TextField as TextFieldRaw, Typography } from '@mui/material';
import { css, styled } from '@mui/material/styles';
import React, { ReactNode } from 'react';

export const OptionsAccordion = styled((props: React.ComponentProps<typeof Accordion>) => <Accordion {...props} />)`
  box-shadow: unset;
  background-color: unset;
`;

export const OptionsAccordionSummary = styled((props: React.ComponentProps<typeof AccordionSummary>) => <AccordionSummary {...props} />)`
  padding: 0;
  flex-direction: row-reverse;
`;

export const Root = styled((props: React.ComponentProps<typeof Paper>) => <Paper {...props} />)`
  height: 100%;
  width: 100%;
  padding: 20px;
  /** for SaveCancelButtonsContainer 's height */
  margin-bottom: 40px;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.palette.background.paper};
`;

export const FlexGrow = styled('div')`
  flex: 1;
`;

export const Button = styled((props: React.ComponentProps<typeof ButtonRaw>) => <ButtonRaw {...props} />)`
  float: right;
  margin-left: 10px;
`;

export const TextField = styled((props: React.ComponentProps<typeof TextFieldRaw>) => (
  <TextFieldRaw fullWidth margin='dense' size='small' variant='filled' slotProps={{ inputLabel: { shrink: true } }} {...props} />
))`
  margin-bottom: 10px;
`;

export const AvatarFlex = styled('div')`
  display: flex;
`;

export const AvatarLeft = styled('div')`
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 0;
  padding-right: 10px;
`;

export const AvatarRight = styled('div')`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: flex-start;
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 10px;
  padding-right: 0;
`;

export const Avatar = styled('div')<{ transparentBackground?: boolean }>`
  height: 85px;
  width: 85px;
  border-radius: 4px;
  color: #333;
  font-size: 32px;
  line-height: 64px;
  text-align: center;
  font-weight: 500;
  text-transform: uppercase;
  user-select: none;

  overflow: hidden;
  ${({ transparentBackground }) => {
  if (transparentBackground === true) {
    return css`
        background: transparent;
        border: none;
        border-radius: 0;
      `;
  }
}}
`;

export const SaveCancelButtonsContainer = styled('div')`
  position: fixed;
  left: 0;
  bottom: 0;

  height: auto;
  width: 100%;
  padding: 5px;
  background-color: ${({ theme }) => theme.palette.background.paper};
  opacity: 0.9;
  backdrop-filter: blur(10px);
`;

export const AvatarPicture = styled('img')`
  height: 100%;
  width: 100%;
`;

export const PictureButton = styled((props: React.ComponentProps<typeof ButtonRaw>) => <ButtonRaw variant='outlined' size='small' {...props} />)``;

export const _Caption = styled((props: { children?: ReactNode } & React.ComponentProps<typeof Typography>) => <Typography variant='caption' {...props} />)`
  display: block;
`;
