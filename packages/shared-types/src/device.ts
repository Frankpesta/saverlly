export interface RegisterDevicePayload {
  setupCode: string;
  label?: string;
  hostname?: string;
  deviceIdentifier?: string;
  osVersion?: string;
}

export interface RegisterDeviceResponse {
  deviceId: string;
  label: string;
  token: string;
}
