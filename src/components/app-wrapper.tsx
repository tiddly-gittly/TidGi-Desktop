import React from 'react';
import { ThemeProvider as MuiThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import red from '@material-ui/core/colors/red';
import blue from '@material-ui/core/colors/blue';
import grey from '@material-ui/core/colors/grey';
import pink from '@material-ui/core/colors/pink';
import { LocalizationProvider } from '@material-ui/pickers';
import DateFnsUtils from '@material-ui/pickers/adapter/date-fns';
import connectComponent from '../helpers/connect-component';
interface AppWrapperProps {
  children: React.ReactElement[] | React.ReactElement | string;
  shouldUseDarkColors: boolean;
}
const AppWrapper = ({ children, shouldUseDarkColors }: AppWrapperProps) => {
  const themeObject = {
    typography: {
      fontSize: 13.5,
      button: {
        textTransform: 'none',
      },
    },
    palette: {
      type: shouldUseDarkColors ? 'dark' : 'light',
      primary: {
        light: blue[300],
        main: blue[600],
        dark: blue[800],
      },
      secondary: {
        light: pink[300],
        main: pink[600],
        dark: pink[800],
      },
      error: {
        light: red[300],
        main: red[500],
        dark: red[700],
      },
    },
  };
  if (!shouldUseDarkColors) {
    (themeObject as any).background = {
      primary: grey[200],
    };
  }
  // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ typography: { fontSize: number... Remove this comment to see the full error message
  const theme = createMuiTheme(themeObject);
  return (
    <MuiThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={DateFnsUtils}>{children}</LocalizationProvider>
    </MuiThemeProvider>
  );
};
const mapStateToProps = (state: any) => ({
  shouldUseDarkColors: state.general.shouldUseDarkColors,
});
export default connectComponent(AppWrapper, mapStateToProps, null, null);
