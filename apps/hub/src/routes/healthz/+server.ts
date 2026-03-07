const HEALTH_RESPONSE = 'ok';
const NO_STORE_CACHE_CONTROL = 'no-store';
const PLAIN_TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

export function GET() {
	return new Response(HEALTH_RESPONSE, {
		status: 200,
		headers: {
			'cache-control': NO_STORE_CACHE_CONTROL,
			'content-type': PLAIN_TEXT_CONTENT_TYPE
		}
	});
}
