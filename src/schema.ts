// Copied verbatim from byplay-previs-app/src/production/schema.ts by `npm run sync`.
// Do not edit here: change it in the app repo and re-run the sync.

// Production profile format, v1. Spec: docs/production-profile.md.
//
// This file depends on zod only — the web profile editor copies it verbatim,
// so keep React Native and app imports out of it.
import { z } from 'zod';

export const PROFILE_FORMAT = 'byplay-production';
export const PROFILE_VERSION = 1;
export const PROFILE_FILE_EXTENSION = 'bpprod';

// Tokens every template can use. Custom slate field keys share the namespace.
export const BUILT_IN_TOKENS = [
  'project',
  'title',
  'day',
  'date',
  'time',
  'roll',
  'scene',
  'take',
  'camera',
  'director',
  'dp',
  'body',
  'focal',
  'seq',
  'device',
  'mode',
] as const;

export type BuiltInToken = (typeof BUILT_IN_TOKENS)[number];

const TemplateSchema = z.string().max(300);

export const NamingTemplateSchema = z.object({
  // '/'-separated folder levels, relative to the app's Documents folder.
  folder: TemplateSchema,
  // File name without extension. For videos it names the recording folder.
  file: TemplateSchema.min(1),
});

export const SlateFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9]{0,23}$/),
  label: z.string().min(1).max(40),
  // When present the field is a pick list, otherwise free text.
  options: z.array(z.string().min(1).max(40)).min(1).max(20).optional(),
});

export const SlateSchema = z.object({
  // Camera letters to pick from ("A", "B", "C"). Empty means free text.
  cameraOptions: z.array(z.string().min(1).max(12)).max(12).default([]),
  customFields: z
    .array(SlateFieldSchema)
    .max(8)
    .default([])
    .refine(
      (fields) =>
        new Set(fields.map((f) => f.key)).size === fields.length &&
        fields.every(
          (f) => !(BUILT_IN_TOKENS as readonly string[]).includes(f.key),
        ),
      { message: 'Custom field keys must be unique and not a built-in token' },
    ),
  director: z.string().max(60).default(''),
  dp: z.string().max(60).default(''),
  snapshotsAdvanceTake: z.boolean().default(true),
  clearNotesAfterCapture: z.boolean().default(true),
});

export const CaptureSchema = z.object({
  saveToFiles: z.boolean().default(true),
  saveToPhotos: z.boolean().default(true),
  shotLog: z.boolean().default(true),
});

const SensorSizeMm = z.tuple([
  z.number().positive().max(100),
  z.number().positive().max(100),
]);

const AspectRatio = z.tuple([
  z.number().positive().max(100),
  z.number().positive().max(100),
]);

export const ProfileCameraSchema = z.object({
  name: z.string().min(1).max(60),
  manufacturer: z.string().max(60).default(''),
  model: z.string().max(60).default(''),
  sensors: z
    .array(
      z.object({
        mode: z.string().min(1).max(60).optional(),
        sensor: SensorSizeMm,
      }),
    )
    .min(1)
    .max(20)
    // defaults.sensorMode picks a sensor by mode.
    .refine(
      (sensors) =>
        new Set(sensors.map((s) => s.mode ?? '')).size === sensors.length,
      { message: 'Sensor modes must be unique within a camera' },
    ),
});

export const ProfileLensSchema = z.object({
  family: z.string().min(1).max(60),
  name: z.string().min(1).max(60),
  focalLengths: z.array(z.number().positive().max(2000)).min(1).max(40),
  anamorphicSqueeze: z.number().min(1).max(10).default(1),
});

export const ProfileOpticsSchema = z.object({
  // Defaults refer to cameras by name and lenses by family + name.
  cameras: z
    .array(ProfileCameraSchema)
    .max(20)
    .default([])
    .refine(
      (cameras) => new Set(cameras.map((c) => c.name)).size === cameras.length,
      { message: 'Camera names must be unique' },
    ),
  lenses: z
    .array(ProfileLensSchema)
    .max(20)
    .default([])
    .refine(
      (lenses) =>
        new Set(lenses.map((l) => `${l.family}\u0000${l.name}`)).size ===
        lenses.length,
      { message: 'Lens family and name pairs must be unique' },
    ),
  mattes: z.array(AspectRatio).max(10).default([]),
  defaults: z
    .object({
      camera: z.string().optional(), // ProfileCamera.name
      sensorMode: z.string().optional(), // a mode of that camera
      lens: z.object({ family: z.string(), name: z.string() }).optional(), // a ProfileLens
      focalLength: z.number().positive().optional(),
      matte: AspectRatio.optional(),
    })
    .default({}),
});

export const ProductionProfileSchema = z.object({
  format: z.literal(PROFILE_FORMAT),
  version: z.literal(PROFILE_VERSION),
  id: z.string().min(8).max(64),
  revision: z.number().int().min(1),
  updatedAt: z.string().max(40),
  project: z.string().trim().min(1).max(24),
  title: z.string().max(80).default(''),
  naming: z.object({
    snapshot: NamingTemplateSchema,
    video: NamingTemplateSchema,
  }),
  slate: SlateSchema.default(SlateSchema.parse({})),
  capture: CaptureSchema.default(CaptureSchema.parse({})),
  optics: ProfileOpticsSchema.optional(),
});

export type NamingTemplate = z.infer<typeof NamingTemplateSchema>;
export type SlateField = z.infer<typeof SlateFieldSchema>;
export type ProfileCamera = z.infer<typeof ProfileCameraSchema>;
export type ProfileLens = z.infer<typeof ProfileLensSchema>;
export type ProfileOptics = z.infer<typeof ProfileOpticsSchema>;
export type ProductionProfile = z.infer<typeof ProductionProfileSchema>;

export const DEFAULT_NAMING = {
  snapshot: {
    folder: '{project}/Day_{day:02}',
    file: '{project}_Day-{day:02}_{date}_{time}_R{roll:02}_{scene}_Tk{take}',
  },
  video: {
    folder: '{project}/Day_{day:02}',
    file: '{project}_Day-{day:02}_R{roll:02}_{scene}_Tk{take}_{camera}',
  },
} satisfies ProductionProfile['naming'];

export function parseProductionProfile(input: unknown) {
  return ProductionProfileSchema.safeParse(input);
}
