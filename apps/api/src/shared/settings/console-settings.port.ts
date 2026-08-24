export const CONSOLE_SETTINGS = Symbol('CONSOLE_SETTINGS');

/** Console preferences that survive a restart. Not plan state, and never per-repository. */
export interface ConsoleSettings {
  /** Interpreter the browser runner is launched with, once setup has resolved one. */
  runnerPython?: string;
}

export interface ConsoleSettingsPort {
  read(): Promise<ConsoleSettings>;
  /** Merges the patch over what is stored; keys not named are left alone. */
  patch(values: Partial<ConsoleSettings>): Promise<void>;
}
