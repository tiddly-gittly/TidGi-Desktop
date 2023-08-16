import { TextField, Typography } from '@mui/material';
import { ITextFieldProps } from '@services/libs/workflow/ui/types/UIEffectsContext';
import { FC, useState } from 'react';
import type { IUiElementSubmitProps } from '../../../../services/libs/workflow/ui/debugUIEffects/store';
import type { UIPlugin } from '.';

const TextFieldPluginComponent: FC<ITextFieldProps & IUiElementSubmitProps> = ({ label, placeholder, description, introduction, id, onSubmit }) => {
  const [value, setValue] = useState<string>('');
  return (
    <>
      {Boolean(introduction?.length) && (
        <Typography>
          {introduction}
        </Typography>
      )}
      <TextField
        label={label}
        placeholder={placeholder}
        helperText={description}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onSubmit={() => {
          onSubmit(id, value);
        }}
      />
    </>
  );
};

export const TextFieldPlugin: UIPlugin = {
  type: 'textField',
  component: TextFieldPluginComponent,
};
