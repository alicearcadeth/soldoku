import { useEffect, useRef, type ReactNode } from "react";

const stack: Array<() => void> = [];

export function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    const close = () => closeRef.current();
    stack.push(close);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => [...(node?.querySelectorAll<HTMLElement>("button, input, textarea, select, summary, a[href]") ?? [])].filter((el) => !el.hasAttribute("disabled"));
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== close) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const list = items();
      if (list.length === 0) return;
      const start = list[0];
      const end = list[list.length - 1];
      if (event.shiftKey && document.activeElement === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const index = stack.lastIndexOf(close);
      if (index >= 0) stack.splice(index, 1);
      previous?.focus();
    };
  }, []);

  return ref;
}

export function DialogFrame({ id, onClose, children }: { id: string; onClose: () => void; children: ReactNode }) {
  const ref = useDialogFocus(onClose);
  return (
    <div className="overlay">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <img className="brand-logo" src="/brand/soldoku-logo.png" alt="" width="2172" height="724" />
        {children}
      </div>
    </div>
  );
}
