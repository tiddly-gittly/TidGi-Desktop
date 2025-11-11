import { injectable } from 'inversify';
import { nanoid } from 'nanoid';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkspaceGroup, IWorkspaceGroupService } from './interface';

@injectable()
export class WorkspaceGroupService implements IWorkspaceGroupService {
  private groups: Record<string, IWorkspaceGroup> | undefined;
  public groups$ = new BehaviorSubject<Record<string, IWorkspaceGroup> | undefined>(undefined);

  private getGroupsSync(): Record<string, IWorkspaceGroup> {
    if (this.groups === undefined) {
      const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
      const groupsFromDisk = databaseService.getSetting('workspaceGroups') ?? {};
      this.groups = typeof groupsFromDisk === 'object' && !Array.isArray(groupsFromDisk) ? groupsFromDisk : {};
    }
    return this.groups;
  }

  public updateGroupsSubject(): void {
    this.groups$.next(this.getGroupsSync());
  }

  public async getAll(): Promise<Record<string, IWorkspaceGroup>> {
    return this.getGroupsSync();
  }

  public async getAllAsList(): Promise<IWorkspaceGroup[]> {
    return Object.values(this.getGroupsSync()).sort((a, b) => a.order - b.order);
  }

  public async get(id: string): Promise<IWorkspaceGroup | undefined> {
    return this.getGroupsSync()[id];
  }

  public get$(id: string): Observable<IWorkspaceGroup | undefined> {
    return this.groups$.pipe(map((groups) => groups?.[id]));
  }

  public async exists(id: string): Promise<boolean> {
    return id in this.getGroupsSync();
  }

  public async create(name: string, workspaceIds: string[]): Promise<IWorkspaceGroup> {
    const groups = this.getGroupsSync();
    const id = nanoid();

    // Calculate order - place after the last group
    const maxOrder = Object.values(groups).reduce((max, group) => Math.max(max, group.order), -1);

    const newGroup: IWorkspaceGroup = {
      id,
      name,
      workspaceIds,
      order: maxOrder + 1,
      collapsed: false, // Start expanded
    };

    groups[id] = newGroup;
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    databaseService.setSetting('workspaceGroups', groups);
    await databaseService.immediatelyStoreSettingsToFile();

    this.updateGroupsSubject();
    logger.info(`Created workspace group ${name} with ID ${id}`);

    return newGroup;
  }

  public async update(id: string, updates: Partial<IWorkspaceGroup>): Promise<void> {
    const groups = this.getGroupsSync();
    const group = groups[id];

    if (group === undefined) {
      logger.error(`Could not update workspace group ${id} because it does not exist`);
      return;
    }

    groups[id] = { ...group, ...updates };
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    databaseService.setSetting('workspaceGroups', groups);
    await databaseService.immediatelyStoreSettingsToFile();

    this.updateGroupsSubject();
  }

  public async delete(groupId: string): Promise<void> {
    const groups = this.getGroupsSync();

    if (!(groupId in groups)) {
      logger.error(`Could not delete workspace group ${groupId} because it does not exist`);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete groups[groupId];
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    databaseService.setSetting('workspaceGroups', groups);
    await databaseService.immediatelyStoreSettingsToFile();

    this.updateGroupsSubject();
    logger.info(`Deleted workspace group ${groupId}`);
  }

  public async getGroupByWorkspaceId(workspaceId: string): Promise<IWorkspaceGroup | undefined> {
    const groups = this.getGroupsSync();
    return Object.values(groups).find((group) => group.workspaceIds.includes(workspaceId));
  }

  public async addWorkspaceToGroup(groupId: string, workspaceId: string): Promise<void> {
    const group = await this.get(groupId);
    if (group === undefined) {
      logger.error(`Could not add workspace ${workspaceId} to group ${groupId} because group does not exist`);
      return;
    }

    // Remove workspace from any existing group first
    await this.removeWorkspaceFromGroup(workspaceId);

    // Add to new group
    if (!group.workspaceIds.includes(workspaceId)) {
      await this.update(groupId, {
        workspaceIds: [...group.workspaceIds, workspaceId],
      });
    }
  }

  public async removeWorkspaceFromGroup(workspaceId: string): Promise<void> {
    const currentGroup = await this.getGroupByWorkspaceId(workspaceId);
    if (currentGroup === undefined) return;

    const newWorkspaceIds = currentGroup.workspaceIds.filter((id) => id !== workspaceId);

    // If this is the last workspace, delete the group
    if (newWorkspaceIds.length === 0) {
      await this.delete(currentGroup.id);
    } else {
      await this.update(currentGroup.id, {
        workspaceIds: newWorkspaceIds,
      });
    }
  }

  public async toggleCollapse(groupId: string): Promise<void> {
    const group = await this.get(groupId);
    if (group === undefined) {
      logger.error(`Could not toggle collapse for group ${groupId} because it does not exist`);
      return;
    }

    await this.update(groupId, {
      collapsed: !group.collapsed,
    });
  }
}
