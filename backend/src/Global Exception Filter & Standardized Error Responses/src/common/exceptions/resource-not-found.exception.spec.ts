import { HttpStatus } from '@nestjs/common';
import { ResourceNotFoundException } from './resource-not-found.exception';

describe('ResourceNotFoundException', () => {
  it('should create exception with resource name only', () => {
    const exception = new ResourceNotFoundException('User');

    expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(exception.getResponse()).toEqual({
      message: 'User was not found',
    });
  });

  it('should create exception with resource name and string identifier', () => {
    const exception = new ResourceNotFoundException('User', 'john-doe');

    expect(exception.getResponse()).toEqual({
      message: "User with id 'john-doe' was not found",
    });
  });

  it('should create exception with resource name and numeric identifier', () => {
    const exception = new ResourceNotFoundException('Product', 12345);

    expect(exception.getResponse()).toEqual({
      message: "Product with id '12345' was not found",
    });
  });
});
