import { merge, cloneDeep } from 'lodash';
import { createMuiTheme, Theme } from '@material-ui/core';

export const lightTheme: Theme = merge(cloneDeep(createMuiTheme()), {});
export const darkTheme: Theme = merge(cloneDeep(createMuiTheme()), {
  palette: {
    background: {
      default: '#212121',
    },
  },
});
