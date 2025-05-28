/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { WidgetProps } from '@rjsf/utils';
import React from 'react';
import { StyledCodeTextField, StyledNumberField, StyledTextField } from '../components';

export const TextWidget: React.FC<WidgetProps> = (props) => {
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
    schema,
  } = props;

  const inputType = schema.type;
  const isCode = options.widget === 'code' || schema.contentMediaType === 'application/javascript';

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    if (inputType === 'number') {
      onChange(newValue === '' ? undefined : Number(newValue));
    } else {
      onChange(newValue === '' ? undefined : newValue);
    }
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    onBlur(id, event.target.value);
  };

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    onFocus(id, event.target.value);
  };

  if (isCode) {
    return (
      <StyledCodeTextField
        id={id}
        value={value as string || ''}
        required={required}
        disabled={!!disabled || !!readonly}
        autoFocus={autofocus}
        placeholder={placeholder}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        multiline
        rows={6}
        fullWidth
        variant='outlined'
      />
    );
  }

  if (inputType === 'number') {
    return (
      <StyledNumberField
        id={id}
        type='number'
        value={value as string || ''}
        required={required}
        disabled={!!disabled || !!readonly}
        autoFocus={autofocus}
        placeholder={placeholder}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        fullWidth
        variant='outlined'
      />
    );
  }

  const getInputType = (): React.InputHTMLAttributes<unknown>['type'] => {
    if (typeof inputType === 'string') {
      if (inputType === 'string') {
        return 'text';
      } else if (inputType === 'integer') {
        return 'number';
      } else {
        return 'text';
      }
    }
    return 'text';
  };

  return (
    <StyledTextField
      id={id}
      type={getInputType()}
      value={value as string || ''}
      required={required}
      disabled={!!disabled || !!readonly}
      autoFocus={autofocus}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      fullWidth
      variant='outlined'
    />
  );
};
