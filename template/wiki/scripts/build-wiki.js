const path = require('path');
const { execSync } = require('child_process');

const repoFolder = path.join(path.dirname(__filename), '..');
const folderToServe = path.join(repoFolder, 'public-dist');

// cross-env TIDDLYWIKI_PLUGIN_PATH='node_modules/tiddlywiki/plugins/published' TIDDLYWIKI_THEME_PATH='${wikiFolderName}/themes'
process.env.TIDDLYWIKI_PLUGIN_PATH = `${repoFolder}/plugins`;
process.env.TIDDLYWIKI_THEME_PATH = `${repoFolder}/themes`;

const execAndLog = (command, options) => console.log(String(execSync(command, options)));

module.exports = function build() {
  // npm run build:prepare
  execAndLog(`rm -rf ${folderToServe}`);
  // npm run build:public
  execAndLog(`cp -r ${repoFolder}/public/ ${folderToServe}`, { cwd: repoFolder });
  // try copy some static assets, don't cause error if some of them been removed by the user
  try {
    // npm run build:public
    execAndLog(`cp ${repoFolder}/tiddlers/favicon.ico ${folderToServe}/favicon.ico`, { cwd: repoFolder });
    execAndLog(`cp ${repoFolder}/tiddlers/TiddlyWikiIconWhite.png ${folderToServe}/TiddlyWikiIconWhite.png`, {
      cwd: repoFolder,
    });
    execAndLog(`cp ${repoFolder}/tiddlers/TiddlyWikiIconBlack.png ${folderToServe}/TiddlyWikiIconBlack.png`, {
      cwd: repoFolder,
    });
  } catch (error) {
    console.log(error);
  }
  // npm run build:nodejs2html
  execAndLog(`tiddlywiki ${repoFolder} --build externalimages`, { cwd: repoFolder });
  // npm run build:sitemap
  execAndLog(
    `tiddlywiki . --rendertiddler sitemap sitemap.xml text/plain && mv ${repoFolder}/output/sitemap.xml ${folderToServe}/sitemap.xml`,
    { cwd: repoFolder },
  );
  // npm run build:minifyHTML
  execAndLog(
    `html-minifier-terser -c ./html-minifier-terser.config.json -o ${folderToServe}/index.html ${repoFolder}/output/index.html`,
    { cwd: repoFolder },
  );
  // npm run build:precache
  execAndLog(`workbox injectManifest workbox-config.js`, { cwd: repoFolder });
  // npm run build:clean
  execAndLog(`rm -r ${repoFolder}/output`, { cwd: repoFolder });
  // npm run build:pluginLibrary
  execAndLog(`tiddlywiki ${repoFolder} --output ${folderToServe}/library --build library`, { cwd: repoFolder });
};
