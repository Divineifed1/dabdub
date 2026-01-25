export interface AppConfig {
  nodeEnv: string;
  port: number;
  debug: boolean;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  poolSize: number;
  synchronize: boolean;
  logging: boolean;
}

export interface BlockchainConfig {
  rpcEndpoint: string;
  settlementPrivateKey: string;
  chainId?: number;
}

export interface ApiConfig {
  jwtSecret: string;
  jwtExpiry?: string;
}

export interface ValidationConfig {
  required: string[];
  optional: string[];
}

export interface Config {
  app: AppConfig;
  database: DatabaseConfig;
  blockchain: BlockchainConfig;
  api: ApiConfig;
}
