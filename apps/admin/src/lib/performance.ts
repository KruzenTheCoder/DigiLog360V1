/**
 * Performance utilities for the DigiLog Admin application.
 * Includes memoization helpers, lazy loading utilities, and performance hooks.
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';

// ============================================================================
// Memoization Utilities
// ============================================================================

/**
 * Simple LRU (Least Recently Used) cache implementation
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  
  constructor(private maxSize: number = 100) {}
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  has(key: K): boolean {
    return this.cache.has(key);
  }
}

// Global cache for expensive computations
const globalCache = new LRUCache<string, unknown>(500);

/**
 * Memoize a function with LRU cache
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string,
  maxCacheSize = 500
): T {
  const cache = new LRUCache<string, ReturnType<T>>(maxCacheSize);
  
  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
    const cached = cache.get(key);
    
    if (cached !== undefined) {
      return cached;
    }
    
    const result = fn(...args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  }) as T;
}

// ============================================================================
// Performance Hooks
// ============================================================================

/**
 * Hook to measure component render time in development
 */
export function useRenderTime(componentName: string) {
  const renderCount = useRef(0);
  const startTime = useRef<number>(0);
  
  if (process.env.NODE_ENV === 'development') {
    renderCount.current++;
    startTime.current = typeof performance !== 'undefined' ? performance.now() : 0;
  }
  
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const duration = (typeof performance !== 'undefined' ? performance.now() : 0) - startTime.current;
      console.log(`[Performance] ${componentName} rendered #${renderCount.current} in ${duration.toFixed(2)}ms`);
    }
  });
}

// Type for idle callback handle

/**
 * Hook to defer non-critical work
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useIdleCallback<T extends () => void>(callback: T, deps: React.DependencyList = []) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let idleId: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let timeoutId: any;
    
    const schedule = () => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(() => {
          callbackRef.current();
        }, { timeout: 2000 });
      } else {
        // Fallback to setTimeout for browsers without requestIdleCallback
        timeoutId = setTimeout(() => {
          callbackRef.current();
        }, 1);
      }
    };
    
    schedule();
    
    return () => {
      if (idleId !== undefined) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, deps);
}

/**
 * Hook for virtualized list calculations
 */
export function useVirtualization(
  itemCount: number,
  itemHeight: number,
  overscan = 5
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  
  const visibleRange = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIdx = Math.min(
      itemCount - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );
    return { startIdx, endIdx };
  }, [scrollTop, containerHeight, itemHeight, itemCount, overscan]);
  
  const totalHeight = itemCount * itemHeight;
  const offsetY = visibleRange.startIdx * itemHeight;
  
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);
  
  useEffect(() => {
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);
      
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerHeight(entry.contentRect.height);
        }
      });
      
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);
  
  return {
    containerRef,
    visibleRange,
    totalHeight,
    offsetY,
    onScroll,
    visibleItemCount: visibleRange.endIdx - visibleRange.startIdx + 1,
  };
}
