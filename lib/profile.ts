import { z } from 'zod';

// Editable account profile fields (the Profile page + PATCH /api/profile).
// Client-safe: no server imports. plan and whatsapp_e164 are deliberately NOT
// editable here — billing and the WhatsApp LINK flow own them.

export const PROFILE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी · Hindi' },
  { code: 'ta', label: 'தமிழ் · Tamil' },
  { code: 'te', label: 'తెలుగు · Telugu' },
  { code: 'mr', label: 'मराठी · Marathi' },
  { code: 'bn', label: 'বাংলা · Bengali' },
  { code: 'kn', label: 'ಕನ್ನಡ · Kannada' },
  { code: 'gu', label: 'ગુજરાતી · Gujarati' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ · Punjabi' },
  { code: 'ml', label: 'മലയാളം · Malayalam' },
] as const;

const LANGUAGE_CODES = PROFILE_LANGUAGES.map((l) => l.code) as [string, ...string[]];

/** Trim, and treat an empty string as "clear this field" (null). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v));

export const profileUpdateSchema = z
  .object({
    full_name: optionalText(80),
    headline: optionalText(160),
    handle: optionalText(40).refine((v) => v === null || /^@?[A-Za-z0-9._]+$/.test(v), {
      message: 'Handle can only use letters, numbers, dots and underscores',
    }),
    default_language: z.union([z.enum(LANGUAGE_CODES), z.literal('').transform(() => null)]),
    hindi_output: z.boolean(),
  })
  .partial()
  .strict();

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
