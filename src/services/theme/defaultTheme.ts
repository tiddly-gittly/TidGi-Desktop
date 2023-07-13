import { createTheme, Theme } from '@mui/material';
import { cloneDeep, merge } from 'lodash';

export const lightTheme = merge(cloneDeep(createTheme({
  palette: {
    background: {
      default: '#fafafa',
    },
  },
}))) as Theme;
export const darkTheme = merge(
  cloneDeep(
    createTheme({
      palette: {
        mode: 'dark',
        background: {
          default: '#212121',
        },
        text: { primary: 'rgba(255, 255, 255, 0.87)', secondary: 'rgba(255, 255, 255, 0.6)', disabled: 'rgba(255, 255, 255, 0.35)' },
      },
    }),
  ),
) as Theme;
