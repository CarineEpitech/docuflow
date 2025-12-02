import { useCallback, useRef, useEffect } from "react";

export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): ((...args: Parameters<T>) => void) & { flush: () => void; cancel: () => void } {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Flush pending callback on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current && pendingArgsRef.current) {
        clearTimeout(timeoutRef.current);
        callbackRef.current(...pendingArgsRef.current);
      }
    };
  }, []);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      pendingArgsRef.current = args;

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
        pendingArgsRef.current = null;
        timeoutRef.current = null;
      }, delay);
    },
    [delay]
  ) as ((...args: Parameters<T>) => void) & { flush: () => void; cancel: () => void };

  // Add flush method to immediately execute pending callback
  debouncedFn.flush = useCallback(() => {
    if (timeoutRef.current && pendingArgsRef.current) {
      clearTimeout(timeoutRef.current);
      callbackRef.current(...pendingArgsRef.current);
      pendingArgsRef.current = null;
      timeoutRef.current = null;
    }
  }, []);

  // Add cancel method to cancel without executing
  debouncedFn.cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      pendingArgsRef.current = null;
      timeoutRef.current = null;
    }
  }, []);

  return debouncedFn;
}
