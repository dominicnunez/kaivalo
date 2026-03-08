import '@workos/authkit-sveltekit';

declare module '@workos/authkit-sveltekit' {
	interface AuthKitConfig {
		apiHostname?: string;
	}
}

export {};
