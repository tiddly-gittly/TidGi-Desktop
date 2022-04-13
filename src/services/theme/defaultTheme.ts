import { merge, cloneDeep } from 'lodash';
import { createMuiTheme, Theme } from '@material-ui/core';

export const lightTheme = merge(cloneDeep(createMuiTheme())) as Theme;
export const darkTheme = merge(
  cloneDeep(
    createMuiTheme({
      palette: {
        mode: 'dark',
        background: {
          default: '#212121',
        },
        text: { primary: 'rgba(255, 255, 255, 0.87)', secondary: 'rgb(155, 155, 155)', disabled: 'rgba(255, 255, 255, 0.35)' },
      },
    }),
  ),
) as Theme;
