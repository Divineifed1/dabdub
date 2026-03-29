import {
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { OnboardingService } from './onboarding.service';
import { OnboardingStep } from './enums/onboarding-step.enum';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  @UseGuards() // plug in your AuthGuard
  getStatus(@Req() req) {
    return this.onboardingService.getStatus(req.user.id);
  }

  @Post('wallet')
  @UseGuards()
  provisionWallet(@Req() req) {
    return this.onboardingService.completeStep(
      req.user.id,
      OnboardingStep.WALLET,
    );
  }
}