// Contains a whitelist of languages for our app
const whitelistMap = {
  en: 'English',
  fr: 'Français', // French
  ja: '日本語', // Japanese
  ru: 'русский', // Russian
  vi: 'Tiếng Việt', // Vietnamese
  zh_CN: '简中', // Chinese
};

const Whitelist = (function() {
  const keys = Object.keys(whitelistMap);
  const clickFunction = function(channel, lng) {
    return function(menuItem, browserWindow, event) {
      browserWindow.webContents.send(channel, {
        lng,
      });
    };
  };

  return {
    langs: keys,
    buildSubmenu(channel) {
      const submenu = [];

      for (const key of keys) {
        submenu.push({
          label: whitelistMap[key],
          click: clickFunction(channel, key),
        });
      }

      return submenu;
    },
  };
})();

module.exports = Whitelist;
