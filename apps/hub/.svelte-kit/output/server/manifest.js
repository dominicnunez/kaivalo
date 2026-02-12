export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.ico","og-image.png"]),
	mimeTypes: {".png":"image/png"},
	_: {
		client: {start:"_app/immutable/entry/start.dU-i86Bn.js",app:"_app/immutable/entry/app.B3uEzS9y.js",imports:["_app/immutable/entry/start.dU-i86Bn.js","_app/immutable/chunks/C87xdjDQ.js","_app/immutable/chunks/C6M8wlf6.js","_app/immutable/chunks/BpT4lrwj.js","_app/immutable/entry/app.B3uEzS9y.js","_app/immutable/chunks/C6M8wlf6.js","_app/immutable/chunks/BaH0bhBs.js","_app/immutable/chunks/BpUr5NOx.js","_app/immutable/chunks/BpT4lrwj.js","_app/immutable/chunks/0IfavMJz.js","_app/immutable/chunks/C9T96AC2.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
