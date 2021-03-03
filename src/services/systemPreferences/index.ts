import { app } from 'electron';
import { injectable } from 'inversify';
import getDecorators from 'inversify-inject-decorators';
import { container } from '@services/container';
import { ISystemPreferenceService, IUsedElectionSettings } from './interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWindowService } from '@services/windows/interface';
import { Subject } from 'rxjs';

const { lazyInject } = getDecorators(container);

@injectable()
export class SystemPreference implements ISystemPreferenceService {
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  public systemPreference$: Subject<IUsedElectionSettings>;

  constructor() {
    this.systemPreference$ = new Subject<IUsedElectionSettings>();
    this.updatePreferenceSubject();
  }

  private updatePreferenceSubject(): void {
    this.systemPreference$.next(this.getSystemPreferences());
  }

  public get<K extends keyof IUsedElectionSettings>(key: K): IUsedElectionSettings[K] {
    switch (key) {
      case 'openAtLogin': {
        // return our custom setting enum, to be cross-platform
        const loginItemSettings = app.getLoginItemSettings();
        const { openAtLogin, openAsHidden } = loginItemSettings;
        if (openAtLogin && openAsHidden) return 'yes-hidden';
        if (openAtLogin) return 'yes';
        return 'no';
      }
      default: {
        throw new Error(`Try to get ${key} in SystemPreference, but it is not existed`);
      }
    }
  }

  public getSystemPreferences(): IUsedElectionSettings {
    return {
      openAtLogin: this.get('openAtLogin'),
    };
  }

  public setSystemPreference<K extends keyof IUsedElectionSettings>(key: K, value: IUsedElectionSettings[K]): void {
    switch (key) {
      case 'openAtLogin': {
        app.setLoginItemSettings({
          openAtLogin: value.startsWith('yes'),
          openAsHidden: value === 'yes-hidden',
        });
        break;
      }
      default: {
        break;
      }
    }
    this.updatePreferenceSubject();
  }
}
