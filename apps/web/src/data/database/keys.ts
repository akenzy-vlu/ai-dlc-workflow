/**
 * Every persisted key, in one place.
 *
 * Namespaced under `kiln.` so the console never collides with anything else served from
 * localhost, which is a real hazard for a tool that lives on port 5173 alongside whatever
 * the user is actually building.
 */
export const STORAGE_KEYS = {
  actor: 'kiln.actor',
  theme: 'kiln.theme',
  /** One entry per view; the view's own key is appended. */
  viewPrefix: 'kiln.view.',
} as const;

export const viewKey = (view: string): string => `${STORAGE_KEYS.viewPrefix}${view}`;
