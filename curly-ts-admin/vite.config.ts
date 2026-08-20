import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    allowedHosts: [
      'rings-photograph-cancer-spoke.trycloudflare.com'
    ]
  }
});