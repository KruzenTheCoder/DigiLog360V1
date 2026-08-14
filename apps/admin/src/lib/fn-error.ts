/**
 * Pull the real message out of a failed `supabase.functions.invoke`.
 *
 * On any non-2xx, supabase-js throws a FunctionsHttpError whose `message` is
 * the useless generic "Edge Function returned a non-2xx status code", and sets
 * `data` to null — so the body our function carefully wrote ("GROQ_API_KEY is
 * not configured on this project") never reaches the user. The response is
 * still attached as `context`; this reads it.
 */
export async function functionErrorMessage(
  err: unknown,
  data: unknown,
  fallback = 'Something went wrong.',
): Promise<string> {
  // A 2xx that carried an error field in the body.
  const d = data as { error?: string } | null;
  if (d?.error) return d.error;

  const ctx = (err as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json();
      if (body?.error) return String(body.error);
    } catch {
      try {
        const text = await (ctx as Response).clone().text();
        if (text) return text.slice(0, 300);
      } catch { /* fall through to the generic message */ }
    }
  }

  const msg = (err as { message?: string })?.message;
  return msg && !/non-2xx status code/i.test(msg) ? msg : fallback;
}
