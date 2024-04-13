import { PACKAGE_PATH_BASE } from '@/constants/workerPaths';
import path from 'path';

// @ts-expect-error Element implicitly has an 'any' type because type 'typeof globalThis' has no index signature.ts(7017)
global.LLAMA_PREBUILT_BINS_DIRECTORY = path.resolve(PACKAGE_PATH_BASE, 'node-llama-cpp', 'llamaBins');
// @ts-expect-error Element implicitly has an 'any' type because type 'typeof globalThis' has no index signature.ts(7017)
export const LLAMA_PREBUILT_BINS_DIRECTORY = global.LLAMA_PREBUILT_BINS_DIRECTORY as string;
