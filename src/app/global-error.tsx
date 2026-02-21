'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f8fafc' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>&#9888;</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
              Erro crítico
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '2rem' }}>
              A aplicação encontrou um erro grave. Tente recarregar a página.
            </p>
            <button
              onClick={reset}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '0.75rem',
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Recarregar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
