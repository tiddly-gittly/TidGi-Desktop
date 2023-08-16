// styled.d.ts
import 'styled-components';
import { Theme } from '@mui/material';
interface IPalette {
  contrastText: string;
  main: string;
}
declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
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
        height: number;
        width: number;
        cardSpacing: number;
      };
      nodeDetailPanel: {
        width: number;
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
