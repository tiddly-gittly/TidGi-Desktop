import { Button, ButtonGroup } from '@mui/material';
import { IButtonGroupProps } from '@services/libs/workflow/ui/types/UIEffectsContext';
import { FC } from 'react';
import { IUiElementSubmitProps } from '../../../../services/libs/workflow/ui/debugUIEffects/store';
import type { UIPlugin } from '.';

const ButtonGroupComponent: FC<IButtonGroupProps & IUiElementSubmitProps> = ({ buttons, onSubmit, id }) => (
  <ButtonGroup>
    {buttons.map((button, index) => (
      <Button
        key={index}
        onClick={() => {
          onSubmit(id, index);
        }}
      >
        {button.label}
      </Button>
    ))}
  </ButtonGroup>
);
export const ButtonGroupPlugin: UIPlugin = {
  type: 'buttonGroup',
  component: ButtonGroupComponent,
};
