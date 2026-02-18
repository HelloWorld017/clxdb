import { z } from 'zod';
import { BLOB_MAX_FILENAME_SIZE } from '@/constants';

export const shardDocInfoSchema = z.object({
  id: z.string(),
  at: z.number(),
  seq: z.number(),
  del: z.boolean(),
  offset: z.number(),
  len: z.number(),
});

export const shardHeaderSchema = z.object({
  version: z.number(),
  docs: z.array(shardDocInfoSchema),
});

export const shardFileInfoSchema = z.object({
  filename: z.string(),
  level: z.number(),
  range: z.object({
    min: z.number(),
    max: z.number(),
  }),
});

export const manifestDeviceKeyInfoSchema = z.object({
  key: z.string(),
  deviceName: z.string(),
  lastUsedAt: z.number(),
});

export const manifestDeviceKeyRegistrySchema = z.record(z.string(), manifestDeviceKeyInfoSchema);

export const manifestSchema = z.object({
  version: z.number(),
  uuid: z.string(),
  lastSequence: z.number(),
  shardFiles: z.array(shardFileInfoSchema),
  crypto: z
    .object({
      nonce: z.string(),
      timestamp: z.number(),
      masterKey: z.string(),
      masterKeySalt: z.string(),
      deviceKey: manifestDeviceKeyRegistrySchema,
      signature: z.string(),
    })
    .optional(),
});

export const cachedShardHeaderSchema = z.object({
  filename: z.string(),
  header: shardHeaderSchema,
  cachedAt: z.number(),
});

export const shardHeaderCacheSchema = z.object({
  version: z.number(),
  headers: z.record(z.string(), cachedShardHeaderSchema),
});

export const blobMetadataSchema = z.object({
  name: z.string().min(1).max(BLOB_MAX_FILENAME_SIZE).optional(),
  mimeType: z.string().min(1).optional(),
  createdAt: z.number().int().nonnegative().optional(),
});

export const blobFooterSchema = z
  .object({
    version: z.number(),
    encrypted: z.boolean(),
    plainSize: z.number().int().nonnegative(),
    chunkSize: z.number().int().positive(),
    storedChunkSize: z.number().int().positive(),
    metadata: blobMetadataSchema.optional().default({}),
  })
  .superRefine((footer, ctx) => {
    if (footer.storedChunkSize < footer.chunkSize) {
      ctx.addIssue({
        code: 'custom',
        message: 'storedChunkSize must be greater than or equal to chunkSize',
        path: ['storedChunkSize'],
      });
    }
  });

export const deviceKeyStoreSchema = z.object({
  deviceId: z.string(),
  key: z.instanceof(CryptoKey),
});

export type ShardDocInfo = z.infer<typeof shardDocInfoSchema>;
export type ShardHeader = z.infer<typeof shardHeaderSchema>;
export type ShardFileInfo = z.infer<typeof shardFileInfoSchema>;
export type ManifestDeviceKeyInfo = z.infer<typeof manifestDeviceKeyInfoSchema>;
export type ManifestDeviceKeyRegistry = z.infer<typeof manifestDeviceKeyRegistrySchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type CachedShardHeader = z.infer<typeof cachedShardHeaderSchema>;
export type ShardHeaderCache = z.infer<typeof shardHeaderCacheSchema>;
export type BlobMetadata = z.infer<typeof blobMetadataSchema>;
export type BlobFooter = z.infer<typeof blobFooterSchema>;
export type DeviceKeyStore = z.infer<typeof deviceKeyStoreSchema>;
