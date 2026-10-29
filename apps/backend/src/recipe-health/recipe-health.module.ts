import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecipeHealthController } from './recipe-health.controller';
import { RecipeHealthService } from './recipe-health.service';

@Module({
  imports: [NotificationsModule],
  controllers: [RecipeHealthController],
  providers: [RecipeHealthService],
})
export class RecipeHealthModule {}
