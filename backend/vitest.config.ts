import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    projects:[
      {
        test :{
          name: "unit",
          sequence: { groupOrder: 1 },
          include: ["src/**/*.test.ts"]
        }
      },
      {
        test: {
          name: "integration",
          sequence: { groupOrder: 2 },
          env: loadEnv("test", process.cwd(), ""),
          globalSetup: ["tests/globalSetup.ts"],
          include: ["tests/**/*.test.ts"]
        }
      }
    ],
  },
})