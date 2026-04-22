// Manual mock for generated/prisma/client — used by Jest unit tests
// to avoid ESM import.meta.url incompatibility in the generated Prisma 7 client.

export class PrismaClient {
  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);
}
