import {
	HUB_HEALTH_BODY,
	HUB_HEALTH_CACHE_CONTROL,
	HUB_HEALTH_CONTENT_TYPE,
	HUB_HEALTH_STATUS_CODE
} from '$lib/server/health-contract';

export function GET() {
	return new Response(HUB_HEALTH_BODY, {
		status: HUB_HEALTH_STATUS_CODE,
		headers: {
			'cache-control': HUB_HEALTH_CACHE_CONTROL,
			'content-type': HUB_HEALTH_CONTENT_TYPE
		}
	});
}
