'use client';

/**
 * Performance Monitoring Component
 * Tracks Core Web Vitals and performance metrics
 */

import { useEffect, useCallback } from 'react';

interface PerformanceMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

interface WebVitalMetric {
  id: string;
  name: string;
  value: number;
  label: string;
}

const thresholds = {
  LCP: { good: 2500, poor: 4000 }, // Largest Contentful Paint
  FID: { good: 100, poor: 300 },   // First Input Delay
  CLS: { good: 0.1, poor: 0.25 },  // Cumulative Layout Shift
  FCP: { good: 1800, poor: 3000 }, // First Contentful Paint
  TTFB: { good: 800, poor: 1800 }, // Time to First Byte
};

function getRating(name: keyof typeof thresholds, value: number): PerformanceMetric['rating'] {
  const threshold = thresholds[name];
  if (!threshold) return 'good';
  
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

function sendToAnalytics(metric: WebVitalMetric) {
  // Send to your analytics endpoint
  const body = JSON.stringify(metric);
  
  // Use sendBeacon if available for reliable delivery
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics/web-vitals', body);
  } else {
    fetch('/api/analytics/web-vitals', {
      body,
      method: 'POST',
      keepalive: true,
    }).catch(() => {
      // Silently fail to not impact performance
    });
  }
  
  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Web Vitals] ${metric.name}: ${metric.value}`, metric);
  }
}

function observeLCP() {
  if (!('PerformanceObserver' in window)) return;
  
  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; loadTime?: number };
      const value = lastEntry.renderTime || lastEntry.loadTime || 0;
      
      sendToAnalytics({
        id: lastEntry.name,
        name: 'LCP',
        value: Math.round(value),
        label: getRating('LCP', value),
      });
    });
    
    observer.observe({ entryTypes: ['largest-contentful-paint'] });
  } catch {
    // LCP not supported
  }
}

function observeFID() {
  if (!('PerformanceObserver' in window)) return;
  
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const fidEntry = entry as PerformanceEntry & { processingStart: number; startTime: number };
        const value = fidEntry.processingStart - fidEntry.startTime;
        
        sendToAnalytics({
          id: fidEntry.name,
          name: 'FID',
          value: Math.round(value),
          label: getRating('FID', value),
        });
      }
    });
    
    observer.observe({ entryTypes: ['first-input'] });
  } catch {
    // FID not supported
  }
}

function observeCLS() {
  if (!('PerformanceObserver' in window)) return;
  
  try {
    let clsValue = 0;
    let clsEntries: PerformanceEntry[] = [];
    
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
        
        // Only count layout shifts without recent input
        if (!layoutShift.hadRecentInput) {
          clsValue += layoutShift.value;
          clsEntries.push(entry);
        }
      }
    });
    
    observer.observe({ entryTypes: ['layout-shift'] });
    
    // Report CLS on page unload
    window.addEventListener('beforeunload', () => {
      sendToAnalytics({
        id: 'cls',
        name: 'CLS',
        value: Math.round(clsValue * 1000) / 1000,
        label: getRating('CLS', clsValue),
      });
    });
    
    // Also report on visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        sendToAnalytics({
          id: 'cls',
          name: 'CLS',
          value: Math.round(clsValue * 1000) / 1000,
          label: getRating('CLS', clsValue),
        });
      }
    });
  } catch {
    // CLS not supported
  }
}

function observeFCP() {
  if (!('PerformanceObserver' in window)) return;
  
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          const paintEntry = entry as PerformanceEntry & { startTime: number };
          
          sendToAnalytics({
            id: 'fcp',
            name: 'FCP',
            value: Math.round(paintEntry.startTime),
            label: getRating('FCP', paintEntry.startTime),
          });
        }
      }
    });
    
    observer.observe({ entryTypes: ['paint'] });
  } catch {
    // Paint API not supported
  }
}

function observeTTFB() {
  if (!('performance' in window)) return;
  
  try {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    if (navigation) {
      const ttfb = navigation.responseStart - navigation.startTime;
      
      sendToAnalytics({
        id: 'ttfb',
        name: 'TTFB',
        value: Math.round(ttfb),
        label: getRating('TTFB', ttfb),
      });
    }
  } catch {
    // Navigation timing not supported
  }
}

// ============================================================================
// Performance Monitoring Component
// ============================================================================

export function PerformanceMonitor() {
  const initMonitoring = useCallback(() => {
    // Observe all Core Web Vitals
    observeLCP();
    observeFID();
    observeCLS();
    observeFCP();
    observeTTFB();
    
    // Log performance metrics in development
    if (process.env.NODE_ENV === 'development') {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          if (navigation) {
            console.log('[Performance] Page Load Metrics:', {
              dns: Math.round(navigation.domainLookupEnd - navigation.domainLookupStart),
              tcp: Math.round(navigation.connectEnd - navigation.connectStart),
              ttfb: Math.round(navigation.responseStart - navigation.startTime),
              domContentLoaded: Math.round(navigation.domContentLoadedEventEnd - navigation.startTime),
              load: Math.round(navigation.loadEventEnd - navigation.startTime),
            });
          }
        }, 0);
      });
    }
  }, []);

  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') return;
    
    // Initialize monitoring on mount
    initMonitoring();
    
    // Clean up on unmount (observers are automatically cleaned up)
    return () => {
      // Any cleanup if needed
    };
  }, [initMonitoring]);

  // This component doesn't render anything
  return null;
}

export default PerformanceMonitor;
