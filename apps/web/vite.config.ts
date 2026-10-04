import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Staging's sign-in redirect list allows http://localhost:5173 only, so fail rather than
  // move to another port when 5173 is taken.
  server: { port: 5173, strictPort: true },
});
