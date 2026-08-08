import { PrismaClient } from "@prisma/client/extension";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["query"],
    // في بريسما 7، بما أن الـ url حُذف من الـ schema، نقوم بتمريره هنا داخل الـ constructor بأمان
    datasource: {
      url: process.env.DATABASE_URL,
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
