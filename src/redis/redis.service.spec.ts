import { ConfigService } from '@nestjs/config';

// Mock ioredis before importing RedisService so no real TCP connection is made
const mockQuit = jest.fn().mockResolvedValue('OK');
const mockSet = jest.fn().mockResolvedValue('OK');
const mockGet = jest.fn().mockResolvedValue(null);
const mockSetex = jest.fn().mockResolvedValue('OK');
const mockDel = jest.fn().mockResolvedValue(1);
const mockExists = jest.fn().mockResolvedValue(1);
const mockPing = jest.fn().mockResolvedValue('PONG');
const mockOn = jest.fn();

const MockRedis = jest.fn().mockImplementation(() => ({
  quit: mockQuit,
  set: mockSet,
  get: mockGet,
  setex: mockSetex,
  del: mockDel,
  exists: mockExists,
  ping: mockPing,
  on: mockOn,
}));

jest.mock('ioredis', () => ({ default: MockRedis, __esModule: true }));

import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let mockConfig: ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
        };
        if (key in values) return values[key];
        throw new Error(`Config key "${key}" not found`);
      }),
    } as unknown as ConfigService;
    service = new RedisService(mockConfig);
  });

  it('constructs an ioredis client from config', () => {
    expect(service.client).toBeDefined();
  });

  it('calls getOrThrow with REDIS_HOST and REDIS_PORT during construction', () => {
    expect(jest.mocked(mockConfig.getOrThrow)).toHaveBeenCalledWith(
      'REDIS_HOST',
    );
    expect(jest.mocked(mockConfig.getOrThrow)).toHaveBeenCalledWith(
      'REDIS_PORT',
    );
  });

  it('passes correct options to ioredis constructor', () => {
    expect(MockRedis).toHaveBeenCalledWith({
      host: 'localhost',
      port: 6379,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
  });

  it('registers an error event listener on the client', () => {
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('exposes set, get, setex, del, exists, ping as functions', () => {
    expect(typeof service.set).toBe('function');
    expect(typeof service.get).toBe('function');
    expect(typeof service.setex).toBe('function');
    expect(typeof service.del).toBe('function');
    expect(typeof service.exists).toBe('function');
    expect(typeof service.ping).toBe('function');
  });

  it('set() delegates to client.set()', async () => {
    await service.set('key', 'value');
    expect(mockSet).toHaveBeenCalledWith('key', 'value');
  });

  it('get() delegates to client.get()', async () => {
    await service.get('key');
    expect(mockGet).toHaveBeenCalledWith('key');
  });

  it('setex() delegates to client.setex()', async () => {
    await service.setex('key', 60, 'value');
    expect(mockSetex).toHaveBeenCalledWith('key', 60, 'value');
  });

  it('del() delegates to client.del()', async () => {
    await service.del('key');
    expect(mockDel).toHaveBeenCalledWith('key');
  });

  it('exists() returns true when client.exists() returns 1', async () => {
    mockExists.mockResolvedValueOnce(1);
    const result = await service.exists('key');
    expect(result).toBe(true);
    expect(mockExists).toHaveBeenCalledWith('key');
  });

  it('exists() returns false when client.exists() returns 0', async () => {
    mockExists.mockResolvedValueOnce(0);
    const result = await service.exists('key');
    expect(result).toBe(false);
  });

  it('ping() returns true when client.ping() returns PONG', async () => {
    mockPing.mockResolvedValueOnce('PONG');
    const result = await service.ping();
    expect(result).toBe(true);
  });

  it('ping() returns false when client.ping() returns non-PONG', async () => {
    mockPing.mockResolvedValueOnce('NOPONG');
    const result = await service.ping();
    expect(result).toBe(false);
  });

  it('onModuleDestroy() calls client.quit()', async () => {
    await service.onModuleDestroy();
    expect(mockQuit).toHaveBeenCalled();
  });
});
