import { useId, useState } from 'react';
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
  const [currentMasterPassword, setCurrentMasterPassword] = useState('');
  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [isUpdatingMasterPassword, setIsUpdatingMasterPassword] = useState(false);
  const [masterPasswordError, setMasterPasswordError] = useState<string | null>(null);
  const [masterPasswordSuccess, setMasterPasswordSuccess] = useState<string | null>(null);

  const [pinMasterPassword, setPinMasterPassword] = useState('');
  const [newPinDigits, setNewPinDigits] = useState<string[]>(() => createEmptyPin());
  const [confirmPinDigits, setConfirmPinDigits] = useState<string[]>(() => createEmptyPin());
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  const baseId = useId();

  const validateMasterPasswordForm = () => {
    if (!currentMasterPassword) {
      return 'Enter your current master password.';
    }

    if (!newMasterPassword) {
      return 'Enter a new master password.';
    }

    if (newMasterPassword !== confirmMasterPassword) {
      return 'New master password and confirmation do not match.';
    }

    if (currentMasterPassword === newMasterPassword) {
      return 'Use a different password from your current one.';
    }

    return null;
  };

  const validatePinForm = () => {
    if (!pinMasterPassword) {
      return 'Enter your master password to change quick unlock PIN.';
    }

    if (!isCompletePin(newPinDigits) || !isCompletePin(confirmPinDigits)) {
      return `Enter all ${PIN_LENGTH} digits for both PIN fields.`;
    }

    if (pinToString(newPinDigits) !== pinToString(confirmPinDigits)) {
      return 'PIN confirmation does not match.';
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
      setMasterPasswordSuccess('Master password updated successfully.');
    } catch (error) {
      setMasterPasswordError(
        getErrorMessage(error, 'Unable to update master password. Please try again.')
      );
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
      setConfirmPinDigits(createEmptyPin());
      setPinSuccess('Quick unlock PIN updated for this device.');
    } catch (error) {
      setPinError(getErrorMessage(error, 'Unable to update quick unlock PIN. Please try again.'));
    } finally {
      setIsUpdatingPin(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-default-900 text-lg font-semibold">Encryption credentials</h3>
        <p className="text-default-600 mt-1 text-sm">
          Rotate your master password and refresh this device PIN without recreating the database.
        </p>
      </div>

      {!status?.hasDatabase ? (
        <p
          className="border-default-300 bg-default-100 text-default-700 rounded-xl border px-3 py-2
            text-sm"
        >
          No database detected for this storage backend yet.
        </p>
      ) : status.isEncrypted ? (
        <>
          <form
            onSubmit={handleMasterPasswordSubmit}
            className="border-default-200 bg-default-50/70 rounded-2xl border p-4"
          >
            <div className="mb-3">
              <p className="text-default-900 text-sm font-semibold">Change master password</p>
              <p className="text-default-500 mt-1 text-xs leading-relaxed">
                This updates the encryption key wrapping metadata for all devices.
              </p>
            </div>

            <div className="grid gap-3">
              <label
                className="text-default-600 text-xs font-semibold tracking-wide uppercase"
                htmlFor={`${baseId}-current-master-password`}
              >
                Current master password
                <input
                  id={`${baseId}-current-master-password`}
                  type="password"
                  value={currentMasterPassword}
                  onChange={event => setCurrentMasterPassword(event.target.value)}
                  disabled={disabled || isUpdatingMasterPassword}
                  autoComplete="current-password"
                  className="border-default-300 text-default-800 focus:border-default-500
                    disabled:border-default-200 disabled:bg-default-100 bg-surface mt-2 w-full
                    rounded-xl border px-3 py-2.5 text-sm font-normal transition-colors duration-200
                    outline-none disabled:cursor-not-allowed"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className="text-default-600 text-xs font-semibold tracking-wide uppercase"
                  htmlFor={`${baseId}-new-master-password`}
                >
                  New master password
                  <input
                    id={`${baseId}-new-master-password`}
                    type="password"
                    value={newMasterPassword}
                    onChange={event => setNewMasterPassword(event.target.value)}
                    disabled={disabled || isUpdatingMasterPassword}
                    autoComplete="new-password"
                    className="border-default-300 text-default-800 focus:border-default-500
                      disabled:border-default-200 disabled:bg-default-100 bg-surface mt-2 w-full
                      rounded-xl border px-3 py-2.5 text-sm font-normal transition-colors
                      duration-200 outline-none disabled:cursor-not-allowed"
                  />
                </label>

                <label
                  className="text-default-600 text-xs font-semibold tracking-wide uppercase"
                  htmlFor={`${baseId}-confirm-master-password`}
                >
                  Confirm new password
                  <input
                    id={`${baseId}-confirm-master-password`}
                    type="password"
                    value={confirmMasterPassword}
                    onChange={event => setConfirmMasterPassword(event.target.value)}
                    disabled={disabled || isUpdatingMasterPassword}
                    autoComplete="new-password"
                    className="border-default-300 text-default-800 focus:border-default-500
                      disabled:border-default-200 disabled:bg-default-100 bg-surface mt-2 w-full
                      rounded-xl border px-3 py-2.5 text-sm font-normal transition-colors
                      duration-200 outline-none disabled:cursor-not-allowed"
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
              className="bg-primary text-primary-foreground hover:bg-primary-hover
                disabled:bg-default-300 mt-4 inline-flex items-center justify-center rounded-xl px-4
                py-2.5 text-sm font-semibold transition-colors duration-200
                disabled:cursor-not-allowed"
            >
              {isUpdatingMasterPassword ? 'Updating...' : 'Update master password'}
            </button>
          </form>

          <form
            onSubmit={handlePinSubmit}
            className="border-default-200 bg-default-50/70 rounded-2xl border p-4"
          >
            <div className="mb-2">
              <p className="text-default-900 text-sm font-semibold">Change quick unlock PIN</p>
              <p className="text-default-500 mt-1 text-xs leading-relaxed">
                This updates local quick-unlock credentials for this device.
              </p>
            </div>

            <label
              className="text-default-600 text-xs font-semibold tracking-wide uppercase"
              htmlFor={`${baseId}-pin-master-password`}
            >
              Master password
              <input
                id={`${baseId}-pin-master-password`}
                type="password"
                value={pinMasterPassword}
                onChange={event => setPinMasterPassword(event.target.value)}
                disabled={disabled || isUpdatingPin}
                autoComplete="current-password"
                className="border-default-300 text-default-800 focus:border-default-500
                  disabled:border-default-200 disabled:bg-default-100 bg-surface mt-2 w-full
                  rounded-xl border px-3 py-2.5 text-sm font-normal transition-colors duration-200
                  outline-none disabled:cursor-not-allowed"
              />
            </label>

            <PinInput
              idPrefix={`${baseId}-new-pin`}
              label="New quick unlock PIN"
              hint="Use a PIN you can remember. It only unlocks this device."
              digits={newPinDigits}
              disabled={disabled || isUpdatingPin}
              className="my-5"
              onChange={setNewPinDigits}
            />

            <PinInput
              idPrefix={`${baseId}-confirm-pin`}
              label="Confirm quick unlock PIN"
              hint="Enter the same 6-digit PIN again."
              digits={confirmPinDigits}
              disabled={disabled || isUpdatingPin}
              className="my-5"
              onChange={setConfirmPinDigits}
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
              className="bg-primary text-primary-foreground hover:bg-primary-hover
                disabled:bg-default-300 mt-4 inline-flex items-center justify-center rounded-xl px-4
                py-2.5 text-sm font-semibold transition-colors duration-200
                disabled:cursor-not-allowed"
            >
              {isUpdatingPin ? 'Updating...' : 'Update quick unlock PIN'}
            </button>
          </form>
        </>
      ) : (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm
            text-amber-800"
        >
          This database is not encrypted. Encryption credential controls are unavailable.
        </p>
      )}
    </div>
  );
};
