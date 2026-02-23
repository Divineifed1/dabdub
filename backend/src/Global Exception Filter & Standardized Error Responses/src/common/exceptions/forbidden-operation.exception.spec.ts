import { HttpStatus } from '@nestjs/common';
import { ForbiddenOperationException } from './forbidden-operation.exception';

describe('ForbiddenOperationException', () => {
  it('should create exception with default message', () => {
    const exception = new ForbiddenOperationException();

    expect(exception.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(exception.getResponse()).toEqual({
      message: 'You do not have permission to perform this action',
    });
  });

  it('should create exception with custom message', () => {
    const exception = new ForbiddenOperationException(
      'Admin access required for this operation',
    );

    expect(exception.getResponse()).toEqual({
      message: 'Admin access required for this operation',
    });
  });
});
