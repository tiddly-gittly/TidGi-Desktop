import { ITextFieldProps } from '@/pages/Workflow/libs/ui/types/UIEffectsContext';
import SendIcon from '@mui/icons-material/Send';
import { Card, CardActions, CardContent, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import { styled } from 'styled-components';

import type { IUiElementSubmitProps } from '../../libs/ui/debugUIEffects/store';
import type { UIPlugin } from '.';

const ContainerCard = styled(Card)`
  margin-bottom: ${({ theme }) => theme.workflow.debugPanel.cardSpacing}px;
`;

function TextFieldPluginComponent({ label, placeholder, description, introduction, id, onSubmit, isSubmitted }: ITextFieldProps & IUiElementSubmitProps) {
  const [value, setValue] = useState<string>('');
  const isComposing = useRef(false);
  return (
    <ContainerCard>
      {Boolean(introduction?.length) && (
        <CardContent>
          <Typography>
            {introduction}
          </Typography>
        </CardContent>
      )}
      <CardActions>
        <TextField
          autoFocus
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
      </CardActions>
    </ContainerCard>
  );
}

export const TextFieldPlugin: UIPlugin = {
  type: 'textField',
  Component: TextFieldPluginComponent,
};
