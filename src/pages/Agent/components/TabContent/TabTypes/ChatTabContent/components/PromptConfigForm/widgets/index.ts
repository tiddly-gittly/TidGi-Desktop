import { RegistryWidgetsType } from '@rjsf/utils';
import { CheckboxWidget } from './CheckboxWidget';
import { SelectWidget } from './SelectWidget';
import { TextareaWidget } from './TextareaWidget';
import { TextWidget } from './TextWidget';

export const widgets: RegistryWidgetsType = {
  TextWidget,
  TextareaWidget,
  SelectWidget,
  CheckboxWidget,
};

export * from './CheckboxWidget';
export * from './SelectWidget';
export * from './TextareaWidget';
export * from './TextWidget';
