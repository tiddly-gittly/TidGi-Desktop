import type { IPreferences } from '../interface';

/**
 * A side effect that runs after a preference value changes.
 * `newValue` is the new preference value, `preferences` is the full current state.
 */
type SideEffectFunction = (newValue: unknown, preferences: IPreferences) => Promise<void>;

const sideEffects: Record<string, SideEffectFunction> = {
  realignActiveWorkspace: async () => {
    await window.service.workspaceView.realignActiveWorkspace();
  },
  /** When you hide icon, auto-show text; when you hide text, auto-show icon */
  ensureSidebarVisibility_icon: async (newValue, preferences) => {
    if (!newValue && !preferences.showSideBarText) {
      await window.service.preference.set('showSideBarText', true);
    }
  },
  ensureSidebarVisibility_text: async (newValue, preferences) => {
    if (!newValue && !preferences.showSideBarIcon) {
      await window.service.preference.set('showSideBarIcon', true);
    }
  },
};

export function getSideEffect(id: string): SideEffectFunction | undefined {
  return sideEffects[id];
}
