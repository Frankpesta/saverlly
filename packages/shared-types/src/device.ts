export interface RegisterDevicePayload {
  setupCode: string;
  label?: string;
  hostname?: string;
}

export interface RegisterDeviceResponse {
  deviceId: string;
  label: string;
  token: string;
}
