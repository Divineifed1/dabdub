import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '@/users/entities/user.entity';
import { OnboardingStep } from './enums/onboarding-step.enum';
import { ONBOARDING_FLOW } from './constants/onboarding-flow.constant';
import { BlockchainWalletService } from '@/blockchain/services/blockchain-wallet.service';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly blockchainWalletService: BlockchainWalletService,
  ) {}

  async getStatus(userId: string) {
    const user = await this.userRepo.findOneBy({ id: userId });

    const currentStep = user.onboardingStep;

    const completedSteps = ONBOARDING_FLOW.slice(
      0,
      ONBOARDING_FLOW.indexOf(currentStep),
    );

    return {
      currentStep,
      completedSteps,
      isComplete: currentStep === OnboardingStep.COMPLETE,
    };
  }

  async completeStep(userId: string, step: OnboardingStep) {
    const user = await this.userRepo.findOneBy({ id: userId });

    const currentIndex = ONBOARDING_FLOW.indexOf(user.onboardingStep);
    const expectedStep = ONBOARDING_FLOW[currentIndex];

    if (step !== expectedStep) {
      throw new BadRequestException(
        `Invalid step. Expected: ${expectedStep}`,
      );
    }

    await this.validateStep(user, step);

    // Wallet step (idempotent)
    if (step === OnboardingStep.WALLET) {
      const hasWallet = await this.blockchainWalletService.hasWallet(user.id);

      if (!hasWallet) {
        await this.blockchainWalletService.provision(user.id);
      }
    }

    const nextStep = ONBOARDING_FLOW[currentIndex + 1];

    user.onboardingStep = nextStep;
    await this.userRepo.save(user);

    return this.getStatus(userId);
  }

  private async validateStep(user: User, step: OnboardingStep) {
    switch (step) {
      case OnboardingStep.EMAIL_VERIFY:
        if (!user.isEmailVerified) {
          throw new BadRequestException('Email not verified');
        }
        break;

      case OnboardingStep.USERNAME:
        if (!user.username) {
          throw new BadRequestException('Username not set');
        }
        break;

      case OnboardingStep.PIN:
        if (!user.pinHash) {
          throw new BadRequestException('PIN not set');
        }
        break;

      case OnboardingStep.WALLET:
        break;
    }
  }
}