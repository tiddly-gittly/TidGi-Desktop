const isUrl = (string: any) => {
  try {
    new URL(string); // eslint-disable-line
    return true;
  } catch {
    return false;
  }
};

export default isUrl;
