import { BehaviorSubject } from 'rxjs';
import { nativeTheme } from 'electron';
import { injectable } from 'inversify';

import type { IPreferenceService } from '@services/preferences/interface';
import { ITheme, IThemeService } from './interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { lazyInject } from '@services/container';

@injectable()
export class ThemeService implements IThemeService {
  @lazyInject(serviceIdentifier.Preference) private readonly preferenceService!: IPreferenceService;
  public theme$: BehaviorSubject<ITheme>;

  constructor() {
    void this.init();
    this.theme$ = new BehaviorSubject<ITheme>({ shouldUseDarkColors: this.shouldUseDarkColors() });
  }

  private updateThemeSubject(newTheme: ITheme): void {
    this.theme$.next(newTheme);
  }

  private async init(): Promise<void> {
    const themeSource = await this.preferenceService.get('themeSource');
    // apply theme
    nativeTheme.themeSource = themeSource;
    nativeTheme.addListener('updated', () => {
      this.updateThemeSubject({ shouldUseDarkColors: this.shouldUseDarkColors() });
    });
  }

  private shouldUseDarkColors(): boolean {
    return nativeTheme.shouldUseDarkColors;
  }
}
