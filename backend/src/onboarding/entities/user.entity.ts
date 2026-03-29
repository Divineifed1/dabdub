import { OnboardingStep } from '@/onboarding/enums/onboarding-step.enum';

@Column({
  type: 'enum',
  enum: OnboardingStep,
  default: OnboardingStep.EMAIL_VERIFY,
})
onboardingStep: OnboardingStep;