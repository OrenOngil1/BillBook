/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true
      }
    }
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setupVitest.ts",
    fileParallelism: false,
    projects: [
      {
        test: {
          name: "unit",
          sequence: { groupOrder: 1 },
          include: ["src/**/*.test.{ts,tsx}"]
        }
      },
      {
        test: {
          name: "integration",
          sequence: { groupOrder: 2 },
          include: ["tests/**/*.test.{ts,tsx}"]
        }
      }
    ]
  }
})
