export const CLOUD_HEARTBEAT_INTERVAL_MS = 60_000;

export const CLOUD_DEVICE_FRESHNESS_MS = 3 * 60_000;

export const RELAY_RENEWAL_WINDOW_MS = 2 * 60_000;

export const CLOUD_ACCESS_TOKEN_SECRET_REF = 'device-network.cloud-access-token.v1';

export const DEVICE_IDENTITY_SECRET_REF = 'device-network.identity.v1';

export const MAX_PAIRING_QR_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_PAIRING_QR_SOURCE_DIMENSION = 8192;
export const MAX_PAIRING_QR_SOURCE_PIXELS = 16 * 1024 * 1024;
export const MAX_PAIRING_QR_IMAGE_DIMENSION = 2048;
export const MAX_PAIRING_QR_IMAGE_PIXELS = 4 * 1024 * 1024;
export const MAX_PAIRING_QR_CAMERA_DIMENSION = 1280;
export const MAX_PAIRING_QR_CAMERA_PIXELS = 1_500_000;
export const PAIRING_QR_CAMERA_INTERVAL_MS = 250;
