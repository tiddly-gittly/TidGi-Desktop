/* eslint-disable @typescript-eslint/require-await */
import { nativeTheme } from 'electron';
import { injectable } from 'inversify';
import { BehaviorSubject } from 'rxjs';

import { WikiChannel } from '@/constants/channels';
import { lazyInject } from '@services/container';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';
import { isWikiWorkspace, IWorkspaceService } from '@services/workspaces/interface';
import debounce from 'lodash/debounce';
import { ITheme, IThemeService } from './interface';

@injectable()
export class ThemeService implements IThemeService {
  @lazyInject(serviceIdentifier.Preference)
  private readonly preferenceService!: IPreferenceService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  @lazyInject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  public theme$: BehaviorSubject<ITheme>;

  constructor() {
    void this.init();
    this.theme$ = new BehaviorSubject<ITheme>({ shouldUseDarkColors: this.shouldUseDarkColorsSync() });
    this.updateActiveWikiTheme = debounce(this.updateActiveWikiTheme.bind(this), 1000) as typeof this.updateActiveWikiTheme;
  }

  private updateThemeSubject(newTheme: ITheme): void {
    this.theme$.next(newTheme);
  }

  private async init(): Promise<void> {
    const themeSource = await this.preferenceService.get('themeSource');
    // apply theme
    nativeTheme.themeSource = themeSource;
    nativeTheme.addListener('updated', () => {
      this.updateThemeSubject({ shouldUseDarkColors: this.shouldUseDarkColorsSync() });
      void this.updateActiveWikiTheme();
    });
  }

  private shouldUseDarkColorsSync(): boolean {
    return nativeTheme.shouldUseDarkColors;
  }

  public async shouldUseDarkColors(): Promise<boolean> {
    return this.shouldUseDarkColorsSync();
  }

  /**
   * Fix browserView on background not updating theme issue #592
   */
  private async updateActiveWikiTheme(): Promise<void> {
    const workspaces = await this.workspaceService.getWorkspacesAsList();
    await Promise.all(
      workspaces.filter((workspace) => isWikiWorkspace(workspace) && !workspace.isSubWiki && !workspace.hibernated).map(async (workspace) => {
        await this.wikiService.wikiOperationInBrowser(WikiChannel.invokeActionsByTag, workspace.id, [
          '$:/tags/DarkLightChangeActions',
          {
            'dark-mode': this.shouldUseDarkColorsSync() ? 'yes' : 'no',
          },
        ]);
      }),
    );
  }
}
