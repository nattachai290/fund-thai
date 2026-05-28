import { GOOGLE_CLIENT_ID, DRIVE_SCOPE } from '../config/google';

const TOKEN_KEY = 'sec_gtoken';
const EXPIRY_KEY = 'sec_gtoken_exp';

let tokenClient = null;
let _accessToken = null;
let _onToken = null;

function saveToken(token) {
  _accessToken = token;
  // Google token อายุ 1 ชั่วโมง — เก็บ expiry ไว้ 55 นาที เผื่อ buffer
  const exp = Date.now() + 55 * 60 * 1000;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, String(exp));
}

function loadCachedToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  const exp = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
  if (token && Date.now() < exp) return token;
  return null;
}

function clearToken() {
  _accessToken = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

export function initGoogleAuth(onToken) {
  _onToken = onToken;

  // ลองใช้ cached token ก่อน
  const cached = loadCachedToken();
  if (cached) {
    _accessToken = cached;
    onToken(cached);
    return;
  }

  const tryInit = () => {
    if (!window.google?.accounts?.oauth2) {
      setTimeout(tryInit, 200);
      return;
    }
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.access_token) {
          saveToken(resp.access_token);
          _onToken?.(resp.access_token);
        }
      },
    });

    // ลอง silent refresh — ไม่แสดง popup ถ้า session ยัง active
    tokenClient.requestAccessToken({ prompt: '' });
  };
  tryInit();
}

export function signIn() {
  if (!tokenClient) return;
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

export function signOut() {
  if (_accessToken) {
    window.google?.accounts?.oauth2?.revoke(_accessToken, () => {});
  }
  clearToken();
}

export function getAccessToken() {
  return _accessToken;
}
