// Shared bcrypt cost factor for every password-hashing call site in the backend
// (kiosk-owner/location-manager creation, auth password changes) — kept in one
// place so the value can't silently drift between call sites.
export const PASSWORD_BCRYPT_ROUNDS = 12;
