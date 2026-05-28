import { GOOGLE_CLIENT_ID, DRIVE_SCOPE } from '../config/google';

let tokenClient = null;
let _accessToken = null;
let _onToken = null;

export function initGoogleAuth(onToken) {
  _onToken = onToken;
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
          _accessToken = resp.access_token;
          _onToken?.(_accessToken);
        }
      },
    });
  };
  tryInit();
}

export function signIn() {
  tokenClient?.requestAccessToken({ prompt: 'consent' });
}

export function signOut() {
  if (_accessToken) {
    window.google?.accounts?.oauth2?.revoke(_accessToken, () => {});
    _accessToken = null;
  }
}

export function getAccessToken() {
  return _accessToken;
}
