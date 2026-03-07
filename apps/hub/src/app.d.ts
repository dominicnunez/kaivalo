declare global {
	namespace App {
		interface Locals {
			auth: import('@workos/authkit-sveltekit').AuthKitAuth;
		}

		interface Error {
			message: string;
			incidentId?: string;
		}
	}
}

export {};
