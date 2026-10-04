import type { ReactNode, SVGProps } from 'react';

/**
 * The canvas's own line icons, as components. Each is decorative by default (aria-hidden), so
 * a control that shows only an icon must carry its own accessible name.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function Icon({ size = 18, ...props }: IconProps & { viewBox: string; children: ReactNode }) {
  return <svg width={size} height={size} aria-hidden="true" focusable="false" {...props} />;
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** The team mark: an arrow to the top right. */
export function ArrowMark(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" size={22} {...props}>
      <path d="M5 19 L19 5 M9 5 L19 5 L19 15" {...STROKE} strokeWidth={2.2} />
    </Icon>
  );
}

/** The app mark: a diamond in a diamond. */
export function DiamondMark(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" size={22} {...props}>
      <path
        d="M12 3 L21 12 L12 21 L3 12 Z M12 8.5 L15.5 12 L12 15.5 L8.5 12 Z"
        {...STROKE}
        strokeWidth={1.8}
      />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <path d="M4 10.5 L8.5 15 L16 5.5" {...STROKE} />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <path
        d="M7.5 11 L7.5 8 A4.5 4.5 0 0 1 16.5 8 L16.5 11 M5 11 L19 11 L19 20 L5 20 Z"
        {...STROKE}
      />
    </Icon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" size={34} {...props}>
      <path
        d="M12 15 L12 4 M7.5 8.5 L12 4 L16.5 8.5 M4 14 L4 19 L20 19 L20 14"
        {...STROKE}
        strokeWidth={1.8}
      />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <path d="M12 5 L12 19 M5 12 L19 12" {...STROKE} />
    </Icon>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <path
        d="M4 7 L11 7 M15 7 L20 7 M4 12 L7 12 M11 12 L20 12 M4 17 L13 17 M17 17 L20 17"
        {...STROKE}
      />
      <circle cx="13" cy="7" r="2" {...STROKE} />
      <circle cx="9" cy="12" r="2" {...STROKE} />
      <circle cx="15" cy="17" r="2" {...STROKE} />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" size={14} {...props}>
      <path d="M6 9 L12 15 L18 9" {...STROKE} />
    </Icon>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" size={14} {...props}>
      <path d="M6 15 L12 9 L18 15" {...STROKE} />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" size={16} {...props}>
      <path d="M15 6 L9 12 L15 18" {...STROKE} />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" size={16} {...props}>
      <path d="M9 6 L15 12 L9 18" {...STROKE} />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="9" {...STROKE} strokeWidth={1.8} />
      <path d="M12 11 L12 16 M12 8 L12 8.2" {...STROKE} />
    </Icon>
  );
}
