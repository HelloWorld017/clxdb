import type { ClxDBClientOptions } from '@/types';
import type { DatabaseClient } from '@/ui/types';
import type { ReactNode } from 'react';

export type SettingsTab = 'overview' | 'encryption' | 'devices' | 'export';

export interface TabOption {
  id: SettingsTab;
  label: string;
  icon: ReactNode;
}

export interface StorageOverview {
  backendLabel: string;
  detailLabel: string;
  detailValue: string;
  description: string;
}

export interface DatabaseSettingsProps {
  client: DatabaseClient;
  options?: ClxDBClientOptions;
  className?: string;
  disabled?: boolean;
}
