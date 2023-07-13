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
