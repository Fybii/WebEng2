import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite-Konfiguration für Navix.
// server.host: true → App ist auch im lokalen Netzwerk erreichbar
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});