// https://github.com/electron/electron-apps/blob/master/script/pack.js
const { exec } = require('child_process');
const fs = require('fs-extra');
const imageSize = require('image-size');
const path = require('path');
const Queue = require('promise-queue');
const sharp = require('sharp');
const yaml = require('yamljs');

const apps = [];
const appPath = path.join(__dirname, '../apps');
const distPath = path.join(__dirname, '../dist');

// Run concurrently to improve performance
const maxConcurrent = 20;
const maxQueue = Infinity;
const queue = new Queue(maxConcurrent, maxQueue);

fs.readdirSync(appPath)
  .filter(filename => fs.statSync(path.join(appPath, filename)).isDirectory())
  .forEach((slug) => {
    const yamlFile = path.join(appPath, `${slug}/${slug}.yml`);
    const app = Object.assign(
      { id: slug, objectID: slug },
      yaml.load(yamlFile),
      {
        icon: `https://s3.singleboxapp.com/apps/${slug}/${slug}-icon.png`,
        icon128: `https://s3.singleboxapp.com/apps/${slug}/${slug}-icon-128.png`,
      },
    );

    const iconFile = path.join(appPath, `${slug}/${slug}-icon.png`);
    const copiedIconFile = path.join(distPath, `${slug}/${slug}-icon.png`);

    fs.copySync(iconFile, copiedIconFile);

    queue.add(() => Promise.resolve()
      .then(() => sharp(copiedIconFile)
        .resize(128, 128)
        .toFile(path.join(distPath, `${slug}/${slug}-icon-128.png`)))
      .catch((e) => {
        console.log(e); // eslint-disable-line no-console
        process.exit(1);
      }));

    apps.push(app);
  });

fs.ensureDirSync(distPath);

fs.writeFileSync(
  path.join(distPath, 'index.json'),
  JSON.stringify(apps, null, 2),
);
