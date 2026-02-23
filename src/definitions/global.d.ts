declare global {
  interface FileSystemHandle {
    queryPermission?: (descriptor: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  }

  interface Navigator {
    userAgentData?: {
      brands: { brand: string; version: string }[];
      mobile: boolean;
      platform: string;
      getHighEntropyValues?: <K extends string>(hints: string[]) => Promise<Record<K, string>>;
    };
  }

  interface StorageManager {
    getDirectory?(): Promise<FileSystemDirectoryHandle>;
  }

  interface Uint8Array {
    /**
     * Converts the `Uint8Array` to a base64-encoded string.
     * @param options If provided, sets the alphabet and padding behavior used.
     * @returns A base64-encoded string.
     */
    toBase64(options?: {
      alphabet?: 'base64' | 'base64url' | undefined;
      omitPadding?: boolean | undefined;
    }): string;
  }

  interface Uint8ArrayConstructor {
    /**
     * Creates a new `Uint8Array` from a base64-encoded string.
     * @param string The base64-encoded string.
     * @param options If provided, specifies the alphabet and handling of the last chunk.
     * @returns A new `Uint8Array` instance.
     * @throws {SyntaxError} If the input string contains characters outside the specified alphabet, or if the last
     * chunk is inconsistent with the `lastChunkHandling` option.
     */
    fromBase64(
      string: string,
      options?: {
        alphabet?: 'base64' | 'base64url' | undefined;
        lastChunkHandling?: 'loose' | 'strict' | 'stop-before-partial' | undefined;
      }
    ): Uint8Array<ArrayBuffer>;
  }

  interface Window {
    showDirectoryPicker?(options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?:
        | FileSystemHandle
        | 'desktop'
        | 'documents'
        | 'downloads'
        | 'music'
        | 'pictures'
        | 'videos';
    }): Promise<FileSystemDirectoryHandle>;
  }
}

export {};
