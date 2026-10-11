import { useEffect, useRef, type RefObject } from "react";

// Stack of open modal containers. Only the top one receives Escape and keeps
// focus; everything beneath it (the app root and lower modals) is `inert`, so
// keyboard and pointer input cannot reach the background.
const stack: HTMLElement[] = [];
const listeners = new Set<() => void>();
export const activeModal = () => stack.at(-1) ?? null;
export const subscribeModals = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusables(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (x) => !x.closest("[inert]") && x.offsetParent !== null,
  );
}

function applyInert() {
  const root = document.getElementById("root");
  if (root) root.inert = stack.length > 0;
  stack.forEach((el, i) => {
    el.inert = i < stack.length - 1;
  });
  for (const listener of listeners) listener();
}

/**
 * Modal behaviour shared by Dialog and Drawer: initial focus, Tab/Shift+Tab
 * cycling, inert background, Escape routed to `onEscape`, and focus returned to
 * the element that opened the modal.
 */
export function useModal(
  ref: RefObject<HTMLElement | null>,
  onEscape: () => void,
) {
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opener = document.activeElement as HTMLElement | null;
    stack.push(el);
    applyInert();
    // Drawers focus their own container (title is announced, nothing is changed by
    // an accidental keypress); dialogs focus their first field.
    const initial =
      (el.hasAttribute("data-autofocus") ? el : null) ??
      el.querySelector<HTMLElement>("[data-autofocus]") ??
      focusables(el).find((x) => x.matches("input,select,textarea")) ??
      focusables(el)[0] ??
      el;
    initial.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== el) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        escape.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(el);
      if (!items.length) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const i = stack.indexOf(el);
      if (i >= 0) stack.splice(i, 1);
      el.inert = false;
      applyInert();
      if (opener && opener.isConnected && !opener.closest("[inert]"))
        opener.focus();
    };
  }, [ref]);
}
