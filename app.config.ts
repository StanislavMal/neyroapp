// 📄 app.config.ts

import { defineConfig } from '@tanstack/react-start/config'
import viteTsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  tsr: {
    appDirectory: 'src',
  },
  server: {
    // ✅ ИЗМЕНЕНИЕ: Меняем пресет на 'vercel'
    // Это переключит сборку для развертывания на Vercel Serverless Functions
    preset: 'vercel',
  },
  vite: {
    plugins: [
      // this is the plugin that enables path aliases
      viteTsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
    ],
  },
})
