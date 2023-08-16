import { Typography } from '@mui/material';
import { IResultTextProps } from '@services/libs/workflow/ui/types/UIEffectsContext';
import type { UIPlugin } from '.';

export const TextResultPlugin: UIPlugin = {
  type: 'textResult',
  component: ({ content }: IResultTextProps) => <Typography>{content}</Typography>,
};
