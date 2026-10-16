import { useEffect, useRef, useState } from 'react';

/**
 * State and behaviour for a non-modal panel opened by a trigger button (a11y-6):
 * - Esc closes it, unless another layer (a Radix popover or dialog inside the
 *   panel) already consumed the key (it calls preventDefault in a capture-phase
 *   listener, which runs before this bubble-phase one);
 * - focus moves into the panel when it opens (give the panel `tabIndex={-1}`);
 * - focus returns to the trigger when it closes.
 */
export function useDismissablePanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      panelRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return { open, setOpen, panelRef, triggerRef };
}
