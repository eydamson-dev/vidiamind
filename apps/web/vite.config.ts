import { defineConfig } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import viteTsConfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';
import { nitro } from 'nitro/vite';

const config = defineConfig({
  plugins: [
    devtools(),
    nitro(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    port: 5173,
    // 🛑 CRITICAL FIX: Add host binding for Docker and the proxy for the API
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3333', // Targets the API container via the Docker bridge
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

export default config;
