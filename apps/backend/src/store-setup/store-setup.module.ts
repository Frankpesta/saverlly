import { Module } from '@nestjs/common';
import {
  StoreSetupActivationController,
  StoreSetupAdminController,
  StoreSetupSessionController,
} from './store-setup.controller';
import { StoreSetupService } from './store-setup.service';
import { SetupSessionGuard } from './setup-session.guard';

@Module({
  providers: [StoreSetupService, SetupSessionGuard],
  controllers: [
    StoreSetupAdminController,
    StoreSetupActivationController,
    StoreSetupSessionController,
  ],
})
export class StoreSetupModule {}
