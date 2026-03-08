export {
	applyBaselineSecurityHeaders,
	applyStaticAssetHeaders,
	createSecurityHeadersHandle,
	getStaticAssetCacheControl,
	getStaticAssetCacheControlForResponse,
	getTrustedForwardedProto,
	shouldApplyStaticAssetHeaders
} from './workos-security-cache.ts';
export {
	assertValidWorkosEnv,
	getProxyTrustConfiguration,
	getValidatedWorkosEnv,
	LOOPBACK_PROXY_TRUST_ERROR_MESSAGE,
	PROXY_HSTS_CONFIGURATION_ERROR_MESSAGE
} from './workos-security-env.ts';
