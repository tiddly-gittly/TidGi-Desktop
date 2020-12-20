const hasErrors = (form: any) => {
  const formKeys = Object.keys(form);
  for (const currentKey of formKeys) {
    if (currentKey.endsWith('Error') && form[currentKey]) return true;
  }
  return false;
};

export default hasErrors;
