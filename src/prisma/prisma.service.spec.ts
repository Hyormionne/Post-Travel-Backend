import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const config = {
    getOrThrow: jest.fn().mockReturnValue('postgresql://test:test@localhost:5432/test'),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads DATABASE_URL from ConfigService during construction', () => {
    new PrismaService(config);
    expect(config.getOrThrow).toHaveBeenCalledWith('DATABASE_URL');
  });

  it('calls $connect on onModuleInit', async () => {
    const service = new PrismaService(config);
    await service.onModuleInit();
    expect(service.$connect).toHaveBeenCalledTimes(1);
  });

  it('calls $disconnect on onModuleDestroy', async () => {
    const service = new PrismaService(config);
    await service.onModuleDestroy();
    expect(service.$disconnect).toHaveBeenCalledTimes(1);
  });
});
