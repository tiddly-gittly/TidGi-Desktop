const { ICON_PATH } = require('../constants/paths');
const { TIDDLYWIKI_FOLDER_NAME } = require('../constants/file-names');

module.exports.getIconPath = () => ICON_PATH;
module.exports.getDefaultTiddlywikiFolderName = () => TIDDLYWIKI_FOLDER_NAME;
