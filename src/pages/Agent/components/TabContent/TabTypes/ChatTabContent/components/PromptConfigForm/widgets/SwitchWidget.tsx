import { alpha, Box, FormControlLabel, Switch, Typography } from '@mui/material';
import { WidgetProps } from '@rjsf/utils';
import React from 'react';

/**
 * Switch widget for boolean values with a cleaner toggle interface
 * Features:
 * - Visual state feedback
 * - Animated transitions
 * - Custom label styling
 * - Background color changes
 */
export const SwitchWidget = (props: WidgetProps): React.ReactElement => {
  const id = props.id;
  const value: unknown = props.value;
  const _required = props.required;
  const disabled = props.disabled;
  const readonly = props.readonly;
  const onChange = props.onChange;
  const onBlur = props.onBlur;
  const onFocus = props.onFocus;
  const label = props.label;
  const schema = props.schema;

  // Safely handle boolean value
  const switchValue = typeof value === 'boolean' ? value : false;

  const _onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked);
  };

  const _onBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
    onBlur(id, (event.target as HTMLInputElement).checked);
  };

  const _onFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    onFocus(id, (event.target as HTMLInputElement).checked);
  };

  return (
    <Box sx={{ mb: 1 }}>
      <FormControlLabel
        control={
          <Switch
            id={id}
            checked={switchValue}
            required={_required}
            disabled={disabled || readonly}
            onChange={_onChange}
            onBlur={_onBlur}
            onFocus={_onFocus}
            color='primary'
          />
        }
        label={
          <Typography
            variant='body1'
            component='span'
            sx={{
              fontWeight: switchValue ? 500 : 400,
              color: switchValue ? 'text.primary' : 'text.secondary',
            }}
          >
            {label}
            {_required && (
              <Typography component='span' color='error.main' sx={{ ml: 0.5 }}>
                *
              </Typography>
            )}
          </Typography>
        }
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          ml: 0,
          width: '100%',
          pr: 1,
          border: '1px solid',
          borderColor: switchValue ? 'primary.light' : 'divider',
          borderRadius: 1,
          p: 1,
          backgroundColor: switchValue ? alpha('#2196f3', 0.05) : 'transparent',
          transition: 'background-color 0.2s, border-color 0.2s',
        }}
      />
      {schema.description && (
        <Typography
          variant='caption'
          color='text.secondary'
          sx={{
            mt: 0.5,
            display: 'block',
            ml: 4,
            fontStyle: 'italic',
          }}
        >
          {schema.description}
        </Typography>
      )}
    </Box>
  );
};
