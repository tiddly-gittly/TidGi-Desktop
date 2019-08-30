const path = require('path');
const fs = require('fs-extra');
const yaml = require('js-yaml');

const appDirs = fs.readdirSync(path.resolve(__dirname, '..', 'catalog', 'apps'));

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

appDirs.forEach((appId) => {
  if (appId === '.DS_Store') return;
  const yamlPath = path.resolve(__dirname, '..', 'catalog', 'apps', appId, `${appId}.yml`);
  const content = yaml.load(fs.readFileSync(yamlPath, 'utf8'));

  content.key = appId;
  content.fullUrl = content.url;
  content.hostname = extractHostname(content.fullUrl);

  delete content.url;

  const newContent = `---
${yaml.dump(content)}
---`;

  fs.ensureDirSync(path.resolve(__dirname, '..', 'docs', '_catalog'));
  fs.writeFileSync(path.resolve(__dirname, '..', 'docs', '_catalog', `${appId}.md`), newContent);
});
