import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { BusinessException } from '../exceptions';
import { ArgumentsHost } from '@nestjs/common';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GlobalExceptionFilter],
    }).compile();

    filter = module.get<GlobalExceptionFilter>(GlobalExceptionFilter);
  });

  const mockArgumentsHost = (requestId = 'test-request-id', url = '/test-path'): ArgumentsHost => {
    const mockRequest = {
      requestId,
      url,
    };

    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    return {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getArgByIndex: jest.fn(),
      getArgs: jest.fn(),
      getType: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
    } as unknown as ArgumentsHost;
  };

  describe('HttpException with simple message', () => {
    it('should format HttpException with string message correctly', () => {
      const host = mockArgumentsHost();
      const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

      filter.catch(exception, host);

      const response = host.switchToHttp().getResponse();
      expect(response.status).toHaveBeenCalledWith(404);
      expect(response.json).toHaveBeenCalledWith({
        statusCode: 404,
        error: 'Not Found',
        message: 'Not found',
        details: undefined,
        requestId: 'test-request-id',
        timestamp: expect.any(String),
        path: '/test-path',
      });
    });
  });

  describe('HttpException with complex response object', () => {
    it('should extract message and details from object response', () => {
      const host = mockArgumentsHost();
      const exception = new BusinessException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        [
          {
            field: 'email',
            value: 'invalid',
            constraints: ['email must be a valid email'],
          },
        ],
      );

      filter.catch(exception, host);

      const response = host.switchToHttp().getResponse();
      expect(response.status).toHaveBeenCalledWith(400);
      expect(response.json).toHaveBeenCalledWith({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: [
          {
            field: 'email',
            value: 'invalid',
            constraints: ['email must be a valid email'],
          },
        ],
        requestId: 'test-request-id',
        timestamp: expect.any(String),
        path: '/test-path',
      });
    });
  });

  describe('Unknown non-HTTP exception (500 path)', () => {
    it('should handle unexpected errors and return 500', () => {
      const host = mockArgumentsHost();
      const exception = new Error('Unexpected database error');
      const loggerSpy = jest.spyOn(filter['logger'], 'error');

      filter.catch(exception, host);

      const response = host.switchToHttp().getResponse();
      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalledWith({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        details: undefined,
        requestId: 'test-request-id',
        timestamp: expect.any(String),
        path: '/test-path',
      });

      // Verify error was logged with stack trace
      expect(loggerSpy).toHaveBeenCalledWith(
        'Unhandled exception: Unexpected database error',
        expect.any(String), // stack trace
        {
          requestId: 'test-request-id',
          path: '/test-path',
        },
      );
    });

    it('should not expose stack traces in response', () => {
      const host = mockArgumentsHost();
      const exception = new Error('Database connection failed');

      filter.catch(exception, host);

      const response = host.switchToHttp().getResponse();
      const jsonCall = (response.json as jest.Mock).mock.calls[0][0];

      expect(jsonCall).not.toHaveProperty('stack');
      expect(jsonCall.message).toBe('An unexpected error occurred');
    });
  });

  describe('Validation pipe error format', () => {
    it('should format validation errors with details array', () => {
      const host = mockArgumentsHost();
      const validationDetails = [
        {
          field: 'email',
          value: 'not-an-email',
          constraints: ['email must be a valid email address'],
        },
        {
          field: 'age',
          value: -5,
          constraints: ['age must be a positive number'],
        },
      ];

      const exception = new BusinessException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        validationDetails,
      );

      filter.catch(exception, host);

      const response = host.switchToHttp().getResponse();
      expect(response.status).toHaveBeenCalledWith(400);
      expect(response.json).toHaveBeenCalledWith({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: validationDetails,
        requestId: 'test-request-id',
        timestamp: expect.any(String),
        path: '/test-path',
      });
    });
  });

  describe('Request ID handling', () => {
    it('should use "unknown" when requestId is not present', () => {
      const mockRequest = {
        url: '/test',
      };

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      const host = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
        }),
      } as unknown as ArgumentsHost;

      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);
      filter.catch(exception, host);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'unknown',
        }),
      );
    });
  });

  describe('Timestamp format', () => {
    it('should return ISO 8601 formatted timestamp', () => {
      const host = mockArgumentsHost();
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, host);

      const response = host.switchToHttp().getResponse();
      const jsonCall = (response.json as jest.Mock).mock.calls[0][0];

      // Verify ISO 8601 format
      expect(jsonCall.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });
  });

  describe('HTTP status text formatting', () => {
    it('should format status codes correctly', () => {
      const testCases = [
        { status: HttpStatus.BAD_REQUEST, expected: 'Bad Request' },
        { status: HttpStatus.UNAUTHORIZED, expected: 'Unauthorized' },
        { status: HttpStatus.FORBIDDEN, expected: 'Forbidden' },
        { status: HttpStatus.NOT_FOUND, expected: 'Not Found' },
        { status: HttpStatus.CONFLICT, expected: 'Conflict' },
        { status: HttpStatus.INTERNAL_SERVER_ERROR, expected: 'Internal Server Error' },
      ];

      testCases.forEach(({ status, expected }) => {
        const host = mockArgumentsHost();
        const exception = new HttpException('Test', status);

        filter.catch(exception, host);

        const response = host.switchToHttp().getResponse();
        const jsonCall = (response.json as jest.Mock).mock.calls[0][0];

        expect(jsonCall.error).toBe(expected);
      });
    });
  });
});
