import { buildCorsOptions, parseCorsOrigins } from './cors.config';
import { envSchema } from './env.schema';

describe('cors config', () => {
  it('parses comma-separated origins and removes trailing slashes', () => {
    expect(
      parseCorsOrigins(
        'https://app.example.com/, http://localhost:5173, , https://admin.example.com',
      ),
    ).toEqual([
      'https://app.example.com',
      'http://localhost:5173',
      'https://admin.example.com',
    ]);
  });

  it('allows configured frontend origins with credentials enabled', () => {
    const options = buildCorsOptions({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
    });

    expect(options.credentials).toBe(true);
    expect(options.origin).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('falls back to FRONTEND_URL when CORS_ORIGINS is not set', () => {
    const options = buildCorsOptions({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://app.example.com/',
    });

    expect(options.origin).toEqual(['https://app.example.com']);
  });

  it('requires a frontend origin in production', () => {
    const { error } = envSchema.validate(
      {
        NODE_ENV: 'production',
        PORT: '3000',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
        GOOGLE_CLIENT_ID: 'client-id',
        S3_BUCKET: 'test-bucket',
        GPU_INTERNAL_TOKEN: 'c'.repeat(32),
        CALLBACK_BASE_URL: 'https://api.example.com',
      },
      { abortEarly: false },
    );

    expect(error?.message).toMatch(/CORS_ORIGINS|FRONTEND_URL/);
  });
});
