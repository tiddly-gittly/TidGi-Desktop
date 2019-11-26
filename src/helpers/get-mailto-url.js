import extractHostname from './extract-hostname';

let MAILTO_URLS;

const getMailtoUrl = (url) => {
  if (!MAILTO_URLS) {
    MAILTO_URLS = window.require('electron').remote.getGlobal('MAILTO_URLS');
  }

  const extractedHostname = extractHostname(url);
  if (extractedHostname in MAILTO_URLS) {
    return MAILTO_URLS[extractedHostname];
  }

  return null;
};

export default getMailtoUrl;
