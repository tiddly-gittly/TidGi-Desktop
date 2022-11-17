// another way https://docs.appimage.org/packaging-guide/converting-binary-packages/pkg2appimage.html
// must have latest released tidgi deb
// note: tidgi.deb(on debt2appimage.json) path must use ~/.cache/deb2appimage/debs/, don't modify it
// status: deb2appimage WIP(test)
// appimagehub: https://github.com/AppImage/appimage.github.io#how-to-submit-appimages-to-the-catalog
// byhand manage this file
// TODO: fix tiddly desktop cache not founded to speedup, update package-locl.json file
// x86 64
const appimage_cachedir = 'deb2appimage_cache';
const appimage_address = 'https://github.com/simoniz0r/deb2appimage/releases/download/v0.0.5/deb2appimage-0.0.5-x86_64.AppImage';
const bin = `${appimage_cachedir}/deb2appimage.appimage`;
const config_file = 'scripts/deb2appimage.json';
// this filename for deb2appimage not support Underline char
// maybe need delete ~/.cache/deb2appimage/
const updated_config_file = `deb2appimage_${String(new Date())}.json`;
const target_dir = 'out/make';
const version = require('../package.json').version;

async function buildAppImage() {
  await clean();
  await `cp ${config_file} ${updated_config_file}`;
  await `sed -i "s#APP_VERSION#$(version)#g" $(updated_config_file)`;
  await `rm -rf $(appimage_cachedir); mkdir $(appimage_cachedir)`;
  await downloadBin();
  await `chmod +x ${bin}`;
  await `$(bin) -j $(updated_config_file) -o $(appimage_cachedir)`;
  await `cp $(appimage_cachedir)/*.AppImage $(target_dir)`;
  await `echo "✔ 🎉 appimage generated"`;
}

async function downloadBin() {
  await $`wget ${appimage_address} -O ${bin}`;
}

async function clean() {
  await $`rm -rf deb2appimage*.json`;
}
