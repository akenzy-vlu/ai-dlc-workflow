/**
 * Whether this machine can actually drive a browser.
 *
 * A separate concern from the verification rung, and the distinction matters: the rung is
 * a property of the *project* (is it configured, are there credentials), the runner is a
 * property of the *machine*. A project on the `capable` rung with no Playwright installed
 * is not misconfigured — someone just has to install it here, once.
 */
export interface RunnerStatus {
  /** The interpreter verify.py would hand the plan to. */
  interpreter: string;
  /** Where it came from: an explicit setting, the console's own python, or nothing. */
  source: 'configured' | 'default';
  interpreterExists: boolean;
  playwrightInstalled: boolean;
  playwrightVersion: string | null;
  /** Chromium downloaded for this Playwright install. The second half of the setup. */
  chromiumInstalled: boolean;
  /** Everything needed to run a verification is present. */
  ready: boolean;
  /** What is missing, in the order it has to be fixed. */
  blockers: string[];
  /** Where a managed venv would live, or does. */
  suggestedVenvPath: string;
  venvExists: boolean;
  /** Absent when ai-dlc-verify itself is not installed. */
  requirementsPath: string | null;
}

export type SetupStepId = 'venv' | 'pip' | 'requirements' | 'browser' | 'verify';

export interface SetupStep {
  id: SetupStepId;
  title: string;
  /** Why this step exists, shown in the UI next to it. */
  detail: string;
}

/**
 * The install, as steps.
 *
 * A venv rather than the system interpreter, because macOS ships an externally-managed
 * Python that refuses `pip install` outright, and the failure it produces reads like a
 * broken tool rather than a policy. Installing into a venv the console owns sidesteps
 * that and keeps a browser automation library out of the system site-packages.
 */
export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'venv',
    title: 'Create a virtual environment',
    detail: 'Keeps Playwright out of an externally-managed system Python, which refuses pip installs.',
  },
  {
    id: 'pip',
    title: 'Update pip',
    detail: 'A fresh venv often ships a pip too old for current wheels.',
  },
  {
    id: 'requirements',
    title: 'Install Playwright',
    detail: 'The only dependency in the whole ai-dlc-verify package.',
  },
  {
    id: 'browser',
    title: 'Download Chromium',
    detail: 'Around 150 MB. This is the step that takes a while.',
  },
  {
    id: 'verify',
    title: 'Confirm it works',
    detail: 'Imports playwright and launches Chromium once, headless.',
  },
];
