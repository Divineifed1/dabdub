import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessException extends HttpException {
  constructor(
    message: string,
    statusCode = HttpStatus.BAD_REQUEST,
    details?: unknown,
  ) {
    super({ message, details }, statusCode);
  }
}
