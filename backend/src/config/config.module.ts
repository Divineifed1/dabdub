import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validationSchema } from './validation.schema';
import { appConfig } from './config.app';
import { databaseConfig } from './config.database';
import { blockchainConfig } from './config.blockchain';
import { apiConfig } from './config.api';
import { GlobalConfigService } from './global-config.service';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [appConfig, databaseConfig, blockchainConfig, apiConfig],
      validationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
  ],
  providers: [GlobalConfigService],
  exports: [GlobalConfigService, NestConfigModule],
})
export class GlobalConfigModule {}
