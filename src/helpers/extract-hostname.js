/* eslint-disable prefer-destructuring */
const extractHostname = (url) => {
  try {
    let hostname = url.trim();

    // find & remove protocol (http, ftp, etc.) and get hostname
    if (url.indexOf('://') > -1) {
      hostname = url.split('/')[2];
    } else {
      hostname = url.split('/')[0];
    }

    // find & remove port number
    hostname = hostname.split(':')[0];
    // find & remove "?"
    hostname = hostname.split('?')[0];

    // find & remove "www"
    // https://stackoverflow.com/a/9928725
    hostname = hostname.replace(/^(www\.)/, '');

    return hostname;
  } catch (_) {
    return null;
  }
};

export default extractHostname;
