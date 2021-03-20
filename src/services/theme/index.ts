import { nativeTheme } from 'electron';
import { injectable } from 'inversify';

import type { IPreferenceService } from '@services/preferences/interface';
import { ITheme, IThemeService } from './interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { lazyInject } from '@services/container';
import { IViewService } from '@services/view/interface';


@injectable()
export class ThemeService implements IThemeService {
  @lazyInject(serviceIdentifier.Preference) private readonly preferenceService!: IPreferenceService;
  @lazyInject(serviceIdentifier.View) private readonly viewService!: IViewService;

  constructor() {
    this.init();
  }

  private init(): void {
    const themeSource = this.preferenceService.get('themeSource');
    // apply theme
    nativeTheme.themeSource = themeSource;
    nativeTheme.addListener('updated', () => {
      this.viewService.reloadViewsDarkReader();
      this.updateThemeSubject({ shouldUseDarkColors: this.shouldUseDarkColors() });
    });
  }

  public shouldUseDarkColors(): boolean {
    return nativeTheme.shouldUseDarkColors;
  }
}
