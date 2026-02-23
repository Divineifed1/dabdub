import { HttpStatus } from '@nestjs/common';
import { BusinessException } from './business.exception';

describe('BusinessException', () => {
  it('should create exception with default status code', () => {
    const exception = new BusinessException('Business rule violated');

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.getResponse()).toEqual({
      message: 'Business rule violated',
      details: undefined,
    });
  });

  it('should create exception with custom status code', () => {
    const exception = new BusinessException(
      'Unprocessable entity',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );

    expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('should include details when provided', () => {
    const details = { field: 'amount', reason: 'insufficient funds' };
    const exception = new BusinessException(
      'Transaction failed',
      HttpStatus.BAD_REQUEST,
      details,
    );

    expect(exception.getResponse()).toEqual({
      message: 'Transaction failed',
      details,
    });
  });
});
