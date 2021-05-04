import fs from 'fs-extra';
import { DEFAULT_WIKI_FOLDER } from '../src/constants/paths';

fs.mkdirpSync(DEFAULT_WIKI_FOLDER);
