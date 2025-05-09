import { createTheme } from '@mui/material/styles';

// Arc浏览器风格的主题配置
export const theme = createTheme({
  palette: {
    primary: {
      main: '#5D6BF8', // Arc浏览器特有的蓝紫色主色调
      light: '#8B95FA',
      dark: '#4251D6',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#F5F5F7', // Arc浏览器侧边栏的淡灰色
      light: '#FFFFFF',
      dark: '#E1E1E3',
      contrastText: '#1D1D1F',
    },
    background: {
      default: '#FFFFFF',
      paper: '#F5F5F7',
    },
    text: {
      primary: '#1D1D1F',
      secondary: '#6E6E73',
    },
  },
  shape: {
    borderRadius: 12, // Arc浏览器使用的圆角值
  },
  typography: {
    fontFamily: '"SF Pro Display", "Roboto", "Arial", sans-serif',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
  },
});

export default theme;
