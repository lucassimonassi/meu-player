import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

// base './' e obrigatorio: sem ele a TV procura os arquivos na raiz do sistema (tela preta).
// O plugin legacy gera um bundle compativel com Chromium antigo (TVs Samsung/LG mais velhas).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    legacy({ targets: ['chrome >= 56'], renderLegacyChunks: true, modernPolyfills: true }),
  ],
  build: { target: 'es2015' },
});
