import { en } from './en';
import type { ClxUIMessageCatalog } from './en';

export const ko: ClxUIMessageCatalog = {
  ...en,
  'storagePicker.corsGuide.title': '이 스토리지는 CORS 설정이 필요합니다',
  'storagePicker.corsGuide.description':
    '이 스토리지를 사용하려면 CORS 규칙에 이 앱의 오리진을 허용해 주세요.',
  'storagePicker.corsGuide.button.open': '가이드',
  'storagePicker.corsGuide.popupBlocked':
    '브라우저에서 팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도해 주세요.',
};
