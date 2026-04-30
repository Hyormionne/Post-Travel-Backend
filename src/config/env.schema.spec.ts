import { envSchema } from './env.schema';

describe('envSchema', () => {
  it('accepts a fully specified valid env', () => {
    const { error, value } = envSchema.validate({
      NODE_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      JWT_ACCESS_EXPIRES: '1h',
      JWT_REFRESH_EXPIRES: '14d',
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/google/callback',
      FRONTEND_URL: 'http://localhost:5173',
      S3_BUCKET: 'test-bucket',
    }) as { error: Error | undefined; value: { PORT: number } };
    expect(error).toBeUndefined();
    expect(value.PORT).toBe(3000);
  });

  it('rejects when DATABASE_URL is missing', () => {
    const { error } = envSchema.validate(
      {
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/google/callback',
        FRONTEND_URL: 'http://localhost:5173',
      },
      { abortEarly: false },
    );
    expect(error?.message).toMatch(/DATABASE_URL/);
  });

  it('rejects when JWT_ACCESS_SECRET is shorter than 32 chars', () => {
    const { error } = envSchema.validate(
      {
        DATABASE_URL: 'postgresql://u:p@h/db',
        REDIS_HOST: 'h',
        REDIS_PORT: '6379',
        JWT_ACCESS_SECRET: 'short',
        JWT_REFRESH_SECRET: 'b'.repeat(32),
        GOOGLE_CLIENT_ID: 'x',
        GOOGLE_CLIENT_SECRET: 'y',
        GOOGLE_CALLBACK_URL: 'http://localhost:3000/cb',
        FRONTEND_URL: 'http://localhost:5173',
      },
      { abortEarly: false },
    );
    expect(error?.message).toMatch(/JWT_ACCESS_SECRET/);
  });
});
