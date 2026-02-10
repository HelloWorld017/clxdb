import { z } from 'zod';

export const shardDocInfoSchema = z.object({
  id: z.string(),
  rev: z.string(),
  seq: z.number(),
  del: z.boolean(),
  offset: z.number(),
  len: z.number(),
});

export const shardHeaderSchema = z.object({
  docs: z.array(shardDocInfoSchema),
});

export const shardFileInfoSchema = z.object({
  filename: z.string(),
  level: z.literal(0).or(z.literal(1)).or(z.literal(2)),
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

export type ShardDocInfo = z.infer<typeof shardDocInfoSchema>;
export type ShardHeader = z.infer<typeof shardHeaderSchema>;
export type ShardFileInfo = z.infer<typeof shardFileInfoSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type CachedShardHeader = z.infer<typeof cachedShardHeaderSchema>;
export type ShardHeaderCache = z.infer<typeof shardHeaderCacheSchema>;
