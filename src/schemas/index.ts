import { z } from 'zod';

export const shardDocInfoSchema = z.object({
  id: z.string(),
  seq: z.number(),
  del: z.number().nullable(),
  offset: z.number(),
  len: z.number(),
});

export const shardHeaderSchema = z.object({
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

export const manifestSchema = z.object({
  version: z.number(),
  lastSequence: z.number(),
  shardFiles: z.array(shardFileInfoSchema),
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

export const pendingChangesSchema = z.object({
  version: z.number(),
  pendingIds: z.array(z.string()),
});

export type ShardDocInfo = z.infer<typeof shardDocInfoSchema>;
export type ShardHeader = z.infer<typeof shardHeaderSchema>;
export type ShardFileInfo = z.infer<typeof shardFileInfoSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type CachedShardHeader = z.infer<typeof cachedShardHeaderSchema>;
export type ShardHeaderCache = z.infer<typeof shardHeaderCacheSchema>;
