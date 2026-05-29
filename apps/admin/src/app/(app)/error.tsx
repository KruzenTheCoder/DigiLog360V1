'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ErrorBoundary({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 rounded-full bg-red-100 p-3 dark:bg-red-950/50">
        <AlertTriangle className="h-7 w-7 text-red-600" />
      </div>
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-1 max-w-md text-sm text-[hsl(var(--muted))]">
        {error.message || 'An unexpected error occurred while loading this page.'}
      </p>
      <div className="mt-5">
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
