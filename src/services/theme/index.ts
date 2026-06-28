import { nativeTheme } from 'electron';
import { inject, injectable } from 'inversify';
import { BehaviorSubject } from 'rxjs';

import type { IAnalyticsService } from '@services/analytics/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import debounce from 'lodash/debounce';
import { type IActiveWikiThemeUpdater, type ITheme, type IThemeService, type IThemeSource } from './interface';

@injectable()
export class ThemeService implements IThemeService {
  public theme$: BehaviorSubject<ITheme>;
  private activeWikiThemeUpdater: IActiveWikiThemeUpdater | undefined;

  constructor(
    @inject(serviceIdentifier.Preference) private readonly preferenceService: IPreferenceService,
    @inject(serviceIdentifier.Analytics) private readonly analyticsService: IAnalyticsService,
  ) {
    this.theme$ = new BehaviorSubject<ITheme>({ shouldUseDarkColors: this.shouldUseDarkColorsSync() });
    this.updateActiveWikiTheme = debounce(this.updateActiveWikiTheme.bind(this), 1000) as typeof this.updateActiveWikiTheme;
  }

  public setActiveWikiThemeUpdater(handler: IActiveWikiThemeUpdater): void {
    this.activeWikiThemeUpdater = handler;
  }

  private updateThemeSubject(newTheme: ITheme): void {
    this.theme$.next(newTheme);
  }

  public async initialize(): Promise<void> {
    const themeSource = await this.preferenceService.get('themeSource');
    // apply theme
    nativeTheme.themeSource = themeSource;
    nativeTheme.addListener('updated', () => {
      this.updateThemeSubject({ shouldUseDarkColors: this.shouldUseDarkColorsSync() });
      void this.updateActiveWikiTheme();
    });
  }

  private shouldUseDarkColorsSync(): boolean {
    const mockedSystemPalette = process.env.TIDGI_E2E_MOCK_SYSTEM_PALETTE;
    if (
      process.env.E2E_TEST === 'true' &&
      nativeTheme.themeSource === 'system' &&
      (mockedSystemPalette === 'dark' || mockedSystemPalette === 'light')
    ) {
      return mockedSystemPalette === 'dark';
    }
    return nativeTheme.shouldUseDarkColors;
  }

  public async shouldUseDarkColors(): Promise<boolean> {
    return this.shouldUseDarkColorsSync();
  }

  public async setThemeSource(themeSource: IThemeSource): Promise<void> {
    nativeTheme.themeSource = themeSource;
    await this.preferenceService.set('themeSource', themeSource);
    this.updateThemeSubject({ shouldUseDarkColors: this.shouldUseDarkColorsSync() });
    void this.analyticsService.track('theme.changed', {
      themeSource,
      darkMode: this.shouldUseDarkColorsSync(),
    });
    await this.updateActiveWikiTheme();
  }

  /**
   * Fix browserView on background not updating theme issue #592
   * Also update browser view background color when theme changes
   */
  private async updateActiveWikiTheme(): Promise<void> {
    const shouldUseDarkColors = this.shouldUseDarkColorsSync();
    await this.activeWikiThemeUpdater?.({ shouldUseDarkColors });
  }
}
