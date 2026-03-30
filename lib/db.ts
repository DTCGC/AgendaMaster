import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const dbUrl = process.env.DATABASE_URL?.replace('file:', '') || './dev.db'
// The adapter requires a raw SQLite file path to construct the connection internally 
// Note: This relies on Node.js runtime. 
const adapter = typeof window === 'undefined' ? new PrismaBetterSqlite3({ url: dbUrl }) : undefined

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const db = globalForPrisma.prisma || new PrismaClient(adapter ? { adapter } : undefined)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
