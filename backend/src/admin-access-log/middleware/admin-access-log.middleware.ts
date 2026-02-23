import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AdminAccessLogService } from '../services/admin-access-log.service';
import { extractResource } from '../utils/resource-extractor.util';

/**
 * Intercepts every request to /api/v1/** that is authenticated as an admin
 * and writes an AdminAccessLog row **after** the response is sent so it
 * never adds latency to the API.
 *
 * Hooks into the 'finish' event on the Response to capture the final
 * status code and duration.
 */
@Injectable()
export class AdminAccessLogMiddleware implements NestMiddleware {
  constructor(private readonly accessLogService: AdminAccessLogService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startMs = Date.now();

    res.on('finish', () => {
      try {
        const user = (req as any).user;

        // Only log authenticated admin requests
        if (!user?.id || !user?.sessionId) return;

        // Skip health-check / internal endpoints
        if (
          req.path.includes('/health') ||
          req.path.includes('/metrics') ||
          req.path.startsWith('/api/v1/auth/')
        ) {
          return;
        }

        const durationMs = Date.now() - startMs;
        const ip =
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          req.socket?.remoteAddress ||
          '0.0.0.0';

        const correlationId =
          ((req as any).requestId as string) ||
          (req.headers['x-request-id'] as string) ||
          'unknown';

        const { resourceType, resourceId } = extractResource(req.path);

        // Fire-and-forget — never awaited so it can't block the response
        void this.accessLogService.record({
          adminId: user.id,
          sessionId: user.sessionId as string,
          method: req.method,
          path: req.path,
          resourceType,
          resourceId,
          statusCode: res.statusCode,
          durationMs,
          ipAddress: ip,
          correlationId,
        });
      } catch {
        // Swallow all errors — logging must never affect the request lifecycle
      }
    });

    next();
  }
}
