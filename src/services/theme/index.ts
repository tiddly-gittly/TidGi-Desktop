import { nativeTheme } from 'electron';
import { inject, injectable } from 'inversify';
import { BehaviorSubject } from 'rxjs';

import { WikiChannel } from '@/constants/channels';
import { container } from '@services/container';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import { isWikiWorkspace, type IWorkspaceService } from '@services/workspaces/interface';
import debounce from 'lodash/debounce';
import { DARK_LIGHT_CHANGE_ACTIONS_TAG, type ITheme, type IThemeService, type IThemeSource } from './interface';

@injectable()
export class ThemeService implements IThemeService {
  public theme$: BehaviorSubject<ITheme>;

  constructor(
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
  ) {
    this.theme$ = new BehaviorSubject<ITheme>({ shouldUseDarkColors: this.shouldUseDarkColorsSync() });
    this.updateActiveWikiTheme = debounce(this.updateActiveWikiTheme.bind(this), 1000) as typeof this.updateActiveWikiTheme;
  }

  private updateThemeSubject(newTheme: ITheme): void {
    this.theme$.next(newTheme);
  }

  public async initialize(): Promise<void> {
    const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
    const themeSource = await preferenceService.get('themeSource');
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

  public async setThemeSource(themeSource: IThemeSource): Promise<void> {
    nativeTheme.themeSource = themeSource;
    await this.preferenceService.set('themeSource', themeSource);
    this.updateThemeSubject({ shouldUseDarkColors: this.shouldUseDarkColorsSync() });
    await this.updateActiveWikiTheme();
  }

  /**
   * Fix browserView on background not updating theme issue #592
   * Also update browser view background color when theme changes
   */
  private async updateActiveWikiTheme(): Promise<void> {
    const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
    const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
    const workspaces = await workspaceService.getWorkspacesAsList();
    const shouldUseDarkColors = this.shouldUseDarkColorsSync();
    const backgroundColor = shouldUseDarkColors ? '#212121' : '#ffffff';

    await Promise.all(
      workspaces.filter((workspace) => isWikiWorkspace(workspace) && !workspace.isSubWiki && !workspace.hibernated).map(async (workspace) => {
        // Update wiki theme via TiddlyWiki actions
        await wikiService.wikiOperationInBrowser(WikiChannel.invokeActionsByTag, workspace.id, [
          DARK_LIGHT_CHANGE_ACTIONS_TAG,
          {
            'dark-mode': shouldUseDarkColors ? 'yes' : 'no',
          },
        ]);

        // Update browser view background color
        const viewService = container.get<IViewService>(serviceIdentifier.View);
        viewService.forEachView((view, workspaceID) => {
          if (workspaceID === workspace.id) {
            view.setBackgroundColor(backgroundColor);
          }
        });
      }),
    );
  }
}
