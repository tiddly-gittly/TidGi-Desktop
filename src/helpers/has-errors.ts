const hasErrors = (form) => {
  const formKeys = Object.keys(form);
  for (let i = 0; i < formKeys.length; i += 1) {
    const currentKey = formKeys[i];
    if (currentKey.endsWith('Error') && form[currentKey]) return true;
  }
  return false;
};

export default hasErrors;
