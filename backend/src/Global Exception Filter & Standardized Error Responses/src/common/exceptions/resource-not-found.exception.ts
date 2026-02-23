import { HttpException, HttpStatus } from '@nestjs/common';

export class ResourceNotFoundException extends HttpException {
  constructor(resource: string, identifier?: string | number) {
    super(
      {
        message: `${resource}${identifier ? ` with id '${identifier}'` : ''} was not found`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
