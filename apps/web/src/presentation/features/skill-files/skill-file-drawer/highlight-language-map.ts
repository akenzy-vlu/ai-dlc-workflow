/**
 * Maps a file extension to a `highlight.js` language name. An extension with
 * no entry here falls through to `highlight.js`'s auto/plain path (A-08) —
 * an unknown extension must degrade to plain text, never error.
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.py': 'python',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  '.sh': 'bash',
  '.bash': 'bash',
};

export function resolveHighlightLanguage(extension: string): string | undefined {
  return EXTENSION_TO_LANGUAGE[extension.toLowerCase()];
}
