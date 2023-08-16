import { IResultTextProps } from '@/pages/Workflow/libs/ui/types/UIEffectsContext';
import { Card, CardContent, Typography } from '@mui/material';
import { styled } from 'styled-components';
import type { UIPlugin } from '.';

const ContainerCard = styled(Card)`
  margin-bottom: ${({ theme }) => theme.workflow.debugPanel.cardSpacing}px;
`;

function Component({ content }: IResultTextProps) {
  return (
    <ContainerCard>
      <CardContent>
        <Typography>
          {content}
        </Typography>
      </CardContent>
    </ContainerCard>
  );
}
export const TextResultPlugin: UIPlugin = {
  type: 'textResult',
  Component,
};
