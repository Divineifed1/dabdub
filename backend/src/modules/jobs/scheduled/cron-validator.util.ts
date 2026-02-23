import { BadRequestException } from '@nestjs/common';
import { CronTime } from 'cron';

/**
 * Validates a cron expression by attempting to parse it with the cron library.
 * Throws BadRequestException if the expression is invalid.
 */
export function validateCronExpression(expr: string): void {
    try {
        // CronTime will throw if the expression is invalid
        new CronTime(expr);
    } catch {
        throw new BadRequestException(
            `Invalid cron expression: "${expr}". Expected a valid cron string (e.g. "0 2 * * *").`,
        );
    }
}

/**
 * Computes the next execution time for a given cron expression.
 * Returns null if the expression cannot be parsed.
 */
export function getNextRunDate(expr: string): Date | null {
    try {
        const cronTime = new CronTime(expr);
        return cronTime.sendAt().toJSDate();
    } catch {
        return null;
    }
}
