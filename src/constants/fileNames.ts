export const settingFolderName = 'settings';
export const httpsCertKeyFolderName = 'https-keys';
export const cacheDatabaseFolderName = 'cache-database';
export const languageModelFolderName = 'language-model';
/** Used to place mock wiki during dev and testing */
export const developmentWikiFolderName = 'tidgi-dev';
export const localizationFolderName = 'localization';

export const wikiPictureExtensions = ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'tif', 'bmp', 'dib'];
export const wikiHtmlExtensions = ['html', 'htm', 'hta', 'Html', 'HTML', 'HTM', 'HTA'];
export const tlsCertExtensions = ['crt'];
export const tlsKeyExtensions = ['key'];
/**
 * wikiHtmlExtensions
 */
const isHtmlWikiRegex = /(?:html|htm|Html|HTML|HTM|HTA|hta)$/;
export const isHtmlWiki = (htmlWikiPath: string) => isHtmlWikiRegex.test(htmlWikiPath);
