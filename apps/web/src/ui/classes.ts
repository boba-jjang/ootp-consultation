/** Joins class names, dropping the undefined ones a CSS Module can hand back. */
export function classes(...names: (string | undefined | false)[]): string {
  return names.filter(Boolean).join(' ');
}
