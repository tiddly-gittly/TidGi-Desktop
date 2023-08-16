import { Typography } from '@mui/material';
import { IResultTextProps } from '@/pages/Workflow/libs/ui/types/UIEffectsContext';
import type { UIPlugin } from '.';

function Component({ content }: IResultTextProps) {
  return <Typography>{content}</Typography>;
}
export const TextResultPlugin: UIPlugin = {
  type: 'textResult',
  Component,
};
