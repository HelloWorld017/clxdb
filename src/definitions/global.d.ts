declare global {
  interface Navigator {
    userAgentData?: {
      brands: { brand: string; version: string }[];
      mobile: boolean;
      platform: string;
      getHighEntropyValues?: <K extends string>(hints: string[]) => Promise<Record<K, string>>;
    };
  }
}

export {};
