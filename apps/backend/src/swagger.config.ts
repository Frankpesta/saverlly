import { DocumentBuilder } from '@nestjs/swagger';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Saverlly API')
    .setDescription(
      'Multi-tenant SaaS platform for internet kiosk businesses, admin console, kiosk portal, ' +
        'and machine (Chrome extension / desktop agent) endpoints.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'jwt',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'device-token',
        description: 'Opaque device token issued at /devices/register. Used by machine clients only.',
      },
      'device-token',
    )
    .build();
}
