import { TextField, Typography } from '@mui/material';
import { ITextFieldProps } from '@/pages/Workflow/libs/ui/types/UIEffectsContext';
import { useState } from 'react';
import type { IUiElementSubmitProps } from '../../libs/ui/debugUIEffects/store';
import type { UIPlugin } from '.';

function TextFieldPluginComponent({ label, placeholder, description, introduction, id, onSubmit }: ITextFieldProps & IUiElementSubmitProps) {
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
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onSubmit(id, value);
          }
        }}
      />
    </>
  );
}

export const TextFieldPlugin: UIPlugin = {
  type: 'textField',
  Component: TextFieldPluginComponent,
};
