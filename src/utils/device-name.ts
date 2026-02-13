export const getFriendlyDeviceName = async () => {
  const ua = navigator.userAgent;
  let model = '';
  let os = 'Unknown OS';
  let browser = 'Unknown Browser';

  if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    try {
      const hints = await navigator.userAgentData.getHighEntropyValues([
        'model',
        'platform',
        'platformVersion',
        'uaFullVersion',
      ]);
      model = hints.model;
      os = hints.platform;
    } catch {
      // Ignore
    }
  }

  if (!os || os === 'Unknown OS') {
    if (/android/i.test(ua)) {
      os = 'Android';
    } else if (/iPad|iPhone|iPod/.test(ua)) {
      os = 'iOS';
    } else if (/Macintosh/i.test(ua)) {
      os = 'macOS';
    } else if (/Windows/i.test(ua)) {
      os = 'Windows';
    } else if (/Linux/i.test(ua)) {
      os = 'Linux';
    }
  }

  if (/Edg/i.test(ua)) {
    browser = 'Edge';
  } else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox/i.test(ua)) {
    browser = 'Firefox';
  }

  let displayName = '';
  if (model && model !== '') {
    displayName = model;
  } else {
    displayName = `${os} ${browser}`;
  }

  return displayName.trim() || 'Unknown Device';
};
