import * as Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES: Joi.string().default('1h'),
  JWT_REFRESH_EXPIRES: Joi.string().default('14d'),
  GOOGLE_CLIENT_ID: Joi.string().required(),
  FRONTEND_URL: Joi.string().uri().optional(),
  CORS_ORIGINS: Joi.string()
    .custom((value: string, helpers) => {
      for (const origin of value.split(',').map((item) => item.trim())) {
        if (!origin) continue;
        const { error } = Joi.string().uri().validate(origin);
        if (error) return helpers.error('string.uri');
      }
      return value;
    }, 'comma-separated origin list')
    .optional(),
  AWS_REGION: Joi.string().default('ap-northeast-2'),
  S3_BUCKET: Joi.string().required(),
  S3_PRESIGNED_EXPIRES: Joi.number().default(300),
  S3_MAX_PHOTO_BYTES: Joi.number().default(20971520),
  S3_MAX_THUMB_BYTES: Joi.number().default(512000),
  S3_ENDPOINT: Joi.string().uri().optional(),
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  // GPU Jobs
  GPU_SERVER_URL: Joi.string().uri().default('http://localhost:8001'),
  GPU_INTERNAL_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().min(1).default('dev-internal-token'),
  }),
  JOB_STALL_TIMEOUT_MS: Joi.number().default(300_000),
  CALLBACK_BASE_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().uri().default('http://localhost:3000'),
  }),
}).custom(
  (
    value: { NODE_ENV?: string; CORS_ORIGINS?: string; FRONTEND_URL?: string },
    helpers,
  ) => {
    if (
      value.NODE_ENV === 'production' &&
      !value.CORS_ORIGINS &&
      !value.FRONTEND_URL
    ) {
      return helpers.message({
        custom:
          'CORS_ORIGINS or FRONTEND_URL is required when NODE_ENV is production',
      });
    }

    return value;
  },
);
