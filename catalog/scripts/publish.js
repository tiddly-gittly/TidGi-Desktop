/* eslint-disable no-console */

const algoliasearch = require('algoliasearch');

const apps = require('../dist/index.json');

const client = algoliasearch(process.env.ALGOLIA_APPLICATION_ID, process.env.ALGOLIA_ADMIN_KEY);

const indexName = 'apps';
const tmpIndexName = `tmp_apps_${Date.now().toString()}`;

const tmpIndex = client.initIndex(tmpIndexName);
tmpIndex.addObjects(apps)
  .then(() => tmpIndex.setSettings({ customRanking: ['asc(name)'] }))
  .then(() => client.moveIndex(tmpIndexName, indexName))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
