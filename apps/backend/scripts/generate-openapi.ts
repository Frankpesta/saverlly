import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { buildSwaggerConfig } from '../src/swagger.config';

const OUTPUT_DIR = join(__dirname, '..', '..', '..', 'docs', 'api');

// Document-only build — never calls app.listen(), just extracts the OpenAPI spec
// so it can be exported to markdown as part of the docs pipeline.
async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, 'openapi.json'), JSON.stringify(document, null, 2));
  await app.close();
}

main();
