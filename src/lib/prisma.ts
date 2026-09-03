// src/lib/prisma.ts
// Singleton PrismaClient for Next.js App Router.
// In development, hot-reload creates new module instances on every file change.
// The global guard below ensures we reuse a single connection pool across reloads.

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
