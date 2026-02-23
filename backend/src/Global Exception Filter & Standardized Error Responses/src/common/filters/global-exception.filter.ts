import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorResponse } from '../interfaces/error-response.interface';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let message: string;
    let details: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || exceptionResponse;
        details = responseObj.details;
      } else {
        message = exceptionResponse;
      }
    } else {
      // Unexpected errors — 500, log full stack
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred';
      this.logger.error(
        `Unhandled exception: ${(exception as Error).message}`,
        (exception as Error).stack,
        {
          requestId: request['requestId'],
          path: request.url,
        },
      );
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      error: this.getHttpStatusText(statusCode),
      message,
      details,
      requestId: request['requestId'] || 'unknown',
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(errorResponse);
  }

  private getHttpStatusText(statusCode: number): string {
    const statusText = HttpStatus[statusCode];
    if (!statusText) return 'Error';
    
    // Convert INTERNAL_SERVER_ERROR to "Internal Server Error"
    return statusText
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}
