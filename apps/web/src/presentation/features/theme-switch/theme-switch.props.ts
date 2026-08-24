import type { ThemePreference } from '@domain/repositories';

export interface ThemeSwitchViewProps {
  preference: ThemePreference;
  onChange: (preference: ThemePreference) => void;
}
