import { RegistryWidgetsType } from '@rjsf/utils';
import { AutoResizeTextareaWidget } from './AutoResizeTextareaWidget';
import { CheckboxWidget } from './CheckboxWidget';
import { NumberWidget } from './NumberWidget';
import { SelectWidget } from './SelectWidget';
import { TagsWidget } from './TagsWidget';
import { TextWidget } from './TextWidget';

export const widgets: RegistryWidgetsType = {
  TextWidget,
  SelectWidget,
  CheckboxWidget,
  TagsWidget,
  NumberWidget,
  // Map textarea to our auto-resize version
  textarea: AutoResizeTextareaWidget,
};

export * from './AutoResizeTextareaWidget';
export * from './CheckboxWidget';
export * from './NumberWidget';
export * from './SelectWidget';
export * from './TagsWidget';
export * from './TextWidget';
