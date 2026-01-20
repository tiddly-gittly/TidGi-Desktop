import fs from 'fs-extra';
import { DEFAULT_FIRST_WIKI_FOLDER_PATH } from '../src/constants/paths';

// Skip directory creation in test mode - each test scenario creates its own isolated directories
// This script is only needed for development mode
const isTest = process.env.NODE_ENV === 'test';
if (!isTest) {
  try {
    fs.removeSync(DEFAULT_FIRST_WIKI_FOLDER_PATH);
  } catch {
    // ignore
  }
  fs.mkdirpSync(DEFAULT_FIRST_WIKI_FOLDER_PATH);
}
