import { OnboardingStep } from '../enums/onboarding-step.enum';

export const ONBOARDING_FLOW: OnboardingStep[] = [
  OnboardingStep.EMAIL_VERIFY,
  OnboardingStep.USERNAME,
  OnboardingStep.PIN,
  OnboardingStep.WALLET,
  OnboardingStep.COMPLETE,
];