import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = new URL(configService.getOrThrow<string>('REDIS_URL'));
        // Path segment (if present) selects the Redis logical DB, e.g. "/1" — used to keep
        // test-run queues fully isolated from dev's on the same Redis instance.
        const dbIndex = redisUrl.pathname.replace(/^\//, '');
        return {
          // Plain connection options (not a manually-created ioredis instance) so BullMQ owns
          // the connection's lifecycle itself and closes it cleanly on Nest app shutdown —
          // a self-managed instance here isn't tracked by Nest's shutdown hooks and leaks.
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            password: redisUrl.password || undefined,
            db: dbIndex ? Number(dbIndex) : undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class BullmqConfigModule {}
