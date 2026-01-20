// vite.config.js
import { resolve } from 'path'
import { defineConfig } from 'vite'


export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        student: resolve(__dirname, 'student.html'),
        teacherMonitor: resolve(__dirname, 'teacherMonitor.html'),
      },
    },
  },
})
