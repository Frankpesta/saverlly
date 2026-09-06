import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { initSentry } from './common/sentry';
import { buildSwaggerConfig } from './swagger.config';

async function bootstrap() {
  // Before NestFactory.create, not after: a startup-time crash (a bad env var, a DI wiring
  // error) should be reportable too, not just request-time errors.
  initSentry();

  // rawBody: true preserves the raw request buffer (req.rawBody) alongside the normal
  // parsed JSON body. Needed for Stripe webhook signature verification, which must run
  // against the exact bytes Stripe sent, not a re-serialized copy.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
