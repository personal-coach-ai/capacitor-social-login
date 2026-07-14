import { WebPlugin } from '@capacitor/core';
import { AppleSocialLogin } from './apple-provider';
import { FacebookSocialLogin } from './facebook-provider';
import { GoogleSocialLogin } from './google-provider';
import { TwitterSocialLogin } from './twitter-provider';
export class SocialLoginWeb extends WebPlugin {
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
//# sourceMappingURL=web.js.map