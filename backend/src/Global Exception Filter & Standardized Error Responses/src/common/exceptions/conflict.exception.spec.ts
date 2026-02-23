import { HttpStatus } from '@nestjs/common';
import { ConflictException } from './conflict.exception';

describe('ConflictException', () => {
  it('should create exception with conflict message', () => {
    const exception = new ConflictException('Email already exists');

    expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(exception.getResponse()).toEqual({
      message: 'Email already exists',
    });
  });

  it('should create exception with custom conflict message', () => {
    const exception = new ConflictException(
      'Resource version mismatch - please refresh and try again',
    );

    expect(exception.getResponse()).toEqual({
      message: 'Resource version mismatch - please refresh and try again',
    });
  });
});
