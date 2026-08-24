import { preferencesRepository } from '@data/repositories';
import { ThemeSwitchView } from './theme-switch.view';

/**
 * Three states, not a toggle: "follow the system" is a real preference and a switch
 * cannot express it — flipping to dark at dusk is the OS's job.
 */
export function ThemeSwitch() {
  const { preference, setPreference } = preferencesRepository.useThemePreference();
  return <ThemeSwitchView preference={preference} onChange={setPreference} />;
}
