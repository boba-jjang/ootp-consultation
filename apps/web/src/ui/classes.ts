import styles from './primitives.module.css';

/** The classes of a button of one variant, for a router Link that should look like one. */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'accent' | 'ghost' | 'link';

export const buttonClass = (variant: ButtonVariant = 'outline', className?: string) =>
  classes(styles.button, styles[variant], className);

/** Joins class names, dropping the undefined ones a CSS Module can hand back. */
export function classes(...names: (string | undefined | false)[]): string {
  return names.filter(Boolean).join(' ');
}
