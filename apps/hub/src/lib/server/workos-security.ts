export {
	applyBaselineSecurityHeaders,
	applyStaticAssetHeaders,
	createSecurityHeadersHandle,
	getStaticAssetCacheControl,
	getStaticAssetCacheControlForResponse,
	getTrustedForwardedProto,
	markPrivateNoStoreDocument,
	markSessionAwareDocument,
	shouldApplyStaticAssetHeaders
} from './workos-security-cache.ts';
export {
	assertValidWorkosEnv,
	getProxyTrustConfiguration,
	getValidatedWorkosEnv,
	SPLIT_WORKOS_HOSTNAME_ERROR_MESSAGE,
	LOOPBACK_PROXY_TRUST_ERROR_MESSAGE,
	PROXY_HSTS_CONFIGURATION_ERROR_MESSAGE
} from './workos-security-env.ts';
