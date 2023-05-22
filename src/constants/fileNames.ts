/** Used to store settings during dev and testing */
export const developmentSettingFolderName = 'settings-dev';
export const developmentHttpsCertKeyFolderName = 'https-keys-dev';
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
