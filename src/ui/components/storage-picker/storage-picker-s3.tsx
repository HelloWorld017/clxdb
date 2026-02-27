import { useEffect, useId, useState } from 'react';
import { _t, useI18n } from '@/ui/i18n';
import { normalizeDirectoryPath, normalizeS3Bucket, normalizeS3Endpoint } from './utils';
import type { OnStoragePickerConfigChange } from './types';
import type { S3Provider } from '@/storages/s3';

export interface StoragePickerS3Props {
  controlsLocked: boolean;
  directoryPath: string;
  onConfigChange: OnStoragePickerConfigChange;
}

export const StoragePickerS3 = ({
  controlsLocked,
  directoryPath,
  onConfigChange,
}: StoragePickerS3Props) => {
  const { t } = useI18n();
  const [provider, setProvider] = useState<S3Provider>('s3');
  const [endpoint, setEndpoint] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [bucket, setBucket] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const sectionId = useId();
  const s3ProviderId = `${sectionId}-provider`;
  const s3EndpointId = `${sectionId}-endpoint`;
  const s3RegionId = `${sectionId}-region`;
  const s3BucketId = `${sectionId}-bucket`;
  const s3AccessKeyIdId = `${sectionId}-access-key`;
  const s3SecretAccessKeyId = `${sectionId}-secret-key`;
  const s3SessionTokenId = `${sectionId}-session-token`;
  const s3EndpointPlaceholder =
    provider === 's3'
      ? t('storagePicker.s3.placeholder.endpoint.s3')
      : provider === 'r2'
        ? t('storagePicker.s3.placeholder.endpoint.r2')
        : t('storagePicker.s3.placeholder.endpoint.custom');

  useEffect(() => {
    const debounceKey = `s3:${normalizeDirectoryPath(directoryPath)}`;

    if (!endpoint.trim()) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: t('storagePicker.s3.validation.enterEndpoint'),
        debounceKey,
      });
      return;
    }

    try {
      const parsed = new URL(endpoint.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        onConfigChange({
          config: null,
          isValid: false,
          validationMessage: t('storagePicker.s3.validation.invalidProtocol'),
          debounceKey,
        });
        return;
      }
    } catch {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: t('storagePicker.s3.validation.invalidEndpoint'),
        debounceKey,
      });
      return;
    }

    if (!bucket.trim()) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: t('storagePicker.s3.validation.enterBucket'),
        debounceKey,
      });
      return;
    }

    if (bucket.trim().includes('/')) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: t('storagePicker.s3.validation.bucketNoSlash'),
        debounceKey,
      });
      return;
    }

    if (!region.trim()) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: t('storagePicker.s3.validation.enterRegion'),
        debounceKey,
      });
      return;
    }

    if (!accessKeyId.trim()) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: t('storagePicker.s3.validation.enterAccessKeyId'),
        debounceKey,
      });
      return;
    }

    if (!secretAccessKey) {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: t('storagePicker.s3.validation.enterSecretAccessKey'),
        debounceKey,
      });
      return;
    }

    try {
      const regionValue = region.trim() || (provider === 'r2' ? 'auto' : 'us-east-1');
      onConfigChange({
        config: {
          kind: 's3',
          provider,
          endpoint: normalizeS3Endpoint(endpoint),
          region: regionValue,
          bucket: normalizeS3Bucket(bucket),
          prefix: directoryPath,
          forcePathStyle: provider !== 's3',
          credentials: {
            accessKeyId: accessKeyId.trim(),
            secretAccessKey,
            ...(sessionToken.trim() ? { sessionToken: sessionToken.trim() } : {}),
          },
        },
        isValid: true,
        validationMessage: null,
        debounceKey,
      });
    } catch {
      onConfigChange({
        config: null,
        isValid: false,
        validationMessage: t('storagePicker.s3.validation.invalidSettings'),
        debounceKey,
      });
    }
  }, [
    accessKeyId,
    bucket,
    directoryPath,
    endpoint,
    onConfigChange,
    provider,
    region,
    secretAccessKey,
    sessionToken,
    t,
  ]);

  const selectS3Provider = (nextProvider: S3Provider) => {
    setProvider(nextProvider);
    if (nextProvider === 'r2' || nextProvider === 'unknown') {
      if (!region.trim() || region.trim() === 'us-east-1') {
        setRegion('auto');
      }
      return;
    }

    if (region.trim() === 'auto') {
      setRegion('us-east-1');
    }
  };

  return (
    <div className="rounded-2xl border border-default-200 bg-surface/80 p-4 sm:p-5">
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-semibold text-default-800" htmlFor={s3ProviderId}>
            <_t>{['storagePicker.s3.field.provider']}</_t>
            <select
              id={s3ProviderId}
              value={provider}
              onChange={event => selectS3Provider(event.target.value as S3Provider)}
              disabled={controlsLocked}
              className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3 py-2.5
                text-sm font-normal text-default-800 transition-colors duration-200 outline-none
                focus:border-default-500 focus:bg-surface disabled:cursor-not-allowed
                disabled:border-default-200 disabled:bg-default-100"
            >
              <option value="s3">{t('storagePicker.s3.option.provider.s3')}</option>
              <option value="r2">{t('storagePicker.s3.option.provider.r2')}</option>
              <option value="minio">{t('storagePicker.s3.option.provider.minio')}</option>
              <option value="unknown">{t('storagePicker.s3.option.provider.unknown')}</option>
            </select>
          </label>

          <label className="text-sm font-semibold text-default-800" htmlFor={s3RegionId}>
            <_t>{['storagePicker.s3.field.region']}</_t>
            <input
              id={s3RegionId}
              type="text"
              value={region}
              onChange={event => setRegion(event.target.value)}
              disabled={controlsLocked}
              placeholder={
                provider === 'r2' || provider === 'unknown'
                  ? t('storagePicker.s3.placeholder.region.auto')
                  : t('storagePicker.s3.placeholder.region.default')
              }
              className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3 py-2.5
                text-sm font-normal text-default-800 transition-colors duration-200 outline-none
                placeholder:text-default-400 focus:border-default-500 focus:bg-surface
                disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100"
            />
          </label>

          <label className="text-sm font-semibold text-default-800" htmlFor={s3BucketId}>
            <_t>{['storagePicker.s3.field.bucket']}</_t>
            <input
              id={s3BucketId}
              type="text"
              value={bucket}
              onChange={event => setBucket(event.target.value)}
              disabled={controlsLocked}
              placeholder={t('storagePicker.s3.placeholder.bucket')}
              className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3 py-2.5
                text-sm font-normal text-default-800 transition-colors duration-200 outline-none
                placeholder:text-default-400 focus:border-default-500 focus:bg-surface
                disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100"
            />
          </label>
        </div>

        <label className="text-sm font-semibold text-default-800" htmlFor={s3EndpointId}>
          <_t>{['storagePicker.s3.field.endpoint']}</_t>
          <input
            id={s3EndpointId}
            type="url"
            value={endpoint}
            onChange={event => setEndpoint(event.target.value)}
            disabled={controlsLocked}
            placeholder={s3EndpointPlaceholder}
            className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3 py-2.5
              text-sm font-normal text-default-800 transition-colors duration-200 outline-none
              placeholder:text-default-400 focus:border-default-500 focus:bg-surface
              disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-default-800" htmlFor={s3AccessKeyIdId}>
            <_t>{['storagePicker.s3.field.accessKeyId']}</_t>
            <input
              id={s3AccessKeyIdId}
              type="text"
              value={accessKeyId}
              onChange={event => setAccessKeyId(event.target.value)}
              disabled={controlsLocked}
              autoComplete="username"
              placeholder={t('storagePicker.s3.placeholder.accessKeyId')}
              className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3 py-2.5
                text-sm font-normal text-default-800 transition-colors duration-200 outline-none
                placeholder:text-default-400 focus:border-default-500 focus:bg-surface
                disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100"
            />
          </label>

          <label className="text-sm font-semibold text-default-800" htmlFor={s3SecretAccessKeyId}>
            <_t>{['storagePicker.s3.field.secretAccessKey']}</_t>
            <input
              id={s3SecretAccessKeyId}
              type="password"
              value={secretAccessKey}
              onChange={event => setSecretAccessKey(event.target.value)}
              disabled={controlsLocked}
              autoComplete="current-password"
              placeholder={t('common.passwordPlaceholder')}
              className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3 py-2.5
                text-sm font-normal text-default-800 transition-colors duration-200 outline-none
                placeholder:text-default-400 focus:border-default-500 focus:bg-surface
                disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100"
            />
          </label>
        </div>

        <label className="text-sm font-semibold text-default-800" htmlFor={s3SessionTokenId}>
          <_t>{['storagePicker.s3.field.sessionTokenOptional']}</_t>
          <input
            id={s3SessionTokenId}
            type="password"
            value={sessionToken}
            onChange={event => setSessionToken(event.target.value)}
            disabled={controlsLocked}
            placeholder={t('storagePicker.s3.placeholder.sessionToken')}
            className="mt-2 w-full rounded-xl border border-default-300 bg-default-50 px-3 py-2.5
              text-sm font-normal text-default-800 transition-colors duration-200 outline-none
              placeholder:text-default-400 focus:border-default-500 focus:bg-surface
              disabled:cursor-not-allowed disabled:border-default-200 disabled:bg-default-100"
          />
        </label>
      </div>
    </div>
  );
};
