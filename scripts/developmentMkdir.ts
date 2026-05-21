import fs from 'fs-extra';
import path from 'path';
import { developmentWikiFolderName } from '../src/constants/fileNames';

const developmentWikiFolderPath = path.resolve(__dirname, '..', developmentWikiFolderName);

// Skip directory creation in test mode - each test scenario creates its own isolated directories
// This script is only needed for development mode
const isTest = process.env.NODE_ENV === 'test';
if (!isTest) {
  try {
    fs.removeSync(developmentWikiFolderPath);
  } catch {
    // ignore
  }
  fs.mkdirpSync(developmentWikiFolderPath);
}
