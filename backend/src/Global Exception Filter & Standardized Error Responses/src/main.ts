import { NestFactory } from '@nestjs/core';
import { ValidationPipe, HttpStatus } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { BusinessException } from './common/exceptions';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe with custom exception factory
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // throw on unknown properties
      transform: true, // transform to DTO class instances
      transformOptions: {
        enableImplicitConversion: true, // auto-convert query param strings to numbers/booleans
      },
      exceptionFactory: (errors) => {
        const details = errors.map((error) => ({
          field: error.property,
          value: error.value,
          constraints: Object.values(error.constraints || {}),
        }));
        return new BusinessException(
          'Validation failed',
          HttpStatus.BAD_REQUEST,
          details,
        );
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(3000);
}
bootstrap();
