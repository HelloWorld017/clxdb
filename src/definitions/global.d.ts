declare global {
  interface Navigator {
    userAgentData?: {
      brands: { brand: string; version: string }[];
      mobile: boolean;
      platform: string;
      getHighEntropyValues?: <K extends string>(hints: string[]) => Promise<Record<K, string>>;
    };
  }

  interface FileSystemHandle {
    queryPermission?: (descriptor: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  }

  interface StorageManager {
    getDirectory?(): Promise<FileSystemDirectoryHandle>;
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
