/**
 * Given a tiddler title and an array of existing filenames, generate a new legal filename for the title,
 * case insensitively avoiding the array of existing filenames
 *
 * Modified from TW-Bob's FileSystem/MultiWikiAdaptor.js
 *
 * @param {string} title
 */
function generateTiddlerBaseFilepath(title) {
  let baseFilename;
  // Check whether the user has configured a tiddler -> pathname mapping
  const pathNameFilters = $tw.wiki.getTiddlerText('$:/config/FileSystemPaths');
  if (pathNameFilters) {
    const source = $tw.wiki.makeTiddlerIterator([title]);
    baseFilename = this.findFirstFilter(pathNameFilters.split('\n'), source);
    if (baseFilename) {
      // Interpret "/" and "\" as path separator
      baseFilename = baseFilename.replace(/\/|\\/g, path.sep);
    }
  }
  if (!baseFilename) {
    // No mappings provided, or failed to match this tiddler so we use title as filename
    baseFilename = title.replace(/\/|\\/g, '_');
  }
  // Remove any of the characters that are illegal in Windows filenames
  baseFilename = $tw.utils.transliterate(baseFilename.replace(/<|>|\:|\"|\||\?|\*|\^/g, '_'));
  // Truncate the filename if it is too long
  if (baseFilename.length > 200) {
    baseFilename = baseFilename.substr(0, 200);
  }
  return baseFilename;
}

function findFirstFilter(filters, source) {
  for (let i = 0; i < filters.length; i++) {
    const result = $tw.wiki.filterTiddlers(filters[i], null, source);
    if (result.length > 0) {
      return result[0];
    }
  }
  return null;
}

function getTwCustomMimeType(fileExtension, mimeGetType) {
  let officialMimeType = mimeGetType(fileExtension);
  if (officialMimeType === 'text/markdown') {
    officialMimeType = 'text/x-markdown';
  }
  return officialMimeType;
}

module.exports = {
  generateTiddlerBaseFilepath,
  getTwCustomMimeType,
};
