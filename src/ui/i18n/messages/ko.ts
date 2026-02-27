import type { ClxUIMessageCatalog } from './en';

export const ko: ClxUIMessageCatalog = {
  'common.applying': '적용 중...',
  'common.cancel': '취소',
  'common.close': '닫기',
  'common.continue': '계속',
  'common.creating': '생성 중...',
  'common.loading': '불러오는 중...',
  'common.opening': '여는 중...',
  'common.or': '또는',
  'common.unknown': '알 수 없음',
  'common.updating': '업데이트 중...',
  'common.unsupported': '지원되지 않음',
  'common.passwordPlaceholder': '••••••••',

  'dialog.closeAria': '대화상자 닫기',
  'dialog.closeTitle': '대화상자 닫기',

  'pinInput.show': '표시',
  'pinInput.hide': '숨기기',
  'pinInput.showAria': 'PIN 숫자 표시',
  'pinInput.hideAria': 'PIN 숫자 숨기기',

  'syncIndicator.defaultError': '동기화에 실패했습니다. 다시 시도해 주세요.',
  'syncIndicator.icon.pending': '동기화 대기',
  'syncIndicator.icon.syncing': '동기화 중',
  'syncIndicator.icon.success': '동기화 완료',
  'syncIndicator.icon.error': '동기화 실패',
  'syncIndicator.label.pending': '동기화 대기 중',
  'syncIndicator.label.syncing': '동기화 진행 중',
  'syncIndicator.label.success': '동기화 완료됨',
  'syncIndicator.label.error': '동기화에 실패했습니다. 자세히 보려면 클릭하세요.',

  'storagePicker.eyebrow': '저장소 백엔드',
  'storagePicker.title': '저장소와 폴더 선택',
  'storagePicker.description':
    'FileSystem Access API, Origin Private File System, WebDAV 또는 S3 호환 제공자를 선택한 후 파일을 저장할 위치를 지정하세요.',
  'storagePicker.submit.default': '저장소 설정 저장',
  'storagePicker.error.invalidSelection': '입력한 내용을 확인한 뒤 다시 시도해 주세요.',
  'storagePicker.error.saveFailed': '저장소 설정을 저장하지 못했습니다. 다시 시도해 주세요.',
  'storagePicker.unsupportedBadge': '지원되지 않음',
  'storagePicker.persist.label': '이 기기에 저장소 설정 기억하기',
  'storagePicker.selectDirectory.title': '디렉터리 선택',
  'storagePicker.selectDirectory.chooseStorageFirst': '먼저 저장소를 선택하세요.',
  'storagePicker.corsGuide.title': '이 저장소는 CORS 설정이 필요합니다',
  'storagePicker.corsGuide.description':
    '이 저장소를 사용하려면 CORS 규칙에서 이 앱의 오리진을 허용해 주세요.',
  'storagePicker.corsGuide.button.open': '가이드',
  'storagePicker.corsGuide.popupBlocked':
    '브라우저에서 팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도해 주세요.',

  'storagePicker.option.filesystem.label': 'FileSystem Access API',
  'storagePicker.option.filesystem.description':
    '명시적인 읽기/쓰기 권한을 받아 로컬 폴더에 저장합니다.',
  'storagePicker.option.filesystem.unsupportedReason':
    '이 브라우저에서는 FileSystem Access API를 지원하지 않습니다.',
  'storagePicker.option.opfs.label': 'Origin Private File System',
  'storagePicker.option.opfs.description':
    '이 오리진과 프로필에 대해 브라우저가 관리하는 비공개 저장소를 사용합니다.',
  'storagePicker.option.opfs.unsupportedReason':
    '이 브라우저에서는 Origin Private File System을 지원하지 않습니다.',
  'storagePicker.option.s3.label': 'S3 호환',
  'storagePicker.option.s3.description':
    'Amazon S3, Cloudflare R2, MinIO 및 S3 호환 API에 연결합니다.',
  'storagePicker.option.webdav.label': 'WebDAV',
  'storagePicker.option.webdav.description':
    'WebDAV 엔드포인트에 연결해 기기 간 데이터를 동기화합니다.',

  'storagePicker.filesystem.validation.unsupported':
    '이 브라우저에서는 FileSystem Access API를 지원하지 않습니다.',
  'storagePicker.filesystem.validation.selectRoot': '계속하려면 루트 폴더를 선택하세요.',
  'storagePicker.filesystem.validation.selectedFolderMissing':
    '선택한 루트에 지정된 폴더가 존재하지 않습니다.',
  'storagePicker.filesystem.error.apiUnavailable':
    '이 브라우저에서 FileSystem Access API를 사용할 수 없습니다.',
  'storagePicker.filesystem.error.openPickerFailed':
    'FileSystem Access 폴더 선택기를 열지 못했습니다.',
  'storagePicker.filesystem.title': 'FileSystem Access API',
  'storagePicker.filesystem.description':
    '로컬 폴더를 선택하세요. 이 앱은 읽기/쓰기 접근을 위해 명시적인 권한을 요청합니다.',
  'storagePicker.filesystem.button.selectFolder': '폴더 선택',
  'storagePicker.filesystem.selectedRoot': '선택됨: {name}',
  'storagePicker.filesystem.selectedRoot.empty': '아직 선택된 폴더가 없습니다.',

  'storagePicker.opfs.error.accessFailed': 'Origin Private File System에 접근하지 못했습니다.',
  'storagePicker.opfs.validation.unsupported':
    '이 브라우저에서는 Origin Private File System을 지원하지 않습니다.',
  'storagePicker.opfs.validation.loading': 'OPFS를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.',
  'storagePicker.opfs.validation.cannotAccess': 'Origin Private File System에 접근하지 못했습니다.',
  'storagePicker.opfs.validation.selectedFolderMissing': '선택한 OPFS 폴더가 존재하지 않습니다.',
  'storagePicker.opfs.title': 'Origin Private File System (OPFS)',
  'storagePicker.opfs.description':
    '이 오리진과 프로필에 대해 브라우저가 관리하는 비공개 저장소에 데이터가 저장됩니다.',
  'storagePicker.opfs.loadingRoot': 'OPFS 루트 디렉터리를 준비하는 중...',

  'storagePicker.s3.validation.enterEndpoint': 'S3 엔드포인트 URL을 입력하세요.',
  'storagePicker.s3.validation.invalidProtocol':
    'S3 엔드포인트는 http:// 또는 https://로 시작해야 합니다.',
  'storagePicker.s3.validation.invalidEndpoint': '유효한 S3 엔드포인트 URL을 입력하세요.',
  'storagePicker.s3.validation.enterBucket': 'S3 버킷 이름을 입력하세요.',
  'storagePicker.s3.validation.bucketNoSlash': '버킷 이름에는 슬래시를 포함할 수 없습니다.',
  'storagePicker.s3.validation.enterRegion': '리전을 입력하세요.',
  'storagePicker.s3.validation.enterAccessKeyId': 'Access Key ID를 입력하세요.',
  'storagePicker.s3.validation.enterSecretAccessKey': 'Secret Access Key를 입력하세요.',
  'storagePicker.s3.validation.invalidSettings': '유효한 S3 설정을 입력하세요.',
  'storagePicker.s3.field.provider': '제공자',
  'storagePicker.s3.field.region': '리전',
  'storagePicker.s3.field.bucket': '버킷',
  'storagePicker.s3.field.endpoint': 'S3 엔드포인트',
  'storagePicker.s3.field.accessKeyId': 'Access Key ID',
  'storagePicker.s3.field.secretAccessKey': 'Secret Access Key',
  'storagePicker.s3.field.sessionTokenOptional': 'Session Token(선택 사항)',
  'storagePicker.s3.option.provider.s3': 'Amazon S3',
  'storagePicker.s3.option.provider.r2': 'Cloudflare R2',
  'storagePicker.s3.option.provider.minio': 'MinIO',
  'storagePicker.s3.option.provider.unknown': '알 수 없음',
  'storagePicker.s3.placeholder.endpoint.s3': 'https://s3.ap-northeast-2.amazonaws.com',
  'storagePicker.s3.placeholder.endpoint.r2': 'https://<account-id>.r2.cloudflarestorage.com',
  'storagePicker.s3.placeholder.endpoint.custom':
    'https://your-own-s3-compatible-storage.example.com',
  'storagePicker.s3.placeholder.region.auto': 'auto',
  'storagePicker.s3.placeholder.region.default': 'us-east-1',
  'storagePicker.s3.placeholder.bucket': 'my-bucket',
  'storagePicker.s3.placeholder.accessKeyId': 'AKIA...',
  'storagePicker.s3.placeholder.sessionToken': '임시 자격 증명에서만 사용',

  'storagePicker.webdav.validation.enterEndpoint': 'WebDAV 엔드포인트 URL을 입력하세요.',
  'storagePicker.webdav.validation.invalidProtocol':
    'WebDAV 엔드포인트는 http:// 또는 https://로 시작해야 합니다.',
  'storagePicker.webdav.validation.invalidEndpoint': '유효한 WebDAV 엔드포인트 URL을 입력하세요.',
  'storagePicker.webdav.validation.enterUser': 'WebDAV 사용자 이름을 입력하세요.',
  'storagePicker.webdav.validation.enterPassword': '비밀번호를 입력하세요.',
  'storagePicker.webdav.validation.invalidSettings': '유효한 WebDAV 설정을 입력하세요.',
  'storagePicker.webdav.field.endpoint': 'WebDAV 엔드포인트',
  'storagePicker.webdav.field.user': 'WebDAV 사용자 이름',
  'storagePicker.webdav.field.password': '비밀번호',
  'storagePicker.webdav.placeholder.endpoint':
    'https://cloud.example.com/remote.php/dav/files/user',
  'storagePicker.webdav.placeholder.user': 'my-user',

  'directoryPicker.title': '디렉터리 선택',
  'directoryPicker.error.readFoldersFailed': '이 위치의 폴더를 읽지 못했습니다.',
  'directoryPicker.error.enterFolderName': '폴더 이름을 입력하세요.',
  'directoryPicker.error.invalidFolderName':
    '폴더 이름에는 슬래시나 상대 경로 표식을 포함할 수 없습니다.',
  'directoryPicker.error.createFolderFailed': '이 폴더를 만들지 못했습니다.',
  'directoryPicker.button.parentDirectoryAria': '상위 폴더로 이동',
  'directoryPicker.button.createFolderAria': '폴더 만들기',
  'directoryPicker.button.refreshAria': '새로고침',
  'directoryPicker.popover.folderNameLabel': '폴더 이름',
  'directoryPicker.popover.folderNamePlaceholder': '새 폴더',
  'directoryPicker.button.create': '만들기',
  'directoryPicker.button.applyPath': '경로 적용',
  'directoryPicker.loadingFolders': '폴더 불러오는 중...',
  'directoryPicker.emptyFolders': '이 위치에는 아직 하위 폴더가 없습니다.',
  'directoryPicker.placeholder.manualPath': 'folder/subfolder',

  'databaseUnlock.error.inspectFallback':
    '저장소 메타데이터를 확인할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.',
  'databaseUnlock.error.submitFallback':
    '잠금 해제 요청에 실패했습니다. 자격 증명을 확인하고 다시 시도해 주세요.',
  'databaseUnlock.eyebrow': '데이터베이스 열기',
  'databaseUnlock.mode.inspecting.title': '이 저장소 백엔드 확인 중',
  'databaseUnlock.mode.create.title': '데이터베이스 만들기',
  'databaseUnlock.mode.quickUnlock.title': '빠른 잠금 해제 PIN 입력',
  'databaseUnlock.mode.masterRecovery.title': '마스터 비밀번호로 접근 복구',
  'databaseUnlock.mode.unsupported.title': '지원되지 않는 데이터베이스 상태',
  'databaseUnlock.mode.inspectError.title': '검사 실패',
  'databaseUnlock.mode.inspecting.description':
    '올바른 잠금 해제 흐름을 선택하기 위해 저장소 메타데이터를 읽는 중입니다.',
  'databaseUnlock.mode.create.description':
    '마스터 비밀번호와 PIN을 설정하거나, 이 저장소에 비밀번호 없는 데이터베이스를 만드세요.',
  'databaseUnlock.mode.quickUnlock.description': '이 기기의 6자리 PIN을 입력하세요.',
  'databaseUnlock.mode.masterRecovery.description':
    '마스터 비밀번호로 잠금을 해제합니다. 원하면 새로운 빠른 잠금 해제 PIN을 등록할 수 있습니다.',
  'databaseUnlock.mode.unsupported.description':
    '이 백엔드에는 암호화되지 않은 데이터베이스가 있습니다. 이 화면은 암호화된 흐름만 지원합니다.',
  'databaseUnlock.mode.inspectError.description':
    '저장소 검사에 실패했습니다. 저장소 설정을 확인한 뒤 다시 스캔해 보세요.',
  'databaseUnlock.submit.create': '암호화된 데이터베이스 만들기',
  'databaseUnlock.submit.unlock': '데이터베이스 잠금 해제',
  'databaseUnlock.submit.unlockAndSavePin': '잠금 해제 후 PIN 저장',
  'databaseUnlock.submit.unlockWithMaster': '마스터 비밀번호로 잠금 해제',
  'databaseUnlock.validation.statusUnavailable':
    '데이터베이스 상태를 확인할 수 없습니다. 다시 스캔한 뒤 재시도해 주세요.',
  'databaseUnlock.validation.masterRequired': '마스터 비밀번호를 입력하세요.',
  'databaseUnlock.validation.pinRequired': 'PIN {count}자리를 모두 입력하세요.',
  'databaseUnlock.button.changeStorage': '다른 저장소 선택',
  'databaseUnlock.unsupportedMessage':
    '이 백엔드에는 암호화되지 않은 데이터베이스가 있는 것으로 보입니다.',
  'databaseUnlock.recovery.modeLabel': '잠금 해제 모드',
  'databaseUnlock.recovery.unlockOnly': '잠금 해제만',
  'databaseUnlock.recovery.savePin': 'PIN 저장',
  'databaseUnlock.recovery.withPinDescription':
    '새 기기 키를 추가하여 다음부터는 빠른 잠금 해제 PIN을 사용할 수 있습니다.',
  'databaseUnlock.recovery.masterOnlyDescription':
    '마스터 비밀번호로만 잠금을 해제하며 기기 키 레지스트리는 변경하지 않습니다.',
  'databaseUnlock.masterPassword.label': '마스터 비밀번호',
  'databaseUnlock.masterPassword.placeholder': '마스터 비밀번호를 입력하세요',
  'databaseUnlock.pin.label': '빠른 잠금 해제 PIN',
  'databaseUnlock.pin.newLabel': '새 빠른 잠금 해제 PIN',
  'databaseUnlock.pin.hint':
    'PIN은 이 기기에서만 사용되며, 마스터 비밀번호를 다시 입력하지 않고 데이터베이스를 잠금 해제할 수 있습니다.',
  'databaseUnlock.button.createWithoutPassword': '비밀번호 없이 데이터베이스 만들기',

  'databaseSettings.title': '데이터베이스 설정',
  'databaseSettings.tab.overview': '개요',
  'databaseSettings.tab.encryption': '암호화',
  'databaseSettings.tab.devices': '기기',
  'databaseSettings.status.refreshing': '데이터베이스 메타데이터를 새로 고치는 중...',
  'databaseSettings.error.inspectFallback':
    '데이터베이스 메타데이터를 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.',

  'overviewTab.title': '연결 개요',
  'overviewTab.description':
    '자격 증명이나 기기를 변경하기 전에 이 데이터베이스가 어디에 연결되어 있는지 확인하세요.',
  'overviewTab.storageBackend.title': '저장소 백엔드',
  'overviewTab.databaseState.title': '데이터베이스 상태',
  'overviewTab.uuid.label': 'UUID',
  'overviewTab.uuid.unavailable': '사용할 수 없음',
  'overviewTab.encryption.label': '암호화',
  'overviewTab.encryption.enabled': '사용',
  'overviewTab.encryption.disabled': '사용 안 함',
  'overviewTab.deviceCurrent.label': '현재 기기',
  'overviewTab.deviceCurrent.registered': '등록됨',
  'overviewTab.deviceCurrent.notRegistered': '미등록',
  'overviewTab.registeredDevices.label': '등록된 기기',

  'encryptionTab.title': '암호화 자격 증명',
  'encryptionTab.description':
    '데이터베이스를 다시 만들지 않고 마스터 비밀번호를 변경하고 이 기기의 PIN을 갱신할 수 있습니다.',
  'encryptionTab.noDatabase': '이 저장소 백엔드에서는 아직 데이터베이스가 감지되지 않았습니다.',
  'encryptionTab.section.changeMaster.title': '마스터 비밀번호 변경',
  'encryptionTab.section.changeMaster.description':
    '모든 기기에 대한 암호화 키 래핑 메타데이터를 업데이트합니다.',
  'encryptionTab.field.currentMaster': '현재 마스터 비밀번호',
  'encryptionTab.field.newMaster': '새 마스터 비밀번호',
  'encryptionTab.field.confirmMaster': '새 비밀번호 확인',
  'encryptionTab.validation.currentMasterRequired': '현재 마스터 비밀번호를 입력하세요.',
  'encryptionTab.validation.newMasterRequired': '새 마스터 비밀번호를 입력하세요.',
  'encryptionTab.validation.confirmMismatch': '새 마스터 비밀번호와 확인 값이 일치하지 않습니다.',
  'encryptionTab.validation.mustDiffer': '현재 비밀번호와 다른 비밀번호를 사용하세요.',
  'encryptionTab.success.masterUpdated': '마스터 비밀번호가 업데이트되었습니다.',
  'encryptionTab.error.updateMasterFallback':
    '마스터 비밀번호를 업데이트하지 못했습니다. 다시 시도해 주세요.',
  'encryptionTab.button.updateMaster': '마스터 비밀번호 업데이트',
  'encryptionTab.section.updatePin.title': '빠른 잠금 해제 PIN 업데이트',
  'encryptionTab.section.updatePin.description':
    '이 기기의 로컬 빠른 잠금 해제 자격 증명을 업데이트합니다.',
  'encryptionTab.field.pinMaster': '마스터 비밀번호',
  'encryptionTab.pin.labelNew': '새 빠른 잠금 해제 PIN',
  'encryptionTab.pin.hintNew':
    '기억하기 쉬운 PIN을 사용하세요. 이 기기에서만 잠금 해제에 사용됩니다.',
  'encryptionTab.validation.pinMasterRequired':
    '빠른 잠금 해제 PIN을 변경하려면 마스터 비밀번호를 입력하세요.',
  'encryptionTab.validation.pinIncomplete': '두 PIN 입력란 모두에 {count}자리를 입력하세요.',
  'encryptionTab.success.pinUpdated': '이 기기의 빠른 잠금 해제 PIN이 업데이트되었습니다.',
  'encryptionTab.error.updatePinFallback':
    '빠른 잠금 해제 PIN을 업데이트하지 못했습니다. 다시 시도해 주세요.',
  'encryptionTab.button.updatePin': '빠른 잠금 해제 PIN 업데이트',
  'encryptionTab.unencryptedNotice':
    '이 데이터베이스는 암호화되어 있지 않습니다. 암호화 자격 증명 제어를 사용할 수 없습니다.',

  'devicesTab.title': '신뢰된 기기',
  'devicesTab.description':
    '더 이상 이 데이터베이스 잠금 해제에 사용하면 안 되는 기기 키를 제거하세요.',
  'devicesTab.noDatabase': '이 저장소 백엔드에서는 아직 데이터베이스가 감지되지 않았습니다.',
  'devicesTab.confirmRemove':
    '이 기기의 빠른 잠금 해제 접근을 제거할까요? 다시 잠금 해제하려면 마스터 비밀번호 복구가 필요합니다.',
  'devicesTab.error.removeFallback': '이 기기를 제거하지 못했습니다. 다시 시도해 주세요.',
  'devicesTab.empty': '등록된 빠른 잠금 해제 기기가 아직 없습니다.',
  'devicesTab.field.idPrefix': 'ID: {id}',
  'devicesTab.field.lastUsed': '마지막 사용: {value}',
  'devicesTab.badge.current': '현재 기기',
  'devicesTab.button.remove': '제거',
  'devicesTab.button.removing': '제거 중...',
  'devicesTab.unencryptedNotice':
    '기기 레지스트리는 암호화된 데이터베이스에서만 사용할 수 있습니다.',

  'exportTab.title': '내보내기 및 가져오기',
  'exportTab.description':
    'JSON 백업 워크플로를 준비합니다. 실제 동작 연결은 의도적으로 앱 구현에 맡깁니다.',
  'exportTab.section.export.title': 'JSON 내보내기',
  'exportTab.section.export.description':
    '현재 데이터베이스 상태를 JSON 페이로드로 다운로드해 수동 백업 및 감사를 수행하세요.',
  'exportTab.button.export': 'JSON 내보내기',
  'exportTab.section.import.title': 'JSON 가져오기',
  'exportTab.section.import.description':
    '향후 구현에서 내보낸 JSON 파일로 데이터베이스 데이터를 복원합니다.',
  'exportTab.button.import': 'JSON 가져오기',

  'storageOverview.custom.backendLabel': '커스텀 백엔드',
  'storageOverview.custom.detailLabel': '연결 정보',
  'storageOverview.custom.detailValue': '이 저장소 어댑터에서는 노출되지 않음',
  'storageOverview.custom.description':
    '이 저장소 어댑터는 자체 설명 메타데이터를 제공하지 않습니다. 연결 정보는 호스트 앱에서 관리합니다.',
  'storageOverview.webdav.backendLabel': 'WebDAV',
  'storageOverview.webdav.detailLabel': '엔드포인트',
  'storageOverview.webdav.description':
    '데이터베이스가 원격 WebDAV 엔드포인트를 통해 읽기/쓰기를 수행합니다.',
  'storageOverview.s3.provider.r2': 'Cloudflare R2',
  'storageOverview.s3.provider.minio': 'MinIO',
  'storageOverview.s3.provider.s3': 'Amazon S3',
  'storageOverview.s3.provider.unknown': '알 수 없음',
  'storageOverview.s3.detailLabel': '버킷 / 프리픽스',
  'storageOverview.s3.description':
    '데이터베이스가 S3 호환 엔드포인트({endpoint}, {region})를 통해 읽기/쓰기를 수행합니다.',
  'storageOverview.filesystem.opfs.backendLabel': 'Origin Private File System',
  'storageOverview.filesystem.access.backendLabel': 'FileSystem Access API',
  'storageOverview.filesystem.detailLabel': '디렉터리',
  'storageOverview.filesystem.opfs.description':
    '데이터베이스가 이 오리진의 브라우저 관리 비공개 저장소에 저장됩니다.',
  'storageOverview.filesystem.access.description':
    '데이터베이스가 사용자가 선택한 로컬 디렉터리에 저장됩니다.',

  'icon.storage.filesystem': 'FileSystem Access API',
  'icon.storage.opfs': 'OPFS',
  'icon.storage.webdav': 'WebDAV',
  'icon.storage.s3': 'S3 호환',
  'icon.directory.folder': '폴더',
  'icon.directory.up': '위로',
  'icon.directory.newFolder': '새 폴더',
  'icon.directory.refresh': '새로고침',
  'icon.settings.overview': '개요',
  'icon.settings.encryption': '암호화',
  'icon.settings.devices': '기기',
  'icon.settings.export': '내보내기',
} as const;
