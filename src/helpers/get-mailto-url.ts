import extractHostname from './extract-hostname';

let MAILTO_URLS: any;

const getMailtoUrl = (url: any) => {
  if (!MAILTO_URLS) {
    MAILTO_URLS = window.remote.getGlobal('MAILTO_URLS');
  }

  const extractedHostname = extractHostname(url);
  if (extractedHostname in MAILTO_URLS) {
    return MAILTO_URLS[extractedHostname];
  }

  return null;
};

export default getMailtoUrl;
