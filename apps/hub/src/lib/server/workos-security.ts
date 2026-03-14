export {
	applyBaselineSecurityHeaders,
	applyStaticAssetHeaders,
	createSecurityHeadersHandle,
	getStaticAssetCacheControl,
	getStaticAssetCacheControlForResponse,
	getTrustedForwardedProto,
	markPrivateNoStoreDocument,
	shouldApplyStaticAssetHeaders
} from './workos-security-cache.ts';
export {
	assertValidWorkosEnv,
	DEV_AUTH_BYPASS_CONFIGURATION_ERROR_MESSAGE,
	getProxyTrustConfiguration,
	getValidatedWorkosEnv,
	isDevAuthBypassEnabled,
	LOOPBACK_PROXY_TRUST_ERROR_MESSAGE,
	PROXY_HSTS_CONFIGURATION_ERROR_MESSAGE
} from './workos-security-env.ts';
