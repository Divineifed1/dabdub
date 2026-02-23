import { HttpException, HttpStatus } from '@nestjs/common';

export class ForbiddenOperationException extends HttpException {
  constructor(message = 'You do not have permission to perform this action') {
    super({ message }, HttpStatus.FORBIDDEN);
  }
}
