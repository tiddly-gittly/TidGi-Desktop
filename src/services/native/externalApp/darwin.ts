/* eslint-disable unicorn/no-null */
import { logger } from '@services/libs/log';
import { pathExists } from 'fs-extra';
import appPath from './app-path';
import { IFoundEditor } from './found-editor';

/** Represents an external editor on macOS */
interface IDarwinExternalEditor {
  /**
   * List of bundle identifiers that are used by the app in its multiple
   * versions.
   */
  readonly bundleIdentifiers: string[];

  /** Name of the editor. It will be used both as identifier and user-facing. */
  readonly name: string;
}

/**
 * This list contains all the external editors supported on macOS. Add a new
 * entry here to add support for your favorite editor.
 */
const editors: IDarwinExternalEditor[] = [
  {
    name: 'Atom',
    bundleIdentifiers: ['com.github.atom'],
  },
  {
    name: 'MacVim',
    bundleIdentifiers: ['org.vim.MacVim'],
  },
  {
    name: 'Visual Studio Code',
    bundleIdentifiers: ['com.microsoft.VSCode'],
  },
  {
    name: 'Visual Studio Code (Insiders)',
    bundleIdentifiers: ['com.microsoft.VSCodeInsiders'],
  },
  {
    name: 'VSCodium',
    bundleIdentifiers: ['com.visualstudio.code.oss'],
  },
  {
    name: 'Sublime Text',
    bundleIdentifiers: ['com.sublimetext.4', 'com.sublimetext.3', 'com.sublimetext.2'],
  },
  {
    name: 'BBEdit',
    bundleIdentifiers: ['com.barebones.bbedit'],
  },
  {
    name: 'PhpStorm',
    bundleIdentifiers: ['com.jetbrains.PhpStorm'],
  },
  {
    name: 'PyCharm',
    bundleIdentifiers: ['com.jetbrains.PyCharm'],
  },
  {
    name: 'RubyMine',
    bundleIdentifiers: ['com.jetbrains.RubyMine'],
  },
  {
    name: 'RStudio',
    bundleIdentifiers: ['org.rstudio.RStudio'],
  },
  {
    name: 'TextMate',
    bundleIdentifiers: ['com.macromates.TextMate'],
  },
  {
    name: 'Brackets',
    bundleIdentifiers: ['io.brackets.appshell'],
  },
  {
    name: 'WebStorm',
    bundleIdentifiers: ['com.jetbrains.WebStorm'],
  },
  {
    name: 'Typora',
    bundleIdentifiers: ['abnerworks.Typora'],
  },
  {
    name: 'CodeRunner',
    bundleIdentifiers: ['com.krill.CodeRunner'],
  },
  {
    name: 'SlickEdit',
    bundleIdentifiers: ['com.slickedit.SlickEditPro2018', 'com.slickedit.SlickEditPro2017', 'com.slickedit.SlickEditPro2016', 'com.slickedit.SlickEditPro2015'],
  },
  {
    name: 'IntelliJ',
    bundleIdentifiers: ['com.jetbrains.intellij'],
  },
  {
    name: 'IntelliJ Community Edition',
    bundleIdentifiers: ['com.jetbrains.intellij.ce'],
  },
  {
    name: 'Xcode',
    bundleIdentifiers: ['com.apple.dt.Xcode'],
  },
  {
    name: 'GoLand',
    bundleIdentifiers: ['com.jetbrains.goland'],
  },
  {
    name: 'Android Studio',
    bundleIdentifiers: ['com.google.android.studio'],
  },
  {
    name: 'Rider',
    bundleIdentifiers: ['com.jetbrains.rider'],
  },
  {
    name: 'Nova',
    bundleIdentifiers: ['com.panic.Nova'],
  },
];

/**
 * This list contains all the external git GUI app supported on macOS. Add a new
 * entry here to add support for your favorite git GUI app.
 */
const gitGUIApp: IDarwinExternalEditor[] = [
  {
    name: 'GitHub Desktop',
    bundleIdentifiers: ['com.github.GitHubClient'],
  },
];

async function findApplication(editor: IDarwinExternalEditor): Promise<string | null> {
  for (const identifier of editor.bundleIdentifiers) {
    try {
      logger.info(`Try getting path of ${identifier} in darwin.findApplication`);
      // app-path not finding the app isn't an error, it just means the
      // bundle isn't registered on the machine.
      // https://github.com/sindresorhus/app-path/blob/0e776d4e132676976b4a64e09b5e5a4c6e99fcba/index.js#L7-L13
      const installPath = await appPath(identifier).catch(async (error: Error) => {
        logger.info(`findApplication() gets appPath Error: ${error?.message ?? String(error)}`);
        if (error?.message === "Couldn't find the app") {
          return await Promise.resolve(null);
        }
        return await Promise.reject(error);
      });
      logger.info(`Path of ${identifier} is ${String(installPath)} in darwin.findApplication`);

      if (installPath === null) {
        return null;
      }

      if (await pathExists(installPath)) {
        return installPath;
      }

      logger.info(`App installation for ${editor.name} not found at '${installPath}'`);
    } catch (error) {
      logger.info(`findApplication() Unable to locate ${editor.name} installation. Error: ${(error as Error).message}`);
    }
  }

  return null;
}

/**
 * Lookup known external editors using the bundle ID that each uses
 * to register itself on a user's machine when installing.
 */
export async function getAvailableEditors(editorName?: string): Promise<ReadonlyArray<IFoundEditor<string>>> {
  const results: Array<IFoundEditor<string>> = [];

  for (const editor of editors.filter((editor) => editorName === undefined || editor.name === editorName)) {
    const path = await findApplication(editor);

    if (path !== null) {
      results.push({ editor: editor.name, path });
    }
  }

  return results;
}

/**
 * Lookup known external git GUI app using the bundle ID that each uses
 * to register itself on a user's machine when installing.
 */
export async function getAvailableGitGUIApps(): Promise<ReadonlyArray<IFoundEditor<string>>> {
  const results: Array<IFoundEditor<string>> = [];

  for (const guiApp of gitGUIApp) {
    const path = await findApplication(guiApp);

    if (path) {
      results.push({ editor: guiApp.name, path });
    }
  }

  return results;
}
