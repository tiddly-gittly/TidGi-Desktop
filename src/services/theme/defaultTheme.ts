import { createTheme, Theme } from '@mui/material';
import { ThemeOptions } from '@mui/material/styles';
import { cloneDeep, merge } from 'lodash';

const workflow: ThemeOptions['workflow'] = {
  thumbnail: {
    width: 216,
    height: 162,
  },
  nodeDetailPanel: {
    width: 350,
  },
  debugPanel: {
    width: 350,
    height: 300,
    cardSpacing: 12,
  },
  run: {
    chatsList: {
      width: 220,
    },
  },
};
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
  workflow,
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
      workflow,
      sidebar: lightTheme.sidebar,
      searchBar: lightTheme.searchBar,
    }),
  ),
) as Theme;
