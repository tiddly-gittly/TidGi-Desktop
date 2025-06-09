/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { Box, IconButton, InputAdornment } from '@mui/material';
import { WidgetProps } from '@rjsf/utils';
import React, { useCallback } from 'react';
import { StyledTextField } from '../components';

export const NumberWidget: React.FC<WidgetProps> = (props) => {
  const {
    id,
    value,
    required,
    readonly,
    disabled,
    autofocus,
    placeholder,
    onBlur,
    onFocus,
    onChange,
    schema,
  } = props;

  const numericValue = typeof value === 'number' ? value : (value ? Number(String(value)) : undefined);
  const step = schema.multipleOf || 1;
  const min = typeof schema.minimum === 'number' ? schema.minimum : undefined;
  const max = typeof schema.maximum === 'number' ? schema.maximum : undefined;

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    if (newValue === '') {
      onChange(undefined);
    } else {
      const parsedValue = Number(newValue);
      if (!isNaN(parsedValue)) {
        onChange(parsedValue);
      }
    }
  }, [onChange]);

  const handleIncrement = useCallback(() => {
    if (disabled || readonly) return;
    const currentValue = numericValue || 0;
    const newValue = currentValue + step;
    if (max === undefined || newValue <= max) {
      onChange(newValue);
    }
  }, [numericValue, step, max, onChange, disabled, readonly]);

  const handleDecrement = useCallback(() => {
    if (disabled || readonly) return;
    const currentValue = numericValue || 0;
    const newValue = currentValue - step;
    if (min === undefined || newValue >= min) {
      onChange(newValue);
    }
  }, [numericValue, step, min, onChange, disabled, readonly]);

  const handleBlur = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    onBlur(id, event.target.value);
  }, [onBlur, id]);

  const handleFocus = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    onFocus(id, event.target.value);
  }, [onFocus, id]);

  const isDecrementDisabled = disabled || readonly || (min !== undefined && numericValue !== undefined && numericValue <= min);
  const isIncrementDisabled = disabled || readonly || (max !== undefined && numericValue !== undefined && numericValue >= max);

  return (
    <StyledTextField
      id={id}
      type='number'
      value={numericValue !== undefined ? String(numericValue) : ''}
      required={required}
      disabled={disabled}
      autoFocus={autofocus}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      fullWidth
      variant='outlined'
      slotProps={{
        htmlInput: {
          readOnly: readonly,
          step,
          min,
          max,
          style: {
            MozAppearance: 'textfield',
          },
        },
        input: {
          endAdornment: (
            <InputAdornment position='end'>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                <IconButton
                  size='small'
                  onClick={handleIncrement}
                  disabled={isIncrementDisabled}
                  sx={{
                    padding: 0.25,
                    minWidth: 20,
                    minHeight: 16,
                    borderRadius: 0.5,
                    backgroundColor: (theme) => theme.palette.action.hover,
                    '&:hover': {
                      backgroundColor: (theme) => theme.palette.action.focus,
                    },
                    '&:disabled': {
                      backgroundColor: 'transparent',
                      opacity: 0.5,
                    },
                    '& .MuiSvgIcon-root': {
                      fontSize: '0.75rem',
                    },
                  }}
                >
                  <AddIcon />
                </IconButton>
                <IconButton
                  size='small'
                  onClick={handleDecrement}
                  disabled={isDecrementDisabled}
                  sx={{
                    padding: 0.25,
                    minWidth: 20,
                    minHeight: 16,
                    borderRadius: 0.5,
                    backgroundColor: (theme) => theme.palette.action.hover,
                    '&:hover': {
                      backgroundColor: (theme) => theme.palette.action.focus,
                    },
                    '&:disabled': {
                      backgroundColor: 'transparent',
                      opacity: 0.5,
                    },
                    '& .MuiSvgIcon-root': {
                      fontSize: '0.75rem',
                    },
                  }}
                >
                  <RemoveIcon />
                </IconButton>
              </Box>
            </InputAdornment>
          ),
        },
      }}
      sx={{
        '& input[type="number"]::-webkit-outer-spin-button': {
          WebkitAppearance: 'none',
          margin: 0,
        },
        '& input[type="number"]::-webkit-inner-spin-button': {
          WebkitAppearance: 'none',
          margin: 0,
        },
      }}
    />
  );
};
