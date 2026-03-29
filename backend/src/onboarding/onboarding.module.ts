import {
  Module,
  MiddlewareConsumer,
  NestModule,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingGateMiddleware } from './onboarding.middleware';

import { User } from '@/users/entities/user.entity';
import { BlockchainModule } from '@/blockchain/blockchain.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    BlockchainModule,
  ],
  providers: [OnboardingService],
  controllers: [OnboardingController],
})
export class OnboardingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(OnboardingGateMiddleware)
      .forRoutes(
        'transfers',
        'send',
        'withdrawals',
        'paylinks',
      );
  }
}