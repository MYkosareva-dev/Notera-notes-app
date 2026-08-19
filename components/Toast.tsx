"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

import { copy } from "@/lib/copy";

const TOAST_DURATION_MS = 4000;

export type ToastVariant = "default" | "danger";

interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  variant?: ToastVariant;
  /**
   * `"persistent"` is SPEC rule B8's banner and edge case G-1's session notice:
   * a toast that stays until the user acts on it or dismisses it. There is no
   * separate Banner component on purpose — SPEC Block E's component table
   * sanctions none, and one queue means two notices cannot overlap on screen.
   */
  duration?: number | "persistent";
  /** Rendered as a button beside the message, e.g. B8's "Retry now". */
  action?: ToastAction;
  /**
   * Dedupe key. A second toast with the same key REPLACES the first in place
   * instead of stacking — what B8's retry ×3 needs (one notice, updated three
   * times) and what Block F means by "toast once" for the cap messages.
   *
   * Replacing is also why an action click does not auto-dismiss: the caller
   * usually answers its own action with a same-key toast, and dismissing here
   * would race that update. Lifecycle stays with the caller.
   */
  key?: string;
}

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
  persistent: boolean;
}

/**
 * True when re-showing this toast would change nothing on screen AND there is no timer
 * to restart — which is only the case for a persistent notice with identical content.
 *
 * It exists so a caller may re-show a persistent notice as often as it likes (NoteEditor
 * does it on every keystroke while saving is suspended, so dismissing the notice cannot
 * strand the user) without re-rendering the viewport each time.
 *
 * Actions are compared by LABEL, not by function identity: a caller building the toast
 * fresh each time passes a new closure every call, so identity would never match. The
 * label is what the user sees, and every label comes from lib/copy.ts.
 */
function isNoOpReshow(existing: ToastItem, next: ToastItem): boolean {
  return (
    existing.persistent &&
    next.persistent &&
    existing.message === next.message &&
    existing.variant === next.variant &&
    (existing.action?.label ?? null) === (next.action?.label ?? null)
  );
}

interface ToastContextValue {
  toasts: readonly ToastItem[];
  /** Queue a toast. Message text always comes from lib/copy.ts (rule 10). */
  showToast: (message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
  /** Dismiss by dedupe key — for a notice whose condition has cleared. */
  dismissKey: (key: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (value === null) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return value;
}

/**
 * Holds the toast queue. Presentational infrastructure only — it transports
 * strings, it never knows what a note is or talks to a server.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const lastId = useRef(0);
  const timers = useRef<Map<number, number>>(new Map());
  // Which id currently belongs to which dedupe key.
  const keyedIds = useRef<Map<string, number>>(new Map());

  const clearTimer = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      keyedIds.current.forEach((keyedId, key) => {
        if (keyedId === id) {
          keyedIds.current.delete(key);
        }
      });
      // Return the same array when the id is already gone, so a late timer does
      // not commit a pointless re-render of every consumer.
      setToasts((current) =>
        current.some((toast) => toast.id === id)
          ? current.filter((toast) => toast.id !== id)
          : current,
      );
    },
    [clearTimer],
  );

  const dismissKey = useCallback(
    (key: string) => {
      const id = keyedIds.current.get(key);
      if (id !== undefined) {
        dismiss(id);
      }
    },
    [dismiss],
  );

  const showToast = useCallback(
    (message: string, options?: ToastOptions) => {
      const {
        variant = "default",
        duration = TOAST_DURATION_MS,
        action,
        key,
      } = options ?? {};

      // Reuse the id the key already owns, so the notice updates where it stands.
      const existingId = key === undefined ? undefined : keyedIds.current.get(key);
      const id = existingId ?? (lastId.current += 1);
      if (existingId !== undefined) {
        clearTimer(existingId);
      }
      if (key !== undefined) {
        keyedIds.current.set(key, id);
      }

      const next: ToastItem = {
        id,
        message,
        variant,
        action,
        persistent: duration === "persistent",
      };
      setToasts((current) => {
        const existing = current.find((toast) => toast.id === id);
        if (existing !== undefined && isNoOpReshow(existing, next)) {
          return current;
        }
        return existing !== undefined
          ? current.map((toast) => (toast.id === id ? next : toast))
          : [...current, next];
      });

      if (duration !== "persistent") {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [clearTimer, dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, showToast, dismiss, dismissKey }),
    [toasts, showToast, dismiss, dismissKey],
  );

  return <ToastContext value={value}>{children}</ToastContext>;
}

/**
 * The viewport, mounted once in the root layout.
 *
 * It also owns FOCUS RESTORATION, which is behaviour rather than decoration: a control
 * inside a toast (the × or the action) takes focus when clicked, and the toast then
 * disappears out from under it. The browser drops focus to `<body>`, so the user's next
 * keystroke goes nowhere — on the save-failure notice that is the recovery path itself,
 * since it is an edit that brings a dismissed notice back.
 *
 * So the last element focused OUTSIDE the viewport is remembered, and focus returns
 * there when the element that had it goes away with its toast. Deliberately narrow: if
 * focus is not inside the viewport when the toasts change — the ordinary case of a timed
 * toast expiring while the user types — nothing is touched, because a notice must never
 * steal or move the caret on its own.
 */
export function Toaster() {
  const { toasts, dismiss } = useToast();
  const viewport = useRef<HTMLDivElement>(null);
  /** The last thing focused outside the viewport: where focus goes back to. */
  const lastOutside = useRef<HTMLElement | null>(null);
  /** Whether focus currently sits on a control inside a toast. */
  const focusInside = useRef(false);

  useEffect(() => {
    function trackFocus(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const inside = viewport.current?.contains(target) ?? false;
      focusInside.current = inside;
      if (!inside) {
        lastOutside.current = target;
      }
    }

    // `focusin` bubbles (unlike `focus`), so one document listener sees every move,
    // whether the user got there by mouse or by keyboard.
    document.addEventListener("focusin", trackFocus);
    return () => document.removeEventListener("focusin", trackFocus);
  }, []);

  useEffect(() => {
    if (!focusInside.current) {
      return;
    }
    const active = document.activeElement;
    const stillInside =
      active instanceof HTMLElement && (viewport.current?.contains(active) ?? false);
    if (stillInside) {
      // The toasts changed but the focused control survived (a notice updated in
      // place, say). Nothing to restore.
      return;
    }

    focusInside.current = false;
    const target = lastOutside.current;
    if (target !== null && target.isConnected) {
      target.focus();
    }
  }, [toasts]);

  return (
    <div
      ref={viewport}
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-card border bg-surface px-4 py-3 text-sm shadow-card ${
            toast.variant === "danger"
              ? "border-danger text-danger"
              : "border-border text-text"
          }`}
        >
          <span className="min-w-0 flex-1 wrap-break-word">{toast.message}</span>
          {/* A filled button, never a text link. This is the only way out of the state
              the notice describes (rule B8's Retry now, G-1's Sign in), and a link-styled
              action was missed entirely on first encounter. Accent rather than danger
              fill even inside a danger notice: the action is the recovery, and in this
              app red means destructive (Delete). */}
          {toast.action === undefined ? null : (
            <button
              type="button"
              onClick={toast.action.onClick}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label={copy.common.dismiss}
            className="-mr-1 shrink-0 rounded p-1 text-text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
