export type StorageErrorKind = 'ENOENT' | 'EEXIST' | 'UNKNOWN';

export class StorageError extends Error {
  kind: StorageErrorKind;
  constructor(kind: StorageErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}
