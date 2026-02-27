const en = {
  'common.applying': 'Applying...',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.continue': 'Continue',
  'common.creating': 'Creating...',
  'common.loading': 'Loading...',
  'common.opening': 'Opening...',
  'common.or': 'Or',
  'common.unknown': 'Unknown',
  'common.updating': 'Updating...',
  'common.unsupported': 'Unsupported',
  'common.passwordPlaceholder': '••••••••',

  'dialog.closeAria': 'Close dialog',
  'dialog.closeTitle': 'Close dialog',

  'pinInput.show': 'Show',
  'pinInput.hide': 'Hide',
  'pinInput.showAria': 'Show PIN digits',
  'pinInput.hideAria': 'Hide PIN digits',

  'syncIndicator.defaultError': 'Sync failed. Please try again.',
  'syncIndicator.icon.pending': 'Pending sync',
  'syncIndicator.icon.syncing': 'Syncing',
  'syncIndicator.icon.success': 'Sync complete',
  'syncIndicator.icon.error': 'Sync failed',
  'syncIndicator.label.pending': 'Sync pending',
  'syncIndicator.label.syncing': 'Syncing in progress',
  'syncIndicator.label.success': 'Sync completed',
  'syncIndicator.label.error': 'Sync failed. Click for details.',

  'storagePicker.eyebrow': 'Storage Backend',
  'storagePicker.title': 'Choose storage and folder',
  'storagePicker.description':
    'Pick FileSystem Access API, Origin Private File System, WebDAV, or an S3-compatible provider, then choose where ClxDB should store its files.',
  'storagePicker.submit.default': 'Save storage settings',
  'storagePicker.error.invalidSelection': 'Please check the details and try again.',
  'storagePicker.error.saveFailed': 'Could not save storage settings. Please try again.',
  'storagePicker.unsupportedBadge': 'Unsupported',
  'storagePicker.selectDirectory.title': 'Select Directory',
  'storagePicker.selectDirectory.chooseStorageFirst': 'Choose storage first.',

  'storagePicker.option.filesystem.label': 'FileSystem Access API',
  'storagePicker.option.filesystem.description':
    'Save to a local folder with explicit read/write permission.',
  'storagePicker.option.filesystem.unsupportedReason':
    'FileSystem Access API is not supported in this browser.',
  'storagePicker.option.opfs.label': 'Origin Private File System',
  'storagePicker.option.opfs.description':
    'Use browser-managed private storage for this origin and profile.',
  'storagePicker.option.opfs.unsupportedReason':
    'Origin Private File System is not supported in this browser.',
  'storagePicker.option.s3.label': 'S3 Compatible',
  'storagePicker.option.s3.description':
    'Connect Amazon S3, Cloudflare R2, MinIO, and S3-compatible APIs.',
  'storagePicker.option.webdav.label': 'WebDAV',
  'storagePicker.option.webdav.description':
    'Connect a WebDAV endpoint to sync data across devices.',

  'storagePicker.filesystem.validation.unsupported':
    'FileSystem Access API is not supported in this browser.',
  'storagePicker.filesystem.validation.selectRoot': 'Select a root folder to continue.',
  'storagePicker.filesystem.validation.selectedFolderMissing':
    'Selected folder does not exist in the chosen root.',
  'storagePicker.filesystem.error.apiUnavailable':
    'FileSystem Access API is not available in this browser.',
  'storagePicker.filesystem.error.openPickerFailed':
    'Could not open FileSystem Access folder picker.',
  'storagePicker.filesystem.title': 'FileSystem Access API',
  'storagePicker.filesystem.description':
    'Pick a local folder. This app will request explicit permission for read/write access.',
  'storagePicker.filesystem.button.selectFolder': 'Select Folder',
  'storagePicker.filesystem.selectedRoot': 'Selected: {name}',
  'storagePicker.filesystem.selectedRoot.empty': 'No folder selected yet.',

  'storagePicker.opfs.error.accessFailed': 'Could not access Origin Private File System.',
  'storagePicker.opfs.validation.unsupported':
    'Origin Private File System is not supported in this browser.',
  'storagePicker.opfs.validation.loading':
    'OPFS is still loading. Please wait a moment and try again.',
  'storagePicker.opfs.validation.cannotAccess': 'Could not access Origin Private File System.',
  'storagePicker.opfs.validation.selectedFolderMissing': 'Selected OPFS folder does not exist.',
  'storagePicker.opfs.title': 'Origin Private File System (OPFS)',
  'storagePicker.opfs.description':
    'Data is stored in browser-managed private storage for this origin and profile.',
  'storagePicker.opfs.loadingRoot': 'Preparing OPFS root directory...',

  'storagePicker.s3.validation.enterEndpoint': 'Enter an S3 endpoint URL.',
  'storagePicker.s3.validation.invalidProtocol': 'S3 endpoint must start with http:// or https://.',
  'storagePicker.s3.validation.invalidEndpoint': 'Enter a valid S3 endpoint URL.',
  'storagePicker.s3.validation.enterBucket': 'Enter an S3 bucket name.',
  'storagePicker.s3.validation.bucketNoSlash': 'Bucket name cannot include slashes.',
  'storagePicker.s3.validation.enterRegion': 'Enter a region.',
  'storagePicker.s3.validation.enterAccessKeyId': 'Enter an access key ID.',
  'storagePicker.s3.validation.enterSecretAccessKey': 'Enter a secret access key.',
  'storagePicker.s3.validation.invalidSettings': 'Enter valid S3 settings.',
  'storagePicker.s3.field.provider': 'Provider',
  'storagePicker.s3.field.region': 'Region',
  'storagePicker.s3.field.bucket': 'Bucket',
  'storagePicker.s3.field.endpoint': 'S3 Endpoint',
  'storagePicker.s3.field.accessKeyId': 'Access Key ID',
  'storagePicker.s3.field.secretAccessKey': 'Secret Access Key',
  'storagePicker.s3.field.sessionTokenOptional': 'Session Token (optional)',
  'storagePicker.s3.option.provider.s3': 'Amazon S3',
  'storagePicker.s3.option.provider.r2': 'Cloudflare R2',
  'storagePicker.s3.option.provider.minio': 'MinIO',
  'storagePicker.s3.option.provider.unknown': 'Unknown',
  'storagePicker.s3.placeholder.endpoint.s3': 'https://s3.ap-northeast-2.amazonaws.com',
  'storagePicker.s3.placeholder.endpoint.r2': 'https://<account-id>.r2.cloudflarestorage.com',
  'storagePicker.s3.placeholder.endpoint.custom':
    'https://your-own-s3-compatible-storage.example.com',
  'storagePicker.s3.placeholder.region.auto': 'auto',
  'storagePicker.s3.placeholder.region.default': 'us-east-1',
  'storagePicker.s3.placeholder.bucket': 'my-bucket',
  'storagePicker.s3.placeholder.accessKeyId': 'AKIA...',
  'storagePicker.s3.placeholder.sessionToken': 'Temporary credentials only',

  'storagePicker.webdav.validation.enterEndpoint': 'Enter a WebDAV endpoint URL.',
  'storagePicker.webdav.validation.invalidProtocol':
    'WebDAV endpoint must start with http:// or https://.',
  'storagePicker.webdav.validation.invalidEndpoint': 'Enter a valid WebDAV endpoint URL.',
  'storagePicker.webdav.validation.enterUser': 'Enter a WebDAV username.',
  'storagePicker.webdav.validation.enterPassword': 'Enter your password.',
  'storagePicker.webdav.validation.invalidSettings': 'Enter valid WebDAV settings.',
  'storagePicker.webdav.field.endpoint': 'WebDAV Endpoint',
  'storagePicker.webdav.field.user': 'WebDAV Username',
  'storagePicker.webdav.field.password': 'Password',
  'storagePicker.webdav.placeholder.endpoint':
    'https://cloud.example.com/remote.php/dav/files/user',
  'storagePicker.webdav.placeholder.user': 'my-user',

  'directoryPicker.title': 'Select Directory',
  'directoryPicker.error.readFoldersFailed': 'Could not read folders for this location.',
  'directoryPicker.error.enterFolderName': 'Enter a folder name.',
  'directoryPicker.error.invalidFolderName':
    'Folder names cannot include slashes or relative path markers.',
  'directoryPicker.error.createFolderFailed': 'Could not create this folder.',
  'directoryPicker.button.parentDirectoryAria': 'Go to parent folder',
  'directoryPicker.button.createFolderAria': 'Create folder',
  'directoryPicker.popover.folderNameLabel': 'Folder name',
  'directoryPicker.popover.folderNamePlaceholder': 'New Folder',
  'directoryPicker.button.create': 'Create',
  'directoryPicker.button.applyPath': 'Apply path',
  'directoryPicker.loadingFolders': 'Loading folders...',
  'directoryPicker.emptyFolders': 'No subfolders in this location yet.',
  'directoryPicker.placeholder.manualPath': 'folder/subfolder',

  'databaseUnlock.error.inspectFallback':
    'Unable to inspect storage metadata. Check connectivity and try again.',
  'databaseUnlock.error.submitFallback': 'Unlock request failed. Verify credentials and retry.',
  'databaseUnlock.eyebrow': 'Open Database',
  'databaseUnlock.mode.inspecting.title': 'Checking this storage backend',
  'databaseUnlock.mode.create.title': 'Create your database',
  'databaseUnlock.mode.quickUnlock.title': 'Enter your quick unlock PIN',
  'databaseUnlock.mode.masterRecovery.title': 'Recover access with master password',
  'databaseUnlock.mode.unsupported.title': 'Unsupported database state',
  'databaseUnlock.mode.inspectError.title': 'Inspection failed',
  'databaseUnlock.mode.inspecting.description':
    'Reading storage metadata to pick the correct unlock flow.',
  'databaseUnlock.mode.create.description':
    'Set master password and PIN, or create a passwordless database for this storage.',
  'databaseUnlock.mode.quickUnlock.description': 'Enter the 6-digit PIN for this device.',
  'databaseUnlock.mode.masterRecovery.description':
    'Unlock with master password. You can optionally register a new quick unlock PIN.',
  'databaseUnlock.mode.unsupported.description':
    'This backend contains an unencrypted database. This screen supports encrypted flows only.',
  'databaseUnlock.mode.inspectError.description':
    'Storage inspection failed. Try re-scanning after checking storage settings.',
  'databaseUnlock.submit.create': 'Create Encrypted Database',
  'databaseUnlock.submit.unlock': 'Unlock Database',
  'databaseUnlock.submit.unlockAndSavePin': 'Unlock and Save PIN',
  'databaseUnlock.submit.unlockWithMaster': 'Unlock with Master Password',
  'databaseUnlock.validation.statusUnavailable':
    'Database status is unavailable. Run re-scan and try again.',
  'databaseUnlock.validation.masterRequired': 'Enter your master password.',
  'databaseUnlock.validation.pinRequired': 'Enter all {count} PIN digits.',
  'databaseUnlock.button.changeStorage': 'Choose Different Storage',
  'databaseUnlock.unsupportedMessage': 'This backend appears to host an unencrypted database.',
  'databaseUnlock.recovery.modeLabel': 'Unlock Mode',
  'databaseUnlock.recovery.unlockOnly': 'Unlock Only',
  'databaseUnlock.recovery.savePin': 'Save PIN',
  'databaseUnlock.recovery.withPinDescription':
    'Adds a new device key so next unlock can use quick unlock PIN.',
  'databaseUnlock.recovery.masterOnlyDescription':
    'Unlocks with master password only and keeps device key registry unchanged.',
  'databaseUnlock.masterPassword.label': 'Master Password',
  'databaseUnlock.masterPassword.placeholder': 'Enter your master password',
  'databaseUnlock.pin.label': 'Quick Unlock PIN',
  'databaseUnlock.pin.newLabel': 'New Quick Unlock PIN',
  'databaseUnlock.pin.hint':
    'PIN is local to this device and unlocks your database without re-entering the master password.',
  'databaseUnlock.button.createWithoutPassword': 'Create Database Without Password',

  'databaseSettings.title': 'Database Settings',
  'databaseSettings.tab.overview': 'Overview',
  'databaseSettings.tab.encryption': 'Encryption',
  'databaseSettings.tab.devices': 'Devices',
  'databaseSettings.status.refreshing': 'Refreshing database metadata...',
  'databaseSettings.error.inspectFallback':
    'Failed to inspect database metadata. Check connection and retry.',

  'overviewTab.title': 'Connection overview',
  'overviewTab.description':
    'Confirm where this database is connected before changing credentials or devices.',
  'overviewTab.storageBackend.title': 'Storage Backend',
  'overviewTab.databaseState.title': 'Database State',
  'overviewTab.uuid.label': 'UUID',
  'overviewTab.uuid.unavailable': 'Not available',
  'overviewTab.encryption.label': 'Encryption',
  'overviewTab.encryption.enabled': 'Enabled',
  'overviewTab.encryption.disabled': 'Disabled',
  'overviewTab.deviceCurrent.label': 'This device',
  'overviewTab.deviceCurrent.registered': 'Registered',
  'overviewTab.deviceCurrent.notRegistered': 'Not Registered',
  'overviewTab.registeredDevices.label': 'Registered devices',

  'encryptionTab.title': 'Encryption credentials',
  'encryptionTab.description':
    'Rotate your master password and refresh this device PIN without recreating the database.',
  'encryptionTab.noDatabase': 'No database detected for this storage backend yet.',
  'encryptionTab.section.changeMaster.title': 'Change master password',
  'encryptionTab.section.changeMaster.description':
    'This updates the encryption key wrapping metadata for all devices.',
  'encryptionTab.field.currentMaster': 'Current master password',
  'encryptionTab.field.newMaster': 'New master password',
  'encryptionTab.field.confirmMaster': 'Confirm new password',
  'encryptionTab.validation.currentMasterRequired': 'Enter your current master password.',
  'encryptionTab.validation.newMasterRequired': 'Enter a new master password.',
  'encryptionTab.validation.confirmMismatch': 'New master password and confirmation do not match.',
  'encryptionTab.validation.mustDiffer': 'Use a different password from your current one.',
  'encryptionTab.success.masterUpdated': 'Master password updated successfully.',
  'encryptionTab.error.updateMasterFallback': 'Unable to update master password. Please try again.',
  'encryptionTab.button.updateMaster': 'Update master password',
  'encryptionTab.section.updatePin.title': 'Update quick unlock PIN',
  'encryptionTab.section.updatePin.description':
    'This updates local quick-unlock credentials for this device.',
  'encryptionTab.field.pinMaster': 'Master password',
  'encryptionTab.pin.labelNew': 'New quick unlock PIN',
  'encryptionTab.pin.hintNew': 'Use a PIN you can remember. It only unlocks this device.',
  'encryptionTab.validation.pinMasterRequired':
    'Enter your master password to change quick unlock PIN.',
  'encryptionTab.validation.pinIncomplete': 'Enter all {count} digits for both PIN fields.',
  'encryptionTab.success.pinUpdated': 'Quick unlock PIN updated for this device.',
  'encryptionTab.error.updatePinFallback': 'Unable to update quick unlock PIN. Please try again.',
  'encryptionTab.button.updatePin': 'Update quick unlock PIN',
  'encryptionTab.unencryptedNotice':
    'This database is not encrypted. Encryption credential controls are unavailable.',

  'devicesTab.title': 'Trusted devices',
  'devicesTab.description': 'Remove device keys that should no longer unlock this database.',
  'devicesTab.noDatabase': 'No database detected for this storage backend yet.',
  'devicesTab.confirmRemove':
    'Remove this device from quick unlock access? It will need master password recovery to unlock again.',
  'devicesTab.error.removeFallback': 'Unable to remove this device. Please try again.',
  'devicesTab.empty': 'No registered quick-unlock devices yet.',
  'devicesTab.field.idPrefix': 'ID: {id}',
  'devicesTab.field.lastUsed': 'Last used: {value}',
  'devicesTab.badge.current': 'This device',
  'devicesTab.button.remove': 'Remove',
  'devicesTab.button.removing': 'Removing...',
  'devicesTab.unencryptedNotice': 'Device registry is only available for encrypted databases.',

  'exportTab.title': 'Export and import',
  'exportTab.description':
    'Prepare JSON backup workflows. Action wiring is intentionally left to your app.',
  'exportTab.section.export.title': 'JSON export',
  'exportTab.section.export.description':
    'Download the current database state as a JSON payload for manual backup and audit.',
  'exportTab.button.export': 'Export JSON',
  'exportTab.section.import.title': 'JSON import',
  'exportTab.section.import.description':
    'Restore database data from an exported JSON file in a future implementation.',
  'exportTab.button.import': 'Import JSON',

  'storageOverview.custom.backendLabel': 'Custom backend',
  'storageOverview.custom.detailLabel': 'Connection details',
  'storageOverview.custom.detailValue': 'Not exposed by this storage adapter',
  'storageOverview.custom.description':
    'This storage adapter does not provide self-describing metadata. Connection details are managed by the host app.',
  'storageOverview.webdav.backendLabel': 'WebDAV',
  'storageOverview.webdav.detailLabel': 'Endpoint',
  'storageOverview.webdav.description':
    'Your database reads and writes through a remote WebDAV endpoint.',
  'storageOverview.s3.provider.r2': 'Cloudflare R2',
  'storageOverview.s3.provider.minio': 'MinIO',
  'storageOverview.s3.provider.s3': 'Amazon S3',
  'storageOverview.s3.detailLabel': 'Bucket / Prefix',
  'storageOverview.s3.description':
    'Your database reads and writes through an S3-compatible endpoint ({endpoint}, {region}).',
  'storageOverview.filesystem.opfs.backendLabel': 'Origin Private File System',
  'storageOverview.filesystem.access.backendLabel': 'FileSystem Access API',
  'storageOverview.filesystem.detailLabel': 'Directory',
  'storageOverview.filesystem.opfs.description':
    'Your database is stored in browser-managed private storage for this origin.',
  'storageOverview.filesystem.access.description':
    'Your database is stored in a user-selected local directory.',

  'icon.storage.filesystem': 'FileSystem Access API',
  'icon.storage.opfs': 'OPFS',
  'icon.storage.webdav': 'WebDAV',
  'icon.storage.s3': 'S3 Compatible',
  'icon.directory.folder': 'Folder',
  'icon.directory.up': 'Up',
  'icon.directory.newFolder': 'New Folder',
  'icon.settings.overview': 'Overview',
  'icon.settings.encryption': 'Encryption',
  'icon.settings.devices': 'Devices',
  'icon.settings.export': 'Export',
} as const;

export type ClxUIMessageKey = keyof typeof en;
export type ClxUIMessageCatalog = Record<ClxUIMessageKey, string>;

export const CLX_UI_MESSAGES: Record<string, ClxUIMessageCatalog> & {
  en: ClxUIMessageCatalog;
} = {
  en,
};

export const DEFAULT_CLX_UI_LOCALE = 'en' as const;
