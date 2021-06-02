import fs from 'fs-extra';
import { DEFAULT_WIKI_FOLDER } from '../src/constants/paths';

try {
  fs.removeSync(DEFAULT_WIKI_FOLDER);
} catch {}
fs.mkdirpSync(DEFAULT_WIKI_FOLDER);
