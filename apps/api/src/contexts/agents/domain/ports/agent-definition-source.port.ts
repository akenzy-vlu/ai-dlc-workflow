export const AGENT_DEFINITION_SOURCE = Symbol('AGENT_DEFINITION_SOURCE');

/** A configured agent CLI, before `which` decides whether it exists on this machine. */
export interface AgentConfigEntry {
  id: string;
  label?: string;
  binary: string;
  args?: string[];
  promptVia?: 'stdin' | 'arg';
}

/**
 * Where the *custom* agent definitions come from — the additions to the four built-ins.
 *
 * Split out so the same catalog logic (merge over built-ins, then resolve on PATH) serves
 * both a JSON file on a laptop and a table in a deployment.
 */
export interface AgentDefinitionSourcePort {
  list(): Promise<AgentConfigEntry[]>;
}
