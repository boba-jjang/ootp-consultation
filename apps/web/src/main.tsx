import './styles/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

import { SessionProvider } from './auth.tsx';
import { queryClient } from './data.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { router } from './router.tsx';
import { supabase } from './supabase.ts';

const container = document.getElementById('root');
if (!container) {
  throw new Error('index.html is missing the #root element');
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <SessionProvider client={supabase}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </SessionProvider>
    </ErrorBoundary>
  </StrictMode>,
);
