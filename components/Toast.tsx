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

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toasts: readonly ToastItem[];
  /** Queue a toast. Message text always comes from lib/copy.ts (rule 10). */
  showToast: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: number) => void;
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

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    // Return the same array when the id is already gone, so a late timer does
    // not commit a pointless re-render of every consumer.
    setToasts((current) =>
      current.some((toast) => toast.id === id)
        ? current.filter((toast) => toast.id !== id)
        : current,
    );
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "default") => {
      lastId.current += 1;
      const id = lastId.current;
      setToasts((current) => [...current, { id, message, variant }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), TOAST_DURATION_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, showToast, dismiss }),
    [toasts, showToast, dismiss],
  );

  return <ToastContext value={value}>{children}</ToastContext>;
}

/** The viewport, mounted once in the root layout. */
export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border bg-surface px-4 py-3 text-sm shadow-card ${
            toast.variant === "danger"
              ? "border-danger text-danger"
              : "border-border text-text"
          }`}
        >
          <span className="min-w-0 flex-1 wrap-break-word">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label={copy.common.dismiss}
            className="-mr-1 rounded p-1 text-text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
