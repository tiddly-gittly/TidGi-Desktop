/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { SelectChangeEvent } from '@mui/material/Select';
import { WidgetProps } from '@rjsf/utils';
import React from 'react';
import { StyledInputLabel, StyledMenuItem, StyledSelect, StyledSelectFormControl } from '../components';

interface EnumOption {
  label: string;
  value: string | number | boolean;
}

export const SelectWidget: React.FC<WidgetProps> = (props) => {
  const {
    id,
    value,
    required,
    readonly,
    disabled,
    autofocus,
    label,
    onBlur,
    onFocus,
    onChange,
    options,
  } = props;

  const { enumOptions = [] } = options as { enumOptions?: EnumOption[] };

  const handleChange = (event: SelectChangeEvent<unknown>) => {
    const newValue = event.target.value;
    onChange(newValue === '' ? undefined : newValue);
  };

  const handleBlur = () => {
    onBlur(id, value);
  };

  const handleFocus = () => {
    onFocus(id, value);
  };

  return (
    <StyledSelectFormControl fullWidth>
      {label && (
        <StyledInputLabel id={`${id}-label`}>
          {label}
        </StyledInputLabel>
      )}
      <StyledSelect
        labelId={`${id}-label`}
        id={id}
        value={value !== undefined && value !== null ? String(value) : ''}
        required={required}
        disabled={disabled || readonly}
        autoFocus={autofocus}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        label={label}
      >
        {!required && (
          <StyledMenuItem value=''>
            <em>None</em>
          </StyledMenuItem>
        )}
        {enumOptions.map((option: EnumOption, index: number) => (
          <StyledMenuItem key={index} value={String(option.value)}>
            {option.label}
          </StyledMenuItem>
        ))}
      </StyledSelect>
    </StyledSelectFormControl>
  );
};
