/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Checkbox, FormControlLabel } from '@mui/material';
import { WidgetProps } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

const StyledFormControlLabel = styled(FormControlLabel)`
  margin: 0;

  & .MuiFormControlLabel-label {
    font-size: ${({ theme }) => theme.typography.body2.fontSize};
  }
`;

const StyledCheckbox: typeof Checkbox = styled(Checkbox)`
  padding: ${({ theme }) => theme.spacing(0.5)};

  &.Mui-checked {
    color: ${({ theme }) => theme.palette.primary.main};
  }
`;

export const CheckboxWidget: React.FC<WidgetProps> = (props) => {
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
  } = props;
  const { t } = useTranslation('agent');

  // Translate the label if it exists
  const translatedLabel = label ? t(label, label) : undefined;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked);
  };

  const handleBlur = () => {
    onBlur(id, value);
  };

  const handleFocus = () => {
    onFocus(id, value);
  };

  return (
    <StyledFormControlLabel
      control={
        <StyledCheckbox
          id={id}
          checked={(value as boolean) || false}
          required={required}
          disabled={disabled || readonly}
          autoFocus={autofocus}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
        />
      }
      label={translatedLabel}
    />
  );
};
