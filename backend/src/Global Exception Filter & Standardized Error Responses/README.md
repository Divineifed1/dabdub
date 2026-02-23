# NestJS Global Exception Handling

A comprehensive global exception handling implementation for NestJS applications that provides consistent, structured JSON error responses.

## Features

- ✅ Standardized error response format across all endpoints
- ✅ Custom exception classes for common scenarios
- ✅ Automatic validation error formatting
- ✅ Request correlation IDs in all error responses
- ✅ Secure error handling (no stack traces in production)
- ✅ Comprehensive logging for unexpected errors
- ✅ Full unit test coverage

## Error Response Format

All errors return the following structure:

```typescript
{
  statusCode: number;
  error: string;        // HTTP status text (e.g., "Bad Request")
  message: string;      // Human-readable message
  details?: unknown;    // Validation errors or additional context
  requestId: string;    // Correlation ID
  timestamp: string;    // ISO 8601
  path: string;         // Request URL
}
```

## Custom Exception Classes

### BusinessException

For business logic violations:

```typescript
throw new BusinessException("Insufficient funds", HttpStatus.BAD_REQUEST, {
  balance: 100,
  required: 150,
});
```

### ResourceNotFoundException

For missing resources:

```typescript
throw new ResourceNotFoundException("User", userId);
// Returns: "User with id '123' was not found"
```

### ConflictException

For resource conflicts:

```typescript
throw new ConflictException("Email already exists");
```

### ForbiddenOperationException

For permission issues:

```typescript
throw new ForbiddenOperationException("Admin access required");
```

## Validation Errors

The global ValidationPipe automatically formats validation errors:

```typescript
// Input: Invalid DTO
{
  "email": "not-an-email",
  "age": -5
}

// Output:
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    {
      "field": "email",
      "value": "not-an-email",
      "constraints": ["email must be a valid email address"]
    },
    {
      "field": "age",
      "value": -5,
      "constraints": ["age must be a positive number"]
    }
  ],
  "requestId": "abc-123",
  "timestamp": "2026-02-23T10:30:00.000Z",
  "path": "/api/users"
}
```

## Installation

1. Install dependencies:

```bash
npm install
```

2. The global exception filter is already registered in `src/main.ts`

## Usage Example

```typescript
import { Controller, Get, Param } from "@nestjs/common";
import { ResourceNotFoundException } from "./common/exceptions";

@Controller("users")
export class UsersController {
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const user = await this.usersService.findById(id);

    if (!user) {
      throw new ResourceNotFoundException("User", id);
    }

    return user;
  }
}
```

## Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:cov
```

## Security

- Stack traces are NEVER exposed in API responses
- Unexpected errors return a generic message to clients
- Full error details are logged server-side for debugging
- Request IDs enable error correlation across logs

## Implementation Details

### Global Exception Filter

Located in `src/common/filters/global-exception.filter.ts`, this filter:

- Catches all exceptions (both HTTP and unexpected)
- Formats responses consistently
- Logs unexpected errors with full stack traces
- Includes request correlation IDs

### Validation Pipeline

Configured in `src/main.ts` with:

- Automatic type transformation
- Unknown property stripping
- Custom validation error formatting
- Implicit type conversion for query parameters

## Test Coverage

The implementation includes comprehensive tests for:

- ✅ HttpException with simple messages
- ✅ HttpException with complex response objects
- ✅ Unknown non-HTTP exceptions (500 errors)
- ✅ Validation pipe error formatting
- ✅ Request ID handling
- ✅ Timestamp formatting
- ✅ HTTP status text formatting
- ✅ All custom exception classes

All acceptance criteria are met and verified through unit tests.
