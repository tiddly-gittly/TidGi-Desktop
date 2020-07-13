function wikiCreationProgress(message) {
  // eslint-disable-next-line global-require
  require('../../windows/add-workspace') // prevent circular depencence
    .get()
    .webContents.send('create-wiki-result', message);
}

module.exports = { wikiCreationProgress };
