export const getShouldUseDarkMode = (state) => {
  let shouldUseDarkMode;
  if (state.preferences.theme === 'automatic') {
    shouldUseDarkMode = state.general.isDarkMode;
  } else {
    shouldUseDarkMode = state.preferences.theme === 'dark';
  }
  return shouldUseDarkMode;
};
