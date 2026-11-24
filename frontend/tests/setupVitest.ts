import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import { TEST_API_URL, TEST_USER_ID } from "./env";

// src/api/client.ts reads these at import time; setup files run before each test file's imports.
vi.stubEnv("VITE_API_URL", TEST_API_URL);
vi.stubEnv("VITE_DEV_USER_ID", String(TEST_USER_ID));
