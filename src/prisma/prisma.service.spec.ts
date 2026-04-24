import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const config = {
    getOrThrow: jest
      .fn()
      .mockReturnValue('postgresql://test:test@localhost:5432/test'),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads DATABASE_URL from ConfigService during construction', () => {
    new PrismaService(config);
    expect(jest.mocked(config.getOrThrow)).toHaveBeenCalledWith('DATABASE_URL');
  });

  it('calls $connect on onModuleInit', async () => {
    const service = new PrismaService(config);
    const spy = jest.spyOn(service, '$connect').mockResolvedValue();
    await service.onModuleInit();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('calls $disconnect on onModuleDestroy', async () => {
    const service = new PrismaService(config);
    const spy = jest.spyOn(service, '$disconnect').mockResolvedValue();
    await service.onModuleDestroy();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
