import {
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class OnboardingGateMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const user = req['user'];

    if (!user || user.onboardingStep !== 'complete') {
      return res.status(403).json({
        message: 'Complete your account setup first',
        currentStep: user?.onboardingStep,
      });
    }

    next();
  }
}