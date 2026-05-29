'use client';

export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Application error</h2>
          <p style={{ color: '#64748b', marginTop: 8 }}>{error.message || 'A critical error occurred.'}</p>
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: '10px 20px', borderRadius: 8, border: 'none', background: '#667eea', color: '#fff', cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
