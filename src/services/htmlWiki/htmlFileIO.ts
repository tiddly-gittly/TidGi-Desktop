import fs from 'node:fs/promises';
import path from 'node:path';

import { isHtmlWiki } from '@/constants/fileNames';

export async function validateHtmlWikiFile(htmlFileLocation: string): Promise<void> {
  const resolved = path.resolve(htmlFileLocation);
  if (!isHtmlWiki(resolved)) {
    throw new Error(`Not a valid HTML wiki file: ${resolved}`);
  }
  let content: string;
  try {
    content = await fs.readFile(resolved, 'utf-8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`HTML wiki file does not exist: ${resolved}`);
    }
    throw error;
  }
  if (!content.includes('<html') && !content.includes('<HTML')) {
    throw new Error(`File is not a valid HTML document: ${resolved}`);
  }
}

export async function readHtmlWikiFile(htmlFileLocation: string): Promise<string> {
  const resolved = path.resolve(htmlFileLocation);
  if (!isHtmlWiki(resolved)) {
    throw new Error(`Not a valid HTML wiki file: ${resolved}`);
  }
  let content: string;
  try {
    content = await fs.readFile(resolved, 'utf-8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`HTML wiki file does not exist: ${resolved}`);
    }
    throw error;
  }
  if (!content.includes('<html') && !content.includes('<HTML')) {
    throw new Error(`File is not a valid HTML document: ${resolved}`);
  }
  return content;
}

export async function writeHtmlWikiFile(htmlFileLocation: string, content: string): Promise<void> {
  const resolved = path.resolve(htmlFileLocation);
  if (!isHtmlWiki(resolved)) {
    throw new Error(`Not a valid HTML wiki file: ${resolved}`);
  }
  const backupPath = `${resolved}.tidgi-backup-${Date.now()}`;
  const existing = await fs.readFile(resolved, 'utf-8');
  await fs.writeFile(backupPath, existing, 'utf-8');
  const temporaryPath = `${resolved}.tidgi-tmp-${Date.now()}`;
  try {
    await fs.writeFile(temporaryPath, content, 'utf-8');
    await fs.rename(temporaryPath, resolved);
  } finally {
    try {
      await fs.unlink(temporaryPath);
    } catch {
      // temp file may have been renamed
    }
  }
}
