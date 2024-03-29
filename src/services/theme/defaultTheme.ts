import { createTheme, Theme } from '@mui/material';
import { ThemeOptions } from '@mui/material/styles';
import { cloneDeep, merge } from 'lodash';

export const lightTheme = merge(cloneDeep(createTheme({
  palette: {
    background: {
      default: '#fafafa',
    },
  },
  sidebar: {
    width: 68,
  },
  searchBar: {
    width: 300,
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
      sidebar: lightTheme.sidebar,
      searchBar: lightTheme.searchBar,
    }),
  ),
) as Theme;
