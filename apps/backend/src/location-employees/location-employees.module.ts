import { Module } from '@nestjs/common';
import { LocationEmployeesController } from './location-employees.controller';
import { MyLocationEmployeesController } from './my-location-employees.controller';
import { LocationEmployeesService } from './location-employees.service';

@Module({
  controllers: [LocationEmployeesController, MyLocationEmployeesController],
  providers: [LocationEmployeesService],
})
export class LocationEmployeesModule {}
