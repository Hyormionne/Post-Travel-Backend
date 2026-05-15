import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const LOCAL_FRONTEND_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

type CorsEnv = Partial<
  Record<'NODE_ENV' | 'CORS_ORIGINS' | 'FRONTEND_URL', string>
>;

export function parseCorsOrigins(value?: string): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function buildCorsOptions(env: CorsEnv = process.env): CorsOptions {
  const configuredOrigins = parseCorsOrigins(
    env.CORS_ORIGINS ?? env.FRONTEND_URL,
  );
  const origins =
    configuredOrigins.length > 0 || env.NODE_ENV === 'production'
      ? configuredOrigins
      : LOCAL_FRONTEND_ORIGINS;

  return {
    origin: origins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    optionsSuccessStatus: 204,
  };
}
