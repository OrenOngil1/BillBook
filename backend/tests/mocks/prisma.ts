import { PrismaClient } from "../../src/generated/prisma/client.js";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";

export type MockPrismaClient = DeepMockProxy<PrismaClient>;
export const prismaMock = mockDeep<PrismaClient>();