import {
  createContext,
  use,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Link, type LinkProps } from 'react-router';

import { classes } from './classes.ts';
import { ChevronDownIcon } from './icons.tsx';
import styles from './menu.module.css';

const MenuContext = createContext<{ close: () => void } | null>(null);

const useMenu = () => {
  const menu = use(MenuContext);
  if (!menu) {
    throw new Error('Menu items need a Menu above them');
  }
  return menu;
};

/**
 * A button that opens a menu of links and actions, with the keyboard behaviour of the ARIA
 * menu pattern: arrows move, Home and End jump, Space activates a link like a button, Escape
 * closes and returns the focus, and a pointer down outside closes.
 */
export function Menu({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = () => [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  useEffect(() => {
    if (!open) {
      return;
    }
    items()[0]?.focus();
    const away = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', away);
    return () => {
      document.removeEventListener('pointerdown', away);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
  };
  const onListKeyDown = (event: KeyboardEvent) => {
    const all = items();
    const current = all.findIndex((item) => item === document.activeElement);
    const move = (index: number) => {
      event.preventDefault();
      all[(index + all.length) % all.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        move(current + 1);
        break;
      case 'ArrowUp':
        move(current - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(all.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        trigger.current?.focus();
        break;
      case 'Tab':
        close();
        break;
      case ' ':
        // Anchors only act on Enter; a menu item acts on Space too.
        if (document.activeElement instanceof HTMLAnchorElement) {
          event.preventDefault();
          document.activeElement.click();
        }
        break;
      default:
    }
  };
  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div ref={root} className={classes(styles.menu, className)}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((current) => !current);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        {label}
        <ChevronDownIcon className={styles.chevron} />
      </button>
      {open ? (
        <MenuContext value={{ close }}>
          <div role="menu" id={id} className={styles.list} onKeyDown={onListKeyDown}>
            {children}
          </div>
        </MenuContext>
      ) : null}
    </div>
  );
}

export function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p className={styles.groupLabel} aria-hidden="true">
        {label}
      </p>
      {children}
    </div>
  );
}

/** A menu item that goes somewhere. */
export function MenuLink({ className, onClick, ...props }: LinkProps) {
  const { close } = useMenu();
  return (
    <Link
      role="menuitem"
      tabIndex={-1}
      className={classes(styles.item, className)}
      onClick={(event) => {
        onClick?.(event);
        close();
      }}
      {...props}
    />
  );
}

/** A menu item that does something. */
export function MenuAction({ className, onClick, ...props }: ComponentProps<'button'>) {
  const { close } = useMenu();
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={classes(styles.item, className)}
      onClick={(event) => {
        onClick?.(event);
        close();
      }}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <hr className={styles.separator} />;
}
