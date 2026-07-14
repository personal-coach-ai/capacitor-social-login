var capacitorCapacitorUpdater = (function (exports, core) {
    'use strict';

    const SocialLogin = core.registerPlugin('SocialLogin', {
        web: () => Promise.resolve().then(function () { return web; }).then((m) => new m.SocialLoginWeb()),
    });

    class BaseSocialLogin extends core.WebPlugin {
        constructor() {
            super();
        }
        parseJwt(token) {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64)
                .split('')
                .map((c) => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            })
                .join(''));
            return JSON.parse(jsonPayload);
        }
        async loadScript(src) {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.async = true;
                script.onload = () => {
                    resolve();
                };
                script.onerror = reject;
                document.body.appendChild(script);
            });
        }
    }
    BaseSocialLogin.OAUTH_STATE_KEY = 'social_login_oauth_pending';

    class AppleSocialLogin extends BaseSocialLogin {
        constructor() {
            super(...arguments);
            this.clientId = null;
            this.redirectUrl = null;
            this.scriptLoaded = false;
            this.scriptUrl = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
            this.useProperTokenExchange = false;
        }
        async initialize(clientId, redirectUrl, useProperTokenExchange = false) {
            this.clientId = clientId;
            this.redirectUrl = redirectUrl || null;
            this.useProperTokenExchange = useProperTokenExchange;
            if (clientId) {
                await this.loadAppleScript();
            }
        }
        async login(options) {
            if (!this.clientId) {
                throw new Error('Apple Client ID not set. Call initialize() first.');
            }
            if (!this.scriptLoaded) {
                throw new Error('Apple Sign-In script not loaded.');
            }
            return new Promise((resolve, reject) => {
                var _a, _b;
                AppleID.auth.init({
                    clientId: (_a = this.clientId) !== null && _a !== void 0 ? _a : '',
                    scope: ((_b = options.scopes) === null || _b === void 0 ? void 0 : _b.join(' ')) || 'name email',
                    redirectURI: this.redirectUrl || window.location.href,
                    state: options.state,
                    nonce: options.nonce,
                    usePopup: true,
                });
                AppleID.auth
                    .signIn()
                    .then((res) => {
                    var _a, _b, _c, _d, _e;
                    let accessToken = null;
                    if (this.useProperTokenExchange) {
                        // When using proper token exchange, the authorization code should be exchanged
                        // for a proper access token on the backend. For now, we set accessToken to null
                        // and provide the authorization code in a separate field for backend processing.
                        accessToken = null;
                    }
                    else {
                        // Legacy behavior: use authorization code as access token for backward compatibility
                        accessToken = {
                            token: res.authorization.code || '',
                        };
                    }
                    const result = Object.assign({ profile: {
                            user: res.user || '',
                            email: ((_a = res.user) === null || _a === void 0 ? void 0 : _a.email) || null,
                            givenName: ((_c = (_b = res.user) === null || _b === void 0 ? void 0 : _b.name) === null || _c === void 0 ? void 0 : _c.firstName) || null,
                            familyName: ((_e = (_d = res.user) === null || _d === void 0 ? void 0 : _d.name) === null || _e === void 0 ? void 0 : _e.lastName) || null,
                        }, accessToken: accessToken, idToken: res.authorization.id_token || null }, (this.useProperTokenExchange && { authorizationCode: res.authorization.code }));
                    resolve({ provider: 'apple', result });
                })
                    .catch((error) => {
                    reject(error);
                });
            });
        }
        async logout() {
            // Apple doesn't provide a logout method for web
            console.log('Apple logout: Session should be managed on the client side');
        }
        async isLoggedIn() {
            // Apple doesn't provide a method to check login status on web
            console.log('Apple login status should be managed on the client side');
            return { isLoggedIn: false };
        }
        async getAuthorizationCode() {
            // Apple authorization code should be obtained during login
            console.log('Apple authorization code should be stored during login');
            throw new Error('Apple authorization code not available');
        }
        async refresh() {
            // Apple doesn't provide a refresh method for web
            console.log('Apple refresh not available on web');
        }
        async loadAppleScript() {
            if (this.scriptLoaded)
                return;
            return this.loadScript(this.scriptUrl).then(() => {
                this.scriptLoaded = true;
            });
        }
    }

    class FacebookSocialLogin extends BaseSocialLogin {
        constructor() {
            super(...arguments);
            this.appId = null;
            this.scriptLoaded = false;
            this.locale = 'en_US';
        }
        async initialize(appId, locale) {
            this.appId = appId;
            if (locale) {
                this.locale = locale;
            }
            if (appId) {
                // Load with the specified locale or default
                await this.loadFacebookScript(this.locale);
                FB.init({
                    appId: this.appId,
                    version: 'v17.0',
                    xfbml: true,
                    cookie: true,
                });
            }
        }
        async login(options) {
            if (!this.appId) {
                throw new Error('Facebook App ID not set. Call initialize() first.');
            }
            return new Promise((resolve, reject) => {
                FB.login((response) => {
                    if (response.status === 'connected') {
                        FB.api('/me', { fields: 'id,name,email,picture' }, (userInfo) => {
                            var _a, _b;
                            const result = {
                                accessToken: {
                                    token: response.authResponse.accessToken,
                                    userId: response.authResponse.userID,
                                },
                                profile: {
                                    userID: userInfo.id,
                                    name: userInfo.name,
                                    email: userInfo.email || null,
                                    imageURL: ((_b = (_a = userInfo.picture) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.url) || null,
                                    friendIDs: [],
                                    birthday: null,
                                    ageRange: null,
                                    gender: null,
                                    location: null,
                                    hometown: null,
                                    profileURL: null,
                                },
                                idToken: null,
                            };
                            resolve({ provider: 'facebook', result });
                        });
                    }
                    else {
                        reject(new Error('Facebook login failed'));
                    }
                }, { scope: options.permissions.join(',') });
            });
        }
        async logout() {
            return new Promise((resolve) => {
                FB.logout(() => resolve());
            });
        }
        async isLoggedIn() {
            return new Promise((resolve) => {
                FB.getLoginStatus((response) => {
                    resolve({ isLoggedIn: response.status === 'connected' });
                });
            });
        }
        async getAuthorizationCode() {
            return new Promise((resolve, reject) => {
                FB.getLoginStatus((response) => {
                    var _a;
                    if (response.status === 'connected') {
                        resolve({ accessToken: ((_a = response.authResponse) === null || _a === void 0 ? void 0 : _a.accessToken) || '' });
                    }
                    else {
                        reject(new Error('No Facebook authorization code available'));
                    }
                });
            });
        }
        async refresh(options) {
            await this.login(options);
        }
        async loadFacebookScript(locale) {
            if (this.scriptLoaded)
                return;
            // Remove any existing Facebook SDK script
            const existingScript = document.querySelector('script[src*="connect.facebook.net"]');
            if (existingScript) {
                existingScript.remove();
            }
            return this.loadScript(`https://connect.facebook.net/${locale}/sdk.js`).then(() => {
                this.scriptLoaded = true;
            });
        }
    }

    class GoogleSocialLogin extends BaseSocialLogin {
        constructor() {
            super(...arguments);
            this.clientId = null;
            this.loginType = 'online';
            this.GOOGLE_TOKEN_REQUEST_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo';
            this.GOOGLE_STATE_KEY = 'capgo_social_login_google_state';
        }
        async initialize(clientId, mode, hostedDomain, redirectUrl) {
            this.clientId = clientId;
            if (mode) {
                this.loginType = mode;
            }
            this.hostedDomain = hostedDomain;
            this.redirectUrl = redirectUrl;
        }
        async login(options) {
            if (!this.clientId) {
                throw new Error('Google Client ID not set. Call initialize() first.');
            }
            let scopes = options.scopes || [];
            if (scopes.length > 0) {
                // If scopes are provided, directly use the traditional OAuth flow
                if (!scopes.includes('https://www.googleapis.com/auth/userinfo.email')) {
                    scopes.push('https://www.googleapis.com/auth/userinfo.email');
                }
                if (!scopes.includes('https://www.googleapis.com/auth/userinfo.profile')) {
                    scopes.push('https://www.googleapis.com/auth/userinfo.profile');
                }
                if (!scopes.includes('openid')) {
                    scopes.push('openid');
                }
            }
            else {
                scopes = [
                    'https://www.googleapis.com/auth/userinfo.email',
                    'https://www.googleapis.com/auth/userinfo.profile',
                    'openid',
                ];
            }
            const nonce = options.nonce || Math.random().toString(36).substring(2);
            // If scopes are provided, directly use the traditional OAuth flow
            return this.traditionalOAuth({
                scopes,
                nonce,
                hostedDomain: this.hostedDomain,
                prompt: options.prompt,
            });
        }
        async logout() {
            if (this.loginType === 'offline') {
                return Promise.reject("Offline login doesn't store tokens. logout is not available");
            }
            // eslint-disable-next-line
            const state = this.getGoogleState();
            if (!state)
                return;
            await this.rawLogoutGoogle(state.accessToken);
        }
        async isLoggedIn() {
            if (this.loginType === 'offline') {
                return Promise.reject("Offline login doesn't store tokens. isLoggedIn is not available");
            }
            // eslint-disable-next-line
            const state = this.getGoogleState();
            if (!state)
                return { isLoggedIn: false };
            try {
                const isValidAccessToken = await this.accessTokenIsValid(state.accessToken);
                const isValidIdToken = this.idTokenValid(state.idToken);
                if (isValidAccessToken && isValidIdToken) {
                    return { isLoggedIn: true };
                }
                else {
                    try {
                        await this.rawLogoutGoogle(state.accessToken, false);
                    }
                    catch (e) {
                        console.error('Access token is not valid, but cannot logout', e);
                    }
                    return { isLoggedIn: false };
                }
            }
            catch (e) {
                return Promise.reject(e);
            }
        }
        async getAuthorizationCode() {
            if (this.loginType === 'offline') {
                return Promise.reject("Offline login doesn't store tokens. getAuthorizationCode is not available");
            }
            // eslint-disable-next-line
            const state = this.getGoogleState();
            if (!state)
                throw new Error('No Google authorization code available');
            try {
                const isValidAccessToken = await this.accessTokenIsValid(state.accessToken);
                const isValidIdToken = this.idTokenValid(state.idToken);
                if (isValidAccessToken && isValidIdToken) {
                    return { accessToken: state.accessToken, jwt: state.idToken };
                }
                else {
                    try {
                        await this.rawLogoutGoogle(state.accessToken, false);
                    }
                    catch (e) {
                        console.error('Access token is not valid, but cannot logout', e);
                    }
                    throw new Error('No Google authorization code available');
                }
            }
            catch (e) {
                return Promise.reject(e);
            }
        }
        async refresh() {
            // For Google, we can prompt for re-authentication
            return Promise.reject('Not implemented');
        }
        handleOAuthRedirect(url) {
            const paramsRaw = url.searchParams;
            // Check for errors in search params first (for offline mode)
            const errorInParams = paramsRaw.get('error');
            if (errorInParams) {
                localStorage.removeItem(BaseSocialLogin.OAUTH_STATE_KEY);
                const errorDescription = paramsRaw.get('error_description') || errorInParams;
                return { error: errorDescription };
            }
            const code = paramsRaw.get('code');
            if (code && paramsRaw.has('scope')) {
                return {
                    provider: 'google',
                    result: {
                        serverAuthCode: code,
                        responseType: 'offline',
                    },
                };
            }
            const hash = url.hash.substring(1);
            console.log('handleOAuthRedirect', url.hash);
            if (!hash)
                return null;
            const params = new URLSearchParams(hash);
            // Check for error cases in hash (e.g., user cancelled)
            const error = params.get('error');
            if (error) {
                localStorage.removeItem(BaseSocialLogin.OAUTH_STATE_KEY);
                const errorDescription = params.get('error_description') || error;
                return { error: errorDescription };
            }
            console.log('handleOAuthRedirect ok');
            const accessToken = params.get('access_token');
            const idToken = params.get('id_token');
            if (accessToken && idToken) {
                localStorage.removeItem(BaseSocialLogin.OAUTH_STATE_KEY);
                const profile = this.parseJwt(idToken);
                return {
                    provider: 'google',
                    result: {
                        accessToken: {
                            token: accessToken,
                        },
                        idToken,
                        profile: {
                            email: profile.email || null,
                            familyName: profile.family_name || null,
                            givenName: profile.given_name || null,
                            id: profile.sub || null,
                            name: profile.name || null,
                            imageUrl: profile.picture || null,
                        },
                        responseType: 'online',
                    },
                };
            }
            return null;
        }
        async accessTokenIsValid(accessToken) {
            const url = `${this.GOOGLE_TOKEN_REQUEST_URL}?access_token=${encodeURIComponent(accessToken)}`;
            try {
                // Make the GET request using fetch
                const response = await fetch(url);
                // Check if the response is successful
                if (!response.ok) {
                    console.log(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response not successful. Status code: ${response.status}. Assuming that the token is not valid`);
                    return false;
                }
                // Get the response body as text
                const responseBody = await response.text();
                if (!responseBody) {
                    console.error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response body is null`);
                    throw new Error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response body is null`);
                }
                // Parse the response body as JSON
                let jsonObject;
                try {
                    jsonObject = JSON.parse(responseBody);
                }
                catch (e) {
                    console.error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response body is not valid JSON. Error: ${e}`);
                    throw new Error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response body is not valid JSON. Error: ${e}`);
                }
                // Extract the 'expires_in' field
                const expiresInStr = jsonObject['expires_in'];
                if (expiresInStr === undefined || expiresInStr === null) {
                    console.error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response JSON does not include 'expires_in'.`);
                    throw new Error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response JSON does not include 'expires_in'.`);
                }
                // Parse 'expires_in' as an integer
                let expiresInInt;
                try {
                    expiresInInt = parseInt(expiresInStr, 10);
                    if (isNaN(expiresInInt)) {
                        throw new Error(`'expires_in' is not a valid integer`);
                    }
                }
                catch (e) {
                    console.error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. 'expires_in': ${expiresInStr} is not a valid integer. Error: ${e}`);
                    throw new Error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. 'expires_in': ${expiresInStr} is not a valid integer. Error: ${e}`);
                }
                // Determine if the access token is valid based on 'expires_in'
                return expiresInInt > 5;
            }
            catch (error) {
                console.error(error);
                throw error;
            }
        }
        idTokenValid(idToken) {
            try {
                const parsed = this.parseJwt(idToken);
                const currentTime = Math.ceil(Date.now() / 1000) + 5; // Convert current time to seconds since epoch
                return parsed.exp && currentTime < parsed.exp;
            }
            catch (e) {
                return false;
            }
        }
        async rawLogoutGoogle(accessToken, tokenValid = null) {
            if (tokenValid === null) {
                tokenValid = await this.accessTokenIsValid(accessToken);
            }
            if (tokenValid === true) {
                try {
                    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${encodeURIComponent(accessToken)}`);
                    this.clearStateGoogle();
                }
                catch (e) {
                    // ignore
                }
                return;
            }
            else {
                this.clearStateGoogle();
                return;
            }
        }
        persistStateGoogle(accessToken, idToken) {
            try {
                window.localStorage.setItem(this.GOOGLE_STATE_KEY, JSON.stringify({ accessToken, idToken }));
            }
            catch (e) {
                console.error('Cannot persist state google', e);
            }
        }
        clearStateGoogle() {
            try {
                window.localStorage.removeItem(this.GOOGLE_STATE_KEY);
            }
            catch (e) {
                console.error('Cannot clear state google', e);
            }
        }
        getGoogleState() {
            try {
                const state = window.localStorage.getItem(this.GOOGLE_STATE_KEY);
                if (!state)
                    return null;
                const { accessToken, idToken } = JSON.parse(state);
                return { accessToken, idToken };
            }
            catch (e) {
                console.error('Cannot get state google', e);
                return null;
            }
        }
        async traditionalOAuth({ scopes, hostedDomain, nonce, prompt, }) {
            var _a;
            const uniqueScopes = [...new Set([...(scopes || []), 'openid'])];
            const params = new URLSearchParams(Object.assign(Object.assign({ client_id: (_a = this.clientId) !== null && _a !== void 0 ? _a : '', redirect_uri: this.redirectUrl || window.location.origin + window.location.pathname, response_type: this.loginType === 'offline' ? 'code' : 'token id_token', scope: uniqueScopes.join(' ') }, (nonce && { nonce })), { include_granted_scopes: 'true', state: 'popup' }));
            if (hostedDomain !== undefined) {
                params.append('hd', hostedDomain);
            }
            if (prompt !== undefined) {
                params.append('prompt', prompt);
            }
            const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
            const width = 500;
            const height = 600;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;
            localStorage.setItem(BaseSocialLogin.OAUTH_STATE_KEY, JSON.stringify({ provider: 'google', loginType: this.loginType }));
            const popup = window.open(url, 'Google Sign In', `width=${width},height=${height},left=${left},top=${top},popup=1`);
            let popupClosedInterval;
            let timeoutHandle;
            // This may never return...
            return new Promise((resolve, reject) => {
                if (!popup) {
                    reject(new Error('Failed to open popup'));
                    return;
                }
                const handleMessage = (event) => {
                    var _a, _b, _c, _d;
                    if (event.origin !== window.location.origin || ((_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.source) === null || _b === void 0 ? void 0 : _b.startsWith('angular')))
                        return;
                    if (((_c = event.data) === null || _c === void 0 ? void 0 : _c.type) === 'oauth-response') {
                        window.removeEventListener('message', handleMessage);
                        clearInterval(popupClosedInterval);
                        clearTimeout(timeoutHandle);
                        if (this.loginType === 'online') {
                            const { accessToken, idToken } = event.data;
                            if (accessToken && idToken) {
                                const profile = this.parseJwt(idToken);
                                this.persistStateGoogle(accessToken.token, idToken);
                                resolve({
                                    provider: 'google',
                                    result: {
                                        accessToken: {
                                            token: accessToken.token,
                                        },
                                        idToken,
                                        profile: {
                                            email: profile.email || null,
                                            familyName: profile.family_name || null,
                                            givenName: profile.given_name || null,
                                            id: profile.sub || null,
                                            name: profile.name || null,
                                            imageUrl: profile.picture || null,
                                        },
                                        responseType: 'online',
                                    },
                                });
                            }
                        }
                        else {
                            const { serverAuthCode } = event.data;
                            resolve({
                                provider: 'google',
                                result: {
                                    responseType: 'offline',
                                    serverAuthCode,
                                },
                            });
                        }
                    }
                    else if (((_d = event.data) === null || _d === void 0 ? void 0 : _d.type) === 'oauth-error') {
                        window.removeEventListener('message', handleMessage);
                        clearInterval(popupClosedInterval);
                        clearTimeout(timeoutHandle);
                        const errorMessage = event.data.error || 'User cancelled the OAuth flow';
                        reject(new Error(errorMessage));
                    }
                    // Don't reject for non-OAuth messages, just ignore them
                };
                window.addEventListener('message', handleMessage);
                // Timeout after 5 minutes
                timeoutHandle = setTimeout(() => {
                    clearTimeout(timeoutHandle);
                    window.removeEventListener('message', handleMessage);
                    popup.close();
                    reject(new Error('OAuth timeout'));
                }, 300000);
                popupClosedInterval = setInterval(() => {
                    if (popup.closed) {
                        clearInterval(popupClosedInterval);
                        reject(new Error('Popup closed'));
                    }
                }, 1000);
            });
        }
    }

    var __rest = (undefined && undefined.__rest) || function (s, e) {
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
    class TwitterSocialLogin extends BaseSocialLogin {
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

    class SocialLoginWeb extends core.WebPlugin {
        constructor() {
            super();
            this.googleProvider = new GoogleSocialLogin();
            this.appleProvider = new AppleSocialLogin();
            this.facebookProvider = new FacebookSocialLogin();
            this.twitterProvider = new TwitterSocialLogin();
            // Set up listener for OAuth redirects if we have a pending OAuth flow
            if (localStorage.getItem(SocialLoginWeb.OAUTH_STATE_KEY)) {
                console.log('OAUTH_STATE_KEY found');
                this.handleOAuthRedirect().catch((error) => {
                    console.error('Failed to finish OAuth redirect', error);
                    window.close();
                });
            }
        }
        async handleOAuthRedirect() {
            var _a, _b, _c;
            const url = new URL(window.location.href);
            const stateRaw = localStorage.getItem(SocialLoginWeb.OAUTH_STATE_KEY);
            let provider = null;
            let state;
            if (stateRaw) {
                try {
                    const parsed = JSON.parse(stateRaw);
                    provider = (_a = parsed.provider) !== null && _a !== void 0 ? _a : null;
                    state = parsed.state;
                }
                catch (_d) {
                    provider = stateRaw === 'true' ? 'google' : null;
                }
            }
            let result = null;
            switch (provider) {
                case 'twitter':
                    result = await this.twitterProvider.handleOAuthRedirect(url, state);
                    break;
                case 'google':
                default:
                    result = this.googleProvider.handleOAuthRedirect(url);
                    break;
            }
            if (!result) {
                return;
            }
            if ('error' in result) {
                const resolvedProvider = provider !== null && provider !== void 0 ? provider : null;
                (_b = window.opener) === null || _b === void 0 ? void 0 : _b.postMessage({
                    type: 'oauth-error',
                    provider: resolvedProvider,
                    error: result.error,
                }, window.location.origin);
            }
            else {
                (_c = window.opener) === null || _c === void 0 ? void 0 : _c.postMessage(Object.assign({ type: 'oauth-response', provider: result.provider }, result.result), window.location.origin);
            }
            window.close();
        }
        async initialize(options) {
            var _a, _b, _c, _d;
            const initPromises = [];
            if ((_a = options.google) === null || _a === void 0 ? void 0 : _a.webClientId) {
                initPromises.push(this.googleProvider.initialize(options.google.webClientId, options.google.mode, options.google.hostedDomain, options.google.redirectUrl));
            }
            if ((_b = options.apple) === null || _b === void 0 ? void 0 : _b.clientId) {
                initPromises.push(this.appleProvider.initialize(options.apple.clientId, options.apple.redirectUrl, options.apple.useProperTokenExchange));
            }
            if ((_c = options.facebook) === null || _c === void 0 ? void 0 : _c.appId) {
                initPromises.push(this.facebookProvider.initialize(options.facebook.appId, options.facebook.locale));
            }
            if ((_d = options.twitter) === null || _d === void 0 ? void 0 : _d.clientId) {
                initPromises.push(this.twitterProvider.initialize(options.twitter.clientId, options.twitter.redirectUrl, options.twitter.defaultScopes, options.twitter.forceLogin, options.twitter.audience));
            }
            await Promise.all(initPromises);
        }
        async login(options) {
            switch (options.provider) {
                case 'google':
                    return this.googleProvider.login(options.options);
                case 'apple':
                    return this.appleProvider.login(options.options);
                case 'facebook':
                    return this.facebookProvider.login(options.options);
                case 'twitter':
                    return this.twitterProvider.login(options.options);
                default:
                    throw new Error(`Login for ${options.provider} is not implemented on web`);
            }
        }
        async logout(options) {
            switch (options.provider) {
                case 'google':
                    return this.googleProvider.logout();
                case 'apple':
                    return this.appleProvider.logout();
                case 'facebook':
                    return this.facebookProvider.logout();
                case 'twitter':
                    return this.twitterProvider.logout();
                default:
                    throw new Error(`Logout for ${options.provider} is not implemented`);
            }
        }
        async isLoggedIn(options) {
            switch (options.provider) {
                case 'google':
                    return this.googleProvider.isLoggedIn();
                case 'apple':
                    return this.appleProvider.isLoggedIn();
                case 'facebook':
                    return this.facebookProvider.isLoggedIn();
                case 'twitter':
                    return this.twitterProvider.isLoggedIn();
                default:
                    throw new Error(`isLoggedIn for ${options.provider} is not implemented`);
            }
        }
        async getAuthorizationCode(options) {
            switch (options.provider) {
                case 'google':
                    return this.googleProvider.getAuthorizationCode();
                case 'apple':
                    return this.appleProvider.getAuthorizationCode();
                case 'facebook':
                    return this.facebookProvider.getAuthorizationCode();
                case 'twitter':
                    return this.twitterProvider.getAuthorizationCode();
                default:
                    throw new Error(`getAuthorizationCode for ${options.provider} is not implemented`);
            }
        }
        async refresh(options) {
            switch (options.provider) {
                case 'google':
                    return this.googleProvider.refresh();
                case 'apple':
                    return this.appleProvider.refresh();
                case 'facebook':
                    return this.facebookProvider.refresh(options.options);
                case 'twitter':
                    return this.twitterProvider.refresh();
                default:
                    throw new Error(`Refresh for ${options.provider} is not implemented`);
            }
        }
        async providerSpecificCall(options) {
            throw new Error(`Provider specific call for ${options.call} is not implemented`);
        }
        async getPluginVersion() {
            return { version: 'web' };
        }
    }
    SocialLoginWeb.OAUTH_STATE_KEY = 'social_login_oauth_pending';

    var web = /*#__PURE__*/Object.freeze({
        __proto__: null,
        SocialLoginWeb: SocialLoginWeb
    });

    exports.SocialLogin = SocialLogin;

    return exports;

})({}, capacitorExports);
//# sourceMappingURL=plugin.js.map
