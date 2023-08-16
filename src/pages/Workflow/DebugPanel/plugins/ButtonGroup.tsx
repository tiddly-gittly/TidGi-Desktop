import { Button, ButtonGroup } from '@mui/material';
import { IButtonGroupProps } from '@services/libs/workflow/ui/types/UIEffectsContext';
import { IUiElementSubmitProps } from '../../../../services/libs/workflow/ui/debugUIEffects/store';
import type { UIPlugin } from '.';

function ButtonGroupComponent({ buttons, onSubmit, id }: IButtonGroupProps & IUiElementSubmitProps) {
  return (
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
}
export const ButtonGroupPlugin: UIPlugin = {
  type: 'buttonGroup',
  Component: ButtonGroupComponent,
};
