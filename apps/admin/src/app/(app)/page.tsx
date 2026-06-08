import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirect to dashboard for authenticated users
  // This is handled by the middleware, but we keep this as a fallback
  redirect('/dashboard');
}
