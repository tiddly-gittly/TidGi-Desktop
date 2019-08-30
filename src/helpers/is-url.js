const isUrl = (string) => {
  try {
    new URL(string); // eslint-disable-line
    return true;
  } catch (_) {
    return false;
  }
};

export default isUrl;
