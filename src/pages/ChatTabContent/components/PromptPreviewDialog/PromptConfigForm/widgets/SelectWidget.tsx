import { SelectChangeEvent } from '@mui/material/Select';
import { WidgetProps } from '@rjsf/utils';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyledMenuItem, StyledSelect, StyledSelectFormControl } from '../components';

interface EnumOption {
  label: string;
  value: string | number | boolean;
}

interface SchemaWithEnum {
  enum?: Array<string | number | boolean>;
  enumOptions?: EnumOption[];
}

export const SelectWidget: React.FC<WidgetProps> = (props) => {
  const { t } = useTranslation('agent');
  const {
    id,
    required,
    readonly,
    disabled,
    autofocus,
    onBlur,
    onFocus,
    onChange,
    schema,
  } = props;

  // Extract value separately to avoid unsafe destructuring warning
  const typedValue = props.value as string | number | undefined;

  const typedSchema = schema as SchemaWithEnum;

  const enumOptions: EnumOption[] = React.useMemo(() => {
    if (Array.isArray(typedSchema.enumOptions)) {
      return typedSchema.enumOptions;
    }

    if (Array.isArray(typedSchema.enum)) {
      return typedSchema.enum.map((enumValue) => ({
        value: enumValue,
        label: String(enumValue),
      }));
    }

    return [];
  }, [typedSchema.enumOptions, typedSchema.enum]);

  const handleChange = (event: SelectChangeEvent<unknown>) => {
    const newValue = event.target.value;
    onChange(newValue === '' ? undefined : newValue);
  };

  const handleBlur = () => {
    onBlur(id, typedValue);
  };

  const handleFocus = () => {
    onFocus(id, typedValue);
  };

  return (
    <StyledSelectFormControl fullWidth>
      <StyledSelect
        labelId={`${id}-label`}
        id={id}
        value={typedValue ? String(typedValue) : ''}
        required={required}
        disabled={disabled || readonly}
        autoFocus={autofocus}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
      >
        {!required && (
          <StyledMenuItem value=''>
            <em>{t('Common.None')}</em>
          </StyledMenuItem>
        )}
        {enumOptions.map((option: EnumOption, index: number) => (
          <StyledMenuItem key={index} value={String(option.value)}>
            {t(option.label, option.label)}
          </StyledMenuItem>
        ))}
      </StyledSelect>
    </StyledSelectFormControl>
  );
};
