// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import { Theme, ThemeOptions } from '@mui/material/styles';
interface IPalette {
  contrastText: string;
  main: string;
}

// https://mui.com/material-ui/customization/theming/#custom-variables
declare module '@mui/material/styles' {
  interface Theme {
    searchBar: {
      width: number;
    };
    sidebar: {
      width: number;
    };
    workflow: {
      debugPanel: {
        cardSpacing: number;
        height: number;
        width: number;
      };
      nodeDetailPanel: {
        width: number;
      };
      run: {
        chatsList: {
          width: number;
        };
      };
      thumbnail: {
        height: number;
        width: number;
      };
    };
  }
  // allow configuration using `createTheme`
  interface ThemeOptions {
    searchBar: Theme['searchBar'];
    sidebar: Theme['sidebar'];
    workflow: Theme['workflow'];
  }
}
