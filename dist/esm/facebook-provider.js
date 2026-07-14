import { BaseSocialLogin } from './base';
export class FacebookSocialLogin extends BaseSocialLogin {
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
//# sourceMappingURL=facebook-provider.js.map