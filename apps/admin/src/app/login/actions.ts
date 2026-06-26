'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-action sign-in.
 *
 * Why a server action and not a fetch from the browser:
 *   The Supabase browser client sets auth cookies via `document.cookie`, then
 *   the client immediately navigates to /menu. The Vercel edge middleware
 *   that runs on /menu reads cookies from the request — but on first-paint
 *   after a fresh sign-in the cookies sometimes aren't on that request yet
 *   (race between the browser writing the cookie and Vercel forwarding the
 *   next request). The middleware then bounces to /login, the user sees
 *   "couldn't log in", retries, and it works on the second attempt.
 *
 *   A server action eliminates that race entirely: the SAME response that
 *   redirects to /menu also writes the Set-Cookie headers, so Vercel
 *   guarantees the cookies arrive on the next request.
 */
export async function signInAction(formData: FormData): Promise<{ error: string } | never> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/menu');

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Common Supabase error: "Invalid login credentials" — surface verbatim.
    return { error: error.message };
  }

  // Cookies were just written by the supabase client into the cookie store
  // (see lib/supabase/server.ts setAll callback). redirect() emits the
  // 302 in the same response, so the Set-Cookie headers travel with it.
  redirect(next);
}
