export default function extractHostname(url: string): string | undefined {
  try {
    let hostname = url.trim();

    // find & remove protocol (http, ftp, etc.) and get hostname
    hostname = url.includes('://') ? url.split('/')[2] : url.split('/')[0];

    // find & remove port number
    hostname = hostname.split(':')[0];
    // find & remove "?"
    hostname = hostname.split('?')[0];

    // find & remove "www"
    // https://stackoverflow.com/a/9928725
    hostname = hostname.replace(/^(www\.)/, '');

    return hostname;
  } catch {
    // return undefined;
  }
}
