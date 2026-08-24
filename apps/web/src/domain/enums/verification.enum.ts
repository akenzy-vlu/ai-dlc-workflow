/**
 * Which rung `verify.py resolve()` put a project on.
 *
 * The ladder degrades on purpose — ai-dlc-verify is installed globally and meets projects
 * with no login, no staging and no credentials, and a tool that fails loudly there gets
 * disabled. The one exception: `config error` must never soften into `skipped`, because
 * that silently drops a required environment.
 */
export const VERIFICATION_RUNGS = ['not applicable', 'skipped', 'capable', 'config error'] as const;
export type VerificationRung = (typeof VERIFICATION_RUNGS)[number];

export const RUNG_LABELS: Record<VerificationRung, string> = {
  'not applicable': 'Not applicable',
  skipped: 'Skipped',
  capable: 'Capable',
  'config error': 'Config error',
};

export const RUNG_EXPLANATIONS: Record<VerificationRung, string> = {
  'not applicable':
    'This repository declares no `verify:` block, so nothing is resolved and nothing is blocked.',
  skipped:
    'Configured, but this machine is missing credentials for a required environment. No browser opens, no evidence is written, and no gate is blocked.',
  capable:
    'Configured and credentialed. A run produces screenshots, an evidence report, and the checkboxes G4 counts.',
  'config error':
    'A contradiction in `.ai/aidlc.yaml`. This deliberately does not degrade into a skip — that would silently drop a required environment.',
};

export const SETUP_STEP_IDS = ['venv', 'pip', 'requirements', 'browser', 'verify'] as const;
export type SetupStepId = (typeof SETUP_STEP_IDS)[number];
