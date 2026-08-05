import { KioskStatus } from './enums';

export interface DeviceStatusResponse {
  kioskStatus: KioskStatus;
  deviceActive: boolean;
}
