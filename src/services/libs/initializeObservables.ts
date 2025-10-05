import type { IAuthenticationService } from '@services/auth/interface';
import { container } from '@services/container';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkspaceService } from '@services/workspaces/interface';

/**
 * Observables in services is lazy-loaded, need to trigger the first data loading.
 */
export function initializeObservables() {
  const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  authService.updateUserInfoSubject();
  preferenceService.updatePreferenceSubject();
  workspaceService.updateWorkspaceSubject();
}
