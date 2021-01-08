/* eslint-disable unicorn/no-null */
import { injectable } from 'inversify';
import getDecorators from 'inversify-inject-decorators';
import { app, ipcMain } from 'electron';
import settings from 'electron-settings';
import { pickBy, mapValues } from 'lodash';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fsExtra from 'fs-extra';
import Jimp from 'jimp';
import isUrl from 'is-url';
import download from 'download';
import tmp from 'tmp';

import serviceIdentifiers from '@services/serviceIdentifier';
import { container } from '@services/container';
import { Wiki } from '@services/wiki';
import { IWorkspace, IWorkspaceMetaData } from '@services/types';

const { lazyInject } = getDecorators(container);

@injectable()
export class Workspace {
  /**
   * version of current setting schema
   */
  version = '14';
  /**
   * Record from workspace id to workspace settings
   */
  workspaces: Record<string, IWorkspace> = {};

  @lazyInject(serviceIdentifiers.Wiki) private readonly wikiService!: Wiki;

  constructor() {
    this.workspaces = this.getInitWorkspacesForCache();
    this.init();
  }

  init(): void {
    ipcMain.handle('get-workspace-meta', (_event, id) => {
      return this.getMetaData(id);
    });
    ipcMain.handle('get-workspace-metas', (_event) => {
      return this.getAllMetaData();
    });
    ipcMain.handle('count-workspace', (_event) => {
      return this.countWorkspaces();
    });
    ipcMain.handle('get-workspace', (_event, id) => {
      return this.get(id);
    });
    ipcMain.handle('get-workspaces', (_event) => {
      return this.getWorkspaces();
    });
    ipcMain.handle('request-set-workspace-picture', async (_event, id, picturePath) => {
      await this.setWorkspacePicture(id, picturePath);
    });
    ipcMain.handle('request-remove-workspace-picture', async (_event, id) => {
      await this.removeWorkspacePicture(id);
    });
  }

  /**
   * load workspaces in sync, and ensure it is an Object
   */
  getInitWorkspacesForCache = (): Record<string, IWorkspace> => {
    const workspacesFromDisk = settings.getSync(`workspaces.${this.version}`) ?? {};
    return typeof workspacesFromDisk === 'object' && !Array.isArray(workspacesFromDisk)
      ? mapValues((pickBy(workspacesFromDisk, (value) => value !== null) as unknown) as Record<string, IWorkspace>, (workspace) =>
          this.sanitizeWorkspace(workspace),
        )
      : {};
  };

  public getWorkspaces(): Record<string, IWorkspace> {
    return this.workspaces;
  }

  public countWorkspaces(): number {
    return Object.keys(this.workspaces).length;
  }

  getWorkspacesAsList(): IWorkspace[] {
    return Object.values(this.workspaces).sort((a, b) => a.order - b.order);
  }

  get(id: string): IWorkspace | undefined {
    return this.workspaces[id];
  }

  async set(id: string, workspace: IWorkspace): Promise<void> {
    this.workspaces[id] = this.sanitizeWorkspace(workspace);
    await this.reactBeforeWorkspaceChanged(workspace);
    await settings.set(`workspaces.${this.version}.${id}`, { ...workspace });
  }

  async update(id: string, workspaceSetting: Partial<IWorkspace>): Promise<void> {
    const workspace = this.get(id);
    if (workspace === undefined) {
      return;
    }
    await this.set(id, { ...workspace, ...workspaceSetting });
  }

  async setWorkspaces(newWorkspaces: Record<string, IWorkspace>): Promise<void> {
    for (const id in newWorkspaces) {
      await this.set(id, newWorkspaces[id]);
    }
  }

  /**
   * Pure function that make sure workspace setting is consistent
   * @param workspaceToSanitize User input workspace or loaded workspace, that may contains bad values
   */
  private sanitizeWorkspace(workspaceToSanitize: IWorkspace): IWorkspace {
    const subWikiFolderName = path.basename(workspaceToSanitize.name);
    return { ...workspaceToSanitize, subWikiFolderName };
  }

  /**
   * Do some side effect before config change, update other services or filesystem, with new and old values
   * This happened after values sanitized
   * @param newWorkspaceConfig new workspace settings
   */
  private async reactBeforeWorkspaceChanged(newWorkspaceConfig: IWorkspace): Promise<void> {
    const { id, tagName } = newWorkspaceConfig;
    if (this.workspaces[id].isSubWiki && typeof tagName === 'string' && tagName.length > 0 && this.workspaces[id].tagName !== tagName) {
      this.wikiService.updateSubWikiPluginContent(this.workspaces[id].mainWikiToLink, newWorkspaceConfig, {
        ...newWorkspaceConfig,
        tagName: this.workspaces[id].tagName,
      });
      await this.wikiService.wikiStartup(newWorkspaceConfig);
    }
  }

  getByName(name: string): IWorkspace | undefined {
    return this.getWorkspacesAsList().find((workspace) => workspace.name === name);
  }

