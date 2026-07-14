import { WebPlugin } from '@capacitor/core';
import type { SocialLoginPlugin, InitializeOptions, LoginOptions, AuthorizationCode, AuthorizationCodeOptions, isLoggedInOptions, ProviderResponseMap, ProviderSpecificCall, ProviderSpecificCallOptionsMap, ProviderSpecificCallResponseMap } from './definitions';
export declare class SocialLoginWeb extends WebPlugin implements SocialLoginPlugin {
    private static readonly OAUTH_STATE_KEY;
    private googleProvider;
    private appleProvider;
    private facebookProvider;
    private twitterProvider;
    constructor();
    private handleOAuthRedirect;
    initialize(options: InitializeOptions): Promise<void>;
    login<T extends LoginOptions['provider']>(options: Extract<LoginOptions, {
        provider: T;
    }>): Promise<{
        provider: T;
        result: ProviderResponseMap[T];
    }>;
    logout(options: {
        provider: 'apple' | 'google' | 'facebook' | 'twitter';
    }): Promise<void>;
    isLoggedIn(options: isLoggedInOptions): Promise<{
        isLoggedIn: boolean;
    }>;
    getAuthorizationCode(options: AuthorizationCodeOptions): Promise<AuthorizationCode>;
    refresh(options: LoginOptions): Promise<void>;
    providerSpecificCall<T extends ProviderSpecificCall>(options: {
        call: T;
        options: ProviderSpecificCallOptionsMap[T];
    }): Promise<ProviderSpecificCallResponseMap[T]>;
    getPluginVersion(): Promise<{
        version: string;
    }>;
}
