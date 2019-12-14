// specifies the URL pattern to handle `mailto` links.
// https://developer.mozilla.org/en-US/docs/Web/API/Navigator/registerProtocolHandler

const rawMailtoUrls = [
  {
    hostnames: ['fastmail.com'],
    mailtoUrl: 'http://www.fastmail.fm/action/compose/?mailto=%s',
  },
  {
    hostnames: ['gmail.com', 'mail.google.com', 'googlemail.com'],
    mailtoUrl: 'https://mail.google.com/mail/?extsrc=mailto&url=%s',
  },
  {
    hostnames: ['outlook.live.com', 'outlook.com', 'hotmail.com'],
    mailtoUrl: 'https://outlook.live.com/owa/?path=/mail/action/compose&to=%s',
  },
  {
    hostnames: ['mail.yahoo.com', 'yahoomail.com'],
    mailtoUrl: 'https://compose.mail.yahoo.com/?To=%s',
  },
  {
    hostnames: ['mail.zoho.com'],
    mailtoUrl: 'https://mail.zoho.com/mail/compose.do?extsrc=mailto&mode=compose&tp=zb&ct=%s',
  },
  {
    hostnames: ['tutanota.com', 'mail.tutanota.com'],
    mailtoUrl: 'https://mail.tutanota.com/mailto#url=%s',
  },
];

const MAILTO_URLS = {};
rawMailtoUrls.forEach((item) => {
  item.hostnames.forEach((hostname) => {
    MAILTO_URLS[hostname] = item.mailtoUrl;
  });
});

module.exports = MAILTO_URLS;
