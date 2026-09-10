import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationEmployeeDto } from './dto/create-location-employee.dto';
import { UpdateLocationEmployeeDto } from './dto/update-location-employee.dto';

@Injectable()
export class LocationEmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertLocationExists(locationId: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Location not found');
    }
  }

  async create(locationId: string, dto: CreateLocationEmployeeDto) {
    await this.assertLocationExists(locationId);
    return this.prisma.locationEmployee.create({
      data: {
        locationId,
        name: dto.name,
        title: dto.title,
        phone: dto.phone,
        email: dto.email,
      },
    });
  }

  async findAll(locationId: string) {
    await this.assertLocationExists(locationId);
    return this.prisma.locationEmployee.findMany({
      where: { locationId },
      orderBy: { name: 'asc' },
    });
  }

  /** Every employee across every location under one kiosk, for the dedicated portal Employees
   *  page -- that page isn't scoped to a single location, so it needs the whole roster in one
   *  call rather than one request per location. Each row carries its location's name, since the
   *  page has to say which site an employee is at. */
  findAllForKiosk(kioskId: string) {
    return this.prisma.locationEmployee.findMany({
      where: { location: { kioskId } },
      include: { location: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /** Scoped to `locationId` as well as the employee's own id, rather than a bare
   *  `findUnique({ id })`, so a manager scoped to one location can't update or delete an
   *  employee at another by guessing its id -- TenantScopeGuard checks the *location*'s tenant,
   *  not the employee row, so this is the actual boundary. */
  private async findOneOrThrow(locationId: string, employeeId: string) {
    const employee = await this.prisma.locationEmployee.findFirst({
      where: { id: employeeId, locationId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  async update(locationId: string, employeeId: string, dto: UpdateLocationEmployeeDto) {
    await this.findOneOrThrow(locationId, employeeId);
    return this.prisma.locationEmployee.update({
      where: { id: employeeId },
      data: dto,
    });
  }

  async remove(locationId: string, employeeId: string) {
    await this.findOneOrThrow(locationId, employeeId);
    await this.prisma.locationEmployee.delete({ where: { id: employeeId } });
  }
}
