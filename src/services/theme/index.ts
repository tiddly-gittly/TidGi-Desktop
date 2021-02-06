import { nativeTheme } from 'electron';
import { injectable } from 'inversify';
import getDecorators from 'inversify-inject-decorators';

import type { IWindowService } from '@services/windows/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import { IThemeService } from './interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { container } from '@services/container';
import { ThemeChannel } from '@/constants/channels';
import { IViewService } from '@services/view/interface';

const { lazyInject } = getDecorators(container);

@injectable()
export class ThemeService implements IThemeService {
  @lazyInject(serviceIdentifier.Preference) private readonly preferenceService!: IPreferenceService;
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  @lazyInject(serviceIdentifier.View) private readonly viewService!: IViewService;

  constructor() {
    this.init();
  }

  private init(): void {
    const themeSource = this.preferenceService.get('themeSource');
    // apply theme
    nativeTheme.themeSource = themeSource;
    nativeTheme.addListener('updated', () => {
      this.windowService.sendToAllWindows(ThemeChannel.nativeThemeUpdated);
      this.viewService.reloadViewsDarkReader();
    });
  }

  public shouldUseDarkColors(): boolean {
    return nativeTheme.shouldUseDarkColors;
  }
}
