import { useId, useState } from 'react';
import { _t, useI18n } from '@/ui/i18n';
import {
  PIN_LENGTH,
  PinInput,
  createEmptyPin,
  isCompletePin,
  pinToString,
} from '../common/pin-input';
import { getErrorMessage } from './utils';
import type { ClxDBStatus } from '@/core/utils/inspect';
import type { SubmitEvent } from 'react';

export interface EncryptionTabProps {
  status: ClxDBStatus | null;
  disabled: boolean;
  onUpdateMasterPassword: (oldPassword: string, newPassword: string) => Promise<void>;
  onUpdateQuickUnlockPin: (masterPassword: string, quickUnlockPin: string) => Promise<void>;
}

export const EncryptionTab = ({
  status,
  disabled,
  onUpdateMasterPassword,
  onUpdateQuickUnlockPin,
}: EncryptionTabProps) => {
  const { t } = useI18n();
  const [currentMasterPassword, setCurrentMasterPassword] = useState('');
  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [isUpdatingMasterPassword, setIsUpdatingMasterPassword] = useState(false);
  const [masterPasswordError, setMasterPasswordError] = useState<string | null>(null);
  const [masterPasswordSuccess, setMasterPasswordSuccess] = useState<string | null>(null);

  const [pinMasterPassword, setPinMasterPassword] = useState('');
  const [newPinDigits, setNewPinDigits] = useState<string[]>(() => createEmptyPin());
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  const baseId = useId();

  const validateMasterPasswordForm = () => {
    if (!currentMasterPassword) {
      return t('encryptionTab.validation.currentMasterRequired');
    }

    if (!newMasterPassword) {
      return t('encryptionTab.validation.newMasterRequired');
    }

    if (newMasterPassword !== confirmMasterPassword) {
      return t('encryptionTab.validation.confirmMismatch');
    }

    if (currentMasterPassword === newMasterPassword) {
      return t('encryptionTab.validation.mustDiffer');
    }

    return null;
  };

  const validatePinForm = () => {
    if (!pinMasterPassword) {
      return t('encryptionTab.validation.pinMasterRequired');
    }

    if (!isCompletePin(newPinDigits)) {
      return t('encryptionTab.validation.pinIncomplete', { count: PIN_LENGTH });
    }

    return null;
  };

  const handleMasterPasswordSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (disabled || isUpdatingMasterPassword) {
      return;
    }

    const validationError = validateMasterPasswordForm();
    if (validationError) {
      setMasterPasswordError(validationError);
      setMasterPasswordSuccess(null);
      return;
    }

    setMasterPasswordError(null);
    setMasterPasswordSuccess(null);
    setIsUpdatingMasterPassword(true);

    try {
      await onUpdateMasterPassword(currentMasterPassword, newMasterPassword);
      setCurrentMasterPassword('');
      setNewMasterPassword('');
      setConfirmMasterPassword('');
      setMasterPasswordSuccess(t('encryptionTab.success.masterUpdated'));
    } catch (error) {
      setMasterPasswordError(getErrorMessage(error, t('encryptionTab.error.updateMasterFallback')));
    } finally {
      setIsUpdatingMasterPassword(false);
    }
  };

  const handlePinSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (disabled || isUpdatingPin) {
      return;
    }

    const validationError = validatePinForm();
    if (validationError) {
      setPinError(validationError);
      setPinSuccess(null);
      return;
    }

    setPinError(null);
    setPinSuccess(null);
    setIsUpdatingPin(true);

    try {
      await onUpdateQuickUnlockPin(pinMasterPassword, pinToString(newPinDigits));
      setPinMasterPassword('');
      setNewPinDigits(createEmptyPin());
      setPinSuccess(t('encryptionTab.success.pinUpdated'));
    } catch (error) {
      setPinError(getErrorMessage(error, t('encryptionTab.error.updatePinFallback')));
    } finally {
      setIsUpdatingPin(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-default-900">
          <_t>{['encryptionTab.title']}</_t>
        </h3>
        <p className="mt-1 text-sm text-default-600">
          <_t>{['encryptionTab.description']}</_t>
        </p>
      </div>

      {!status?.hasDatabase ? (
        <p
          className="rounded-xl border border-default-300 bg-default-100 px-3 py-2 text-sm
            text-default-700"
        >
          <_t>{['encryptionTab.noDatabase']}</_t>
        </p>
      ) : status.isEncrypted ? (
        <>
          <form
            onSubmit={handleMasterPasswordSubmit}
            className="rounded-2xl border border-default-200 bg-default-50/70 p-4"
          >
            <div className="mb-3">
              <p className="text-sm font-semibold text-default-900">
                <_t>{['encryptionTab.section.changeMaster.title']}</_t>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-default-500">
                <_t>{['encryptionTab.section.changeMaster.description']}</_t>
              </p>
            </div>

            <div className="grid gap-3">
              <label
                className="text-xs font-semibold tracking-wide text-default-600"
                htmlFor={`${baseId}-current-master-password`}
              >
                <_t>{['encryptionTab.field.currentMaster']}</_t>
                <input
                  id={`${baseId}-current-master-password`}
                  type="password"
                  value={currentMasterPassword}
                  onChange={event => setCurrentMasterPassword(event.target.value)}
                  disabled={disabled || isUpdatingMasterPassword}
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-xl border border-default-300 bg-surface px-3 py-2.5
                    text-sm font-normal text-default-800 transition-colors duration-200 outline-none
                    focus:border-default-500 disabled:cursor-not-allowed disabled:border-default-200
                    disabled:bg-default-100"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className="text-xs font-semibold tracking-wide text-default-600"
                  htmlFor={`${baseId}-new-master-password`}
                >
                  <_t>{['encryptionTab.field.newMaster']}</_t>
                  <input
                    id={`${baseId}-new-master-password`}
                    type="password"
                    value={newMasterPassword}
                    onChange={event => setNewMasterPassword(event.target.value)}
                    disabled={disabled || isUpdatingMasterPassword}
                    autoComplete="new-password"
                    className="mt-2 w-full rounded-xl border border-default-300 bg-surface px-3
                      py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                      outline-none focus:border-default-500 disabled:cursor-not-allowed
                      disabled:border-default-200 disabled:bg-default-100"
                  />
                </label>

                <label
                  className="text-xs font-semibold tracking-wide text-default-600"
                  htmlFor={`${baseId}-confirm-master-password`}
                >
                  <_t>{['encryptionTab.field.confirmMaster']}</_t>
                  <input
                    id={`${baseId}-confirm-master-password`}
                    type="password"
                    value={confirmMasterPassword}
                    onChange={event => setConfirmMasterPassword(event.target.value)}
                    disabled={disabled || isUpdatingMasterPassword}
                    autoComplete="new-password"
                    className="mt-2 w-full rounded-xl border border-default-300 bg-surface px-3
                      py-2.5 text-sm font-normal text-default-800 transition-colors duration-200
                      outline-none focus:border-default-500 disabled:cursor-not-allowed
                      disabled:border-default-200 disabled:bg-default-100"
                  />
                </label>
              </div>
            </div>

            {masterPasswordError && (
              <p
                className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm
                  text-red-700"
              >
                {masterPasswordError}
              </p>
            )}

            {masterPasswordSuccess && (
              <p
                className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm
                  text-emerald-700"
              >
                {masterPasswordSuccess}
              </p>
            )}

            <button
              type="submit"
              disabled={disabled || isUpdatingMasterPassword}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-primary px-4
                py-2.5 text-sm font-semibold text-primary-foreground transition-colors duration-200
                hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-default-300"
            >
              {isUpdatingMasterPassword ? (
                <_t>{['common.updating']}</_t>
              ) : (
                <_t>{['encryptionTab.button.updateMaster']}</_t>
              )}
            </button>
          </form>

          <form
            onSubmit={handlePinSubmit}
            className="rounded-2xl border border-default-200 bg-default-50/70 p-4"
          >
            <div className="mb-2">
              <p className="text-sm font-semibold text-default-900">
                <_t>{['encryptionTab.section.updatePin.title']}</_t>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-default-500">
                <_t>{['encryptionTab.section.updatePin.description']}</_t>
              </p>
            </div>

            <label
              className="text-xs font-semibold tracking-wide text-default-600"
              htmlFor={`${baseId}-pin-master-password`}
            >
              <_t>{['encryptionTab.field.pinMaster']}</_t>
              <input
                id={`${baseId}-pin-master-password`}
                type="password"
                value={pinMasterPassword}
                onChange={event => setPinMasterPassword(event.target.value)}
                disabled={disabled || isUpdatingPin}
                autoComplete="current-password"
                className="mt-2 w-full rounded-xl border border-default-300 bg-surface px-3 py-2.5
                  text-sm font-normal text-default-800 transition-colors duration-200 outline-none
                  focus:border-default-500 disabled:cursor-not-allowed disabled:border-default-200
                  disabled:bg-default-100"
              />
            </label>

            <PinInput
              idPrefix={`${baseId}-new-pin`}
              label={t('encryptionTab.pin.labelNew')}
              hint={t('encryptionTab.pin.hintNew')}
              digits={newPinDigits}
              disabled={disabled || isUpdatingPin}
              className="my-5"
              onChange={setNewPinDigits}
            />

            {pinError && (
              <p
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm
                  text-red-700"
              >
                {pinError}
              </p>
            )}

            {pinSuccess && (
              <p
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm
                  text-emerald-700"
              >
                {pinSuccess}
              </p>
            )}

            <button
              type="submit"
              disabled={disabled || isUpdatingPin}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-primary px-4
                py-2.5 text-sm font-semibold text-primary-foreground transition-colors duration-200
                hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-default-300"
            >
              {isUpdatingPin ? (
                <_t>{['common.updating']}</_t>
              ) : (
                <_t>{['encryptionTab.button.updatePin']}</_t>
              )}
            </button>
          </form>
        </>
      ) : (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm
            text-amber-800"
        >
          <_t>{['encryptionTab.unencryptedNotice']}</_t>
        </p>
      )}
    </div>
  );
};
