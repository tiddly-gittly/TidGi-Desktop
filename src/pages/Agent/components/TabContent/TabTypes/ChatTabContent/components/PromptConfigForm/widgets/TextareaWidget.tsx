/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { WidgetProps } from '@rjsf/utils';
import React from 'react';
import { StyledMultilineTextField } from '../components';

export const TextareaWidget: React.FC<WidgetProps> = (props) => {
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
    options,
  } = props;

  const rows = options.rows || 4;

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = event.target.value;
    onChange(newValue === '' ? undefined : newValue);
  };

  const handleBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    if (onBlur) {
      onBlur(id, event.target.value);
    }
  };

  const handleFocus = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    if (onFocus) {
      onFocus(id, event.target.value);
    }
  };

  return (
    <StyledMultilineTextField
      id={id}
      value={value as unknown}
      required={required}
      disabled={disabled || readonly}
      autoFocus={autofocus}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      multiline
      rows={rows}
      fullWidth
      variant='outlined'
    />
  );
};
