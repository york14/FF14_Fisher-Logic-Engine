import { defineConfig } from 'vite'

export default defineConfig({
  // Base config
  root: './',
  base: './', // For relative paths in build
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  },
  server: {
    port: 3000,
    open: true
  }
})
