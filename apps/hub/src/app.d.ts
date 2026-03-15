declare global {
	namespace App {
		interface Locals {
			auth: import('@workos/authkit-sveltekit').AuthKitAuth;
			__workosCallbackStateValidated?: boolean;
		}

		interface Error {
			message: string;
			incidentId?: string;
		}
	}
}

export {};
