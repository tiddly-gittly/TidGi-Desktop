import { IButtonGroupProps } from '@/pages/Workflow/libs/ui/types/UIEffectsContext';
import { Button, ButtonGroup, Card, CardActions, CardContent, Tooltip, Typography } from '@mui/material';
import { styled } from 'styled-components';
import { IUiElementSubmitProps } from '../../libs/ui/debugUIEffects/store';
import type { UIPlugin } from '.';

const ContainerCard = styled(Card)`
  margin-bottom: ${({ theme }) => theme.workflow.debugPanel.cardSpacing}px;
`;

function ButtonGroupComponent({ buttons, onSubmit, id, introduction, isSubmitted }: IButtonGroupProps & IUiElementSubmitProps) {
  return (
    <ContainerCard>
      <CardContent>
        {Boolean(introduction?.length) && (
          <Typography>
            {introduction}
          </Typography>
        )}
      </CardContent>
      <CardActions>
        <ButtonGroup>
          {buttons.map((button, index) => (
            <Tooltip key={index} title={button.description ?? button.label}>
              <Button
                onClick={() => {
                  onSubmit(id, index);
                }}
                disabled={isSubmitted}
              >
                {button.label}
              </Button>
            </Tooltip>
          ))}
        </ButtonGroup>
      </CardActions>
    </ContainerCard>
  );
}
export const ButtonGroupPlugin: UIPlugin = {
  type: 'buttonGroup',
  Component: ButtonGroupComponent,
};
