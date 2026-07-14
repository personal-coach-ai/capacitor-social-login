import { BaseSocialLogin } from './base';
import type { FacebookLoginOptions, AuthorizationCode, LoginResult } from './definitions';
export declare class FacebookSocialLogin extends BaseSocialLogin {
    private appId;
    private scriptLoaded;
    private locale;
    initialize(appId: string | null, locale?: string): Promise<void>;
    login(options: FacebookLoginOptions): Promise<LoginResult>;
    logout(): Promise<void>;
    isLoggedIn(): Promise<{
        isLoggedIn: boolean;
    }>;
    getAuthorizationCode(): Promise<AuthorizationCode>;
    refresh(options: FacebookLoginOptions): Promise<void>;
    private loadFacebookScript;
}
