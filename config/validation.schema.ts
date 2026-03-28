import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .required(),

  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().uri().required(),

  REDIS_URL: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  STELLAR_NETWORK: Joi.string()
    .valid('testnet', 'public')
    .required(),

  STELLAR_HORIZON_URL: Joi.string().uri().required(),

  STELLAR_MASTER_SECRET: Joi.string().required(),

  STELLAR_WALLET_ENCRYPTION_KEY: Joi.string()
    .length(32)
    .required(),

  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(10),
});