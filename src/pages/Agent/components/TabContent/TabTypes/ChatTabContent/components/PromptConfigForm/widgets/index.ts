import { RegistryWidgetsType } from '@rjsf/utils';
import { AutoResizeTextareaWidget } from './AutoResizeTextareaWidget';
import { CheckboxWidget } from './CheckboxWidget';
import { SelectWidget } from './SelectWidget';
import { TagsWidget } from './TagsWidget';
import { TextWidget } from './TextWidget';

export const widgets: RegistryWidgetsType = {
  TextWidget,
  SelectWidget,
  CheckboxWidget,
  TagsWidget,
  // Map textarea to our auto-resize version
  textarea: AutoResizeTextareaWidget,
};

export * from './AutoResizeTextareaWidget';
export * from './CheckboxWidget';
export * from './SelectWidget';
export * from './TagsWidget';
export * from './TextWidget';
