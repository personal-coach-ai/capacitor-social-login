import { registerPlugin } from '@capacitor/core';
const SocialLogin = registerPlugin('SocialLogin', {
    web: () => import('./web').then((m) => new m.SocialLoginWeb()),
});
export * from './definitions';
export { SocialLogin };
//# sourceMappingURL=index.js.map