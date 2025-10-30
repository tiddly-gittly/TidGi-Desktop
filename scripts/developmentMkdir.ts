import fs from 'fs-extra';
import { DEFAULT_FIRST_WIKI_FOLDER_PATH } from '../src/constants/paths';

try {
  fs.removeSync(DEFAULT_FIRST_WIKI_FOLDER_PATH);
} catch {
  // ignore
}
fs.mkdirpSync(DEFAULT_FIRST_WIKI_FOLDER_PATH);