  getPreviousWorkspace = (id: string): IWorkspace | undefined => {
    const workspaceList = this.getWorkspacesAsList();
    let currentWorkspaceIndex = 0;
    for (const [index, workspace] of workspaceList.entries()) {
      if (workspace.id === id) {
        currentWorkspaceIndex = index;
        break;
      }
    }
    if (currentWorkspaceIndex === 0) {
      return workspaceList[workspaceList.length - 1];
    }
    return workspaceList[currentWorkspaceIndex - 1];
  };

  getNextWorkspace = (id: string): IWorkspace | undefined => {
    const workspaceList = this.getWorkspacesAsList();
    let currentWorkspaceIndex = 0;
    for (const [index, workspace] of workspaceList.entries()) {
      if (workspace.id === id) {
        currentWorkspaceIndex = index;
        break;
      }
    }
    if (currentWorkspaceIndex === workspaceList.length - 1) {
      return workspaceList[0];
    }
    return workspaceList[currentWorkspaceIndex + 1];
  };

  getActiveWorkspace = (): IWorkspace | undefined => {
    return Object.values(this.getWorkspaces()).find((workspace) => workspace.active);
  };

  async setActiveWorkspace(id: string): Promise<void> {
    const currentActiveWorkspace = this.getActiveWorkspace();
    if (currentActiveWorkspace !== undefined) {
      if (currentActiveWorkspace.id === id) {
        return;
      }
      // de-active the current one
      await this.set(currentActiveWorkspace.id, { ...currentActiveWorkspace, active: false });
    }
    // active new one
    await this.set(id, { ...this.workspaces[id], active: true, hibernated: false });
  }

  /**
   *
   * @param id workspace id
   * @param sourcePicturePath image path, could be an image in app's resource folder or temp folder, we will copy it into app data folder
   */
  async setWorkspacePicture(id: string, sourcePicturePath: string): Promise<void> {
    const workspace = this.get(id);
    if (workspace === undefined) {
      throw new Error(`Try to setWorkspacePicture() but this workspace is not existed ${id}`);
    }
    const pictureID = uuid();

    if (workspace.picturePath === sourcePicturePath) {
      return;
    }

    const destinationPicturePath = path.join(app.getPath('userData'), 'pictures', `${pictureID}.png`);

    // store new picture to fs
    let picturePath;
    if (isUrl(sourcePicturePath)) {
      const temporaryObject = tmp.dirSync();
      const temporaryPath = temporaryObject.name;
      picturePath = await download(sourcePicturePath, temporaryPath, {
        filename: 'e.png',
      }).then(() => path.join(temporaryPath, 'e.png'));
    } else {
      picturePath = sourcePicturePath;
    }

    const newImage = await Jimp.read(picturePath);
    await new Promise((resolve) => {
      newImage.clone().resize(128, 128).quality(100).write(destinationPicturePath, resolve);
    });
    const currentPicturePath = this.get(id)?.picturePath;
    await this.update(id, {
      picturePath: destinationPicturePath,
    });
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (currentPicturePath) {
      try {
        return await fsExtra.remove(currentPicturePath);
      } catch (error) {
        console.error(error);
      }
    }
  }

  async removeWorkspacePicture(id: string): Promise<void> {
    const workspace = this.get(id);
    if (workspace === undefined) {
      throw new Error(`Try to removeWorkspacePicture() but this workspace is not existed ${id}`);
    }
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (workspace.picturePath) {
      await fsExtra.remove(workspace.picturePath);
      await this.set(id, {
        ...workspace,
        picturePath: null,
      });
    }
  }

  async remove(id: string): Promise<void> {
    if (id in this.workspaces) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.workspaces[id];
      await settings.unset(`workspaces.${this.version}.${id}`);
    } else {
      throw new Error(`Try to remote workspace, but id ${id} is not existed`);
    }
    // TODO: call wiki service
    // const { name } = workspaces[id];
    // stopWiki(name);
    // stopWatchWiki(name);
  }

  async create(newWorkspaceConfig: Omit<IWorkspace, 'active' | 'hibernated' | 'id' | 'order'>): Promise<IWorkspace> {
    const newID = uuid();

    // find largest order
    const workspaceLst = this.getWorkspacesAsList();
    let max = 0;
    for (const element of workspaceLst) {
      if (element.order > max) {
        max = element.order;
      }
    }

    const newWorkspace: IWorkspace = {
      ...newWorkspaceConfig,
      active: false,
      hibernated: false,
      id: newID,
      order: max + 1,
    };

    await this.set(newID, newWorkspace);

    return newWorkspace;
  }

  /** to keep workspace variables (meta) that
   * are not saved to disk
   * badge count, error, etc
   */
  private metaData: Record<string, Partial<IWorkspaceMetaData>> = {};

  public getMetaData = (id: string): Partial<IWorkspaceMetaData> => this.metaData[id] ?? {};

  public getAllMetaData = (): Record<string, Partial<IWorkspaceMetaData>> => this.metaData;

  public updateMetaData = (id: string, options: Partial<IWorkspaceMetaData>): void => {
    this.metaData[id] = {
      ...this.metaData[id],
      ...options,
    };
  };
}
