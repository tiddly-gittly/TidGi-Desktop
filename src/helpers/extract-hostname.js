/* eslint-disable prefer-destructuring */
const extractHostname = (url) => {
  let hostname;

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
  hostname = hostname.replace('www.', '');

  return hostname;
};

export default extractHostname;
