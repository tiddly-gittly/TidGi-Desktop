const isDev = require('electron-is-dev');
const path = require('path');

const REACT_PATH = isDev ? 'http://localhost:3000' : `file://${path.resolve(__dirname, '..', '..', 'build', 'index.html')}`;

module.exports = {
  REACT_PATH,
};
