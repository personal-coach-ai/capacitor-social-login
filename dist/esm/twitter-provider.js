var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import { BaseSocialLogin } from './base';
export class TwitterSocialLogin extends BaseSocialLogin {
    constructor() {
        super(...arguments);
        this.clientId = null;
        this.redirectUrl = null;
        this.defaultScopes = ['tweet.read', 'users.read'];
        this.forceLogin = false;
        this.TOKENS_KEY = 'capgo_social_login_twitter_tokens_v1';
        this.STATE_PREFIX = 'capgo_social_login_twitter_state_';
    }
    async initialize(clientId, redirectUrl, defaultScopes, forceLogin, audience) {
        this.clientId = clientId;
        this.redirectUrl = redirectUrl !== null && redirectUrl !== void 0 ? redirectUrl : null;
        if (defaultScopes === null || defaultScopes === void 0 ? void 0 : defaultScopes.length) {
            this.defaultScopes = defaultScopes;
        }
        this.forceLogin = forceLogin !== null && forceLogin !== void 0 ? forceLogin : false;
        this.audience = audience !== null && audience !== void 0 ? audience : undefined;
    }
    async login(options) {
        var _a, _b, _c, _d, _e, _f;
        if (!this.clientId) {
            throw new Error('Twitter Client ID not configured. Call initialize() first.');
        }
        const redirectUri = (_b = (_a = options.redirectUrl) !== null && _a !== void 0 ? _a : this.redirectUrl) !== null && _b !== void 0 ? _b : window.location.origin + window.location.pathname;
        const scopes = ((_c = options.scopes) === null || _c === void 0 ? void 0 : _c.length) ? options.scopes : this.defaultScopes;
        const state = (_d = options.state) !== null && _d !== void 0 ? _d : this.generateState();
        const codeVerifier = (_e = options.codeVerifier) !== null && _e !== void 0 ? _e : this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);
        this.persistPendingLogin(state, {
            codeVerifier,
            redirectUri,
            scopes,
        });
        localStorage.setItem(BaseSocialLogin.OAUTH_STATE_KEY, JSON.stringify({ provider: 'twitter', state }));
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: redirectUri,
            scope: scopes.join(' '),
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
        });
        if (((_f = options.forceLogin) !== null && _f !== void 0 ? _f : this.forceLogin) === true) {
            params.set('force_login', 'true');
        }
        if (this.audience) {
            params.set('audience', this.audience);
        }
        const authUrl = `https://x.com/i/oauth2/authorize?${params.toString()}`;
        const width = 500;
        const height = 650;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(authUrl, 'XLogin', `width=${width},height=${height},left=${left},top=${top},popup=1`);
        return new Promise((resolve, reject) => {
            if (!popup) {
                reject(new Error('Unable to open login window. Please allow popups.'));
                return;
            }
            const cleanup = (messageHandler, timeoutHandle, intervalHandle) => {
                window.removeEventListener('message', messageHandler);
                clearTimeout(timeoutHandle);
                clearInterval(intervalHandle);
            };
            const messageHandler = (event) => {
                var _a, _b, _c, _d;
                if (event.origin !== window.location.origin) {
                    return;
                }
                if (((_a = event.data) === null || _a === void 0 ? void 0 : _a.type) === 'oauth-response') {
                    if (((_b = event.data) === null || _b === void 0 ? void 0 : _b.provider) && event.data.provider !== 'twitter') {
                        return;
                    }
                    cleanup(messageHandler, timeoutHandle, popupClosedInterval);
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const _e = event.data, { provider: _ignoredProvider } = _e, payload = __rest(_e, ["provider"]);
                    resolve({
                        provider: 'twitter',
                        result: payload,
                    });
                }
                else if (((_c = event.data) === null || _c === void 0 ? void 0 : _c.type) === 'oauth-error') {
                    if (((_d = event.data) === null || _d === void 0 ? void 0 : _d.provider) && event.data.provider !== 'twitter') {
                        return;
                    }
                    cleanup(messageHandler, timeoutHandle, popupClosedInterval);
                    reject(new Error(event.data.error || 'Twitter login was cancelled.'));
                }
            };
            window.addEventListener('message', messageHandler);
            const timeoutHandle = window.setTimeout(() => {
                window.removeEventListener('message', messageHandler);
                popup.close();
                reject(new Error('Twitter login timed out.'));
            }, 300000);
            const popupClosedInterval = window.setInterval(() => {
                if (popup.closed) {
                    window.removeEventListener('message', messageHandler);
                    clearInterval(popupClosedInterval);
                    clearTimeout(timeoutHandle);
                    reject(new Error('Twitter login window was closed.'));
                }
            }, 1000);
        });
    }
    async logout() {
        localStorage.removeItem(this.TOKENS_KEY);
    }
    async isLoggedIn() {
        const tokens = this.getStoredTokens();
        if (!tokens) {
            return { isLoggedIn: false };
        }
        const isValid = tokens.expiresAt > Date.now();
        if (!isValid) {
            localStorage.removeItem(this.TOKENS_KEY);
        }
        return { isLoggedIn: isValid };
    }
    async getAuthorizationCode() {
        const tokens = this.getStoredTokens();
        if (!tokens) {
            throw new Error('Twitter access token is not available.');
        }
        return {
            accessToken: tokens.accessToken,
        };
    }
    async refresh() {
        const tokens = this.getStoredTokens();
        if (!(tokens === null || tokens === void 0 ? void 0 : tokens.refreshToken)) {
            throw new Error('No Twitter refresh token is available. Include offline.access scope to receive one.');
        }
        await this.refreshWithRefreshToken(tokens.refreshToken);
    }
    async handleOAuthRedirect(url, expectedState) {
        const params = url.searchParams;
        const stateFromUrl = expectedState !== null && expectedState !== void 0 ? expectedState : params.get('state');
        if (!stateFromUrl) {
            return null;
        }
        const pending = this.consumePendingLogin(stateFromUrl);
        if (!pending) {
            localStorage.removeItem(BaseSocialLogin.OAUTH_STATE_KEY);
            return { error: 'Twitter login session expired or state mismatch.' };
        }
        const error = params.get('error');
        if (error) {
            localStorage.removeItem(BaseSocialLogin.OAUTH_STATE_KEY);
            return { error: params.get('error_description') || error };
        }
        const code = params.get('code');
        if (!code) {
            localStorage.removeItem(BaseSocialLogin.OAUTH_STATE_KEY);
            return { error: 'Twitter authorization code missing from redirect.' };
        }
        try {
            const tokens = await this.exchangeAuthorizationCode(code, pending);
            const profile = await this.fetchProfile(tokens.access_token);
            const expiresAt = Date.now() + tokens.expires_in * 1000;
            const scopeArray = tokens.scope.split(' ').filter(Boolean);
            this.persistTokens({
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt,
                scope: scopeArray,
                tokenType: tokens.token_type,
                userId: profile.id,
                profile,
            });
            return {
                provider: 'twitter',
                result: {
                    accessToken: {
                        token: tokens.access_token,
                        tokenType: tokens.token_type,
                        expires: new Date(expiresAt).toISOString(),
                        userId: profile.id,
                    },
                    refreshToken: tokens.refresh_token,
                    scope: scopeArray,
                    tokenType: tokens.token_type,
                    expiresIn: tokens.expires_in,
                    profile,
                },
            };
        }
        catch (err) {
            if (err instanceof Error) {
                return { error: err.message };
            }
            return { error: 'Twitter login failed unexpectedly.' };
        }
        finally {
            localStorage.removeItem(BaseSocialLogin.OAUTH_STATE_KEY);
        }
    }
    async exchangeAuthorizationCode(code, pending) {
        var _a;
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: (_a = this.clientId) !== null && _a !== void 0 ? _a : '',
            code,
            redirect_uri: pending.redirectUri,
            code_verifier: pending.codeVerifier,
        });
        const response = await fetch('https://api.x.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Twitter token exchange failed (${response.status}): ${text}`);
        }
        return (await response.json());
    }
    async refreshWithRefreshToken(refreshToken) {
        var _a, _b;
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: (_a = this.clientId) !== null && _a !== void 0 ? _a : '',
        });
        const response = await fetch('https://api.x.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Twitter refresh failed (${response.status}): ${text}`);
        }
        const tokens = (await response.json());
        const profile = await this.fetchProfile(tokens.access_token);
        const expiresAt = Date.now() + tokens.expires_in * 1000;
        const scopeArray = tokens.scope.split(' ').filter(Boolean);
        this.persistTokens({
            accessToken: tokens.access_token,
            refreshToken: (_b = tokens.refresh_token) !== null && _b !== void 0 ? _b : refreshToken,
            expiresAt,
            scope: scopeArray,
            tokenType: tokens.token_type,
            userId: profile.id,
            profile,
        });
    }
    async fetchProfile(accessToken) {
        var _a, _b, _c, _d;
        const fields = ['profile_image_url', 'verified', 'name', 'username'];
        const response = await fetch(`https://api.x.com/2/users/me?user.fields=${fields.join(',')}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Unable to fetch Twitter profile (${response.status}): ${text}`);
        }
        const payload = (await response.json());
        if (!payload.data) {
            throw new Error('Twitter profile payload is missing data.');
        }
        return {
            id: payload.data.id,
            username: payload.data.username,
            name: (_a = payload.data.name) !== null && _a !== void 0 ? _a : null,
            profileImageUrl: (_b = payload.data.profile_image_url) !== null && _b !== void 0 ? _b : null,
            verified: (_c = payload.data.verified) !== null && _c !== void 0 ? _c : false,
            email: (_d = payload.data.email) !== null && _d !== void 0 ? _d : null,
        };
    }
    persistTokens(tokens) {
        localStorage.setItem(this.TOKENS_KEY, JSON.stringify(tokens));
    }
    getStoredTokens() {
        const raw = localStorage.getItem(this.TOKENS_KEY);
        if (!raw) {
            return null;
        }
        try {
            return JSON.parse(raw);
        }
        catch (err) {
            console.warn('Failed to parse stored Twitter tokens', err);
            return null;
        }
    }
    persistPendingLogin(state, payload) {
        localStorage.setItem(`${this.STATE_PREFIX}${state}`, JSON.stringify(payload));
    }
    consumePendingLogin(state) {
        const key = `${this.STATE_PREFIX}${state}`;
        const raw = localStorage.getItem(key);
        localStorage.removeItem(key);
        if (!raw) {
            return null;
        }
        try {
            return JSON.parse(raw);
        }
        catch (err) {
            console.warn('Failed to parse pending Twitter login payload', err);
            return null;
        }
    }
    generateState() {
        return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    generateCodeVerifier() {
        const array = new Uint8Array(64);
        crypto.getRandomValues(array);
        return Array.from(array)
            .map((b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~'[b % 66])
            .join('');
    }
    async generateCodeChallenge(codeVerifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return this.base64UrlEncode(new Uint8Array(digest));
    }
    base64UrlEncode(buffer) {
        let binary = '';
        buffer.forEach((b) => (binary += String.fromCharCode(b)));
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
}
//# sourceMappingURL=twitter-provider.js.map