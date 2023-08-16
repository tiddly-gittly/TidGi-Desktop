import { ITextFieldProps } from '@/pages/Workflow/libs/ui/types/UIEffectsContext';
import SendIcon from '@mui/icons-material/Send';
import { IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { useRef, useState } from 'react';

import type { IUiElementSubmitProps } from '../../libs/ui/debugUIEffects/store';
import type { UIPlugin } from '.';

function TextFieldPluginComponent({ label, placeholder, description, introduction, id, onSubmit, isSubmitted }: ITextFieldProps & IUiElementSubmitProps) {
  const [value, setValue] = useState<string>('');
  const isComposing = useRef(false);
  return (
    <>
      {Boolean(introduction?.length) && (
        <Typography>
          {introduction}
        </Typography>
      )}
      <TextField
        fullWidth
        disabled={isSubmitted}
        label={label}
        placeholder={placeholder}
        helperText={description}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position='end'>
              <IconButton
                aria-label='toggle password visibility'
                onClick={() => {
                  if (!isComposing.current) {
                    onSubmit(id, value);
                  }
                }}
                edge='end'
              >
                <SendIcon />
              </IconButton>
            </InputAdornment>
          ),
        }}
        onCompositionEnd={() => {
          isComposing.current = false;
        }}
        onCompositionStart={() => {
          isComposing.current = true;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !isComposing.current) {
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
