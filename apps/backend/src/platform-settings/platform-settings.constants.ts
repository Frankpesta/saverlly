/**
 * Every runtime-editable platform setting, in one place.
 *
 * `public: true` means the value is served by the unauthenticated `GET /settings/public`, which
 * the kiosk portal reads to render its support link. Only add a key here if it is genuinely fine
 * for anyone to read: this endpoint has no auth by design, so the login page can use it too.
 */
export const PLATFORM_SETTING_DEFINITIONS = {
  supportEmail: {
    public: true,
    /** Falls back to this when nothing has been saved, so a fresh install is not blank. */
    fallbackEnv: 'SUPPORT_EMAIL',
    default: '',
  },
} as const;

export type PlatformSettingKey = keyof typeof PLATFORM_SETTING_DEFINITIONS;

export const PLATFORM_SETTING_KEYS = Object.keys(
  PLATFORM_SETTING_DEFINITIONS,
) as PlatformSettingKey[];

export const PUBLIC_PLATFORM_SETTING_KEYS = PLATFORM_SETTING_KEYS.filter(
  (key) => PLATFORM_SETTING_DEFINITIONS[key].public,
);
