import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center text-center">
      <p className="text-6xl font-extrabold text-brand">404</p>
      <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-[hsl(var(--muted))]">The page you’re looking for doesn’t exist.</p>
      <Link href="/dashboard" className="mt-5">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}
