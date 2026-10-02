// SPEC.md 22.7: a readable device line - "as the device reports it".
// Pure, so it can be tested with any device's details.
// Known limits: iPadOS reports itself as a Mac (told apart by touch
// support); Chrome on Android reports "Android 10" and no model for privacy.
export function describeDevice({ userAgent = '', platform = '', maxTouchPoints = 0, standalone = false } = {}) {
  const ua = userAgent;
  let device = '';
  let os = '';
  const ios = /\b(iPhone|iPad|iPod)\b.*?OS (\d+)[_.](\d+)/.exec(ua);
  const isIpadAsMac = /Macintosh/.test(ua) && maxTouchPoints > 1;
  if (ios) {
    device = ios[1] === 'iPod' ? 'iPod' : ios[1];
    os = `iOS ${ios[2]}.${ios[3]}`;
  } else if (isIpadAsMac) {
    device = 'iPad';
    const v = /Version\/(\d+)\.(\d+)/.exec(ua);
    os = v ? `iPadOS ${v[1]}.${v[2]}` : 'iPadOS';
  } else if (/Android/.test(ua)) {
    const v = /Android (\d+(?:\.\d+)?)/.exec(ua);
    device = /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
    os = v ? `Android ${v[1]}` : 'Android';
  } else if (/Windows NT/.test(ua)) {
    device = 'Computer';
    os = 'Windows';
  } else if (/Macintosh|Mac OS X/.test(ua) || /Mac/.test(platform)) {
    device = 'Mac';
    os = 'macOS';
  } else if (/Linux/.test(ua)) {
    device = 'Computer';
    os = 'Linux';
  }
  let browser = '';
  if (/EdgA?\/(\d+)/.test(ua)) browser = `Edge ${/EdgA?\/(\d+)/.exec(ua)[1]}`;
  else if (/SamsungBrowser\/(\d+)/.test(ua)) browser = `Samsung Internet ${/SamsungBrowser\/(\d+)/.exec(ua)[1]}`;
  else if (/(?:Chrome|CriOS)\/(\d+)/.test(ua)) browser = `Chrome ${/(?:Chrome|CriOS)\/(\d+)/.exec(ua)[1]}`;
  else if (/(?:Firefox|FxiOS)\/(\d+)/.test(ua)) browser = `Firefox ${/(?:Firefox|FxiOS)\/(\d+)/.exec(ua)[1]}`;
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return { device: device || '?', os: os || '?', browser: browser || '?', installed: Boolean(standalone) };
}

export function currentDevice() {
  const standalone = (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) || navigator.standalone === true;
  return describeDevice({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    standalone,
  });
}
