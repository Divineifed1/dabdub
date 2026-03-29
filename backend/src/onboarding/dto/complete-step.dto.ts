import { IsEnum } from 'class-validator';
import { OnboardingStep } from '../enums/onboarding-step.enum';

export class CompleteStepDto {
  @IsEnum(OnboardingStep)
  step: OnboardingStep;
}