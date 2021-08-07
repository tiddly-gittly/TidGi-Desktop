// styled.d.ts
import 'styled-components';
import { Theme } from '@material-ui/core';
interface IPalette {
  contrastText: string;
  main: string;
}
declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
}
