// Flux device-code Entra ID (Azure DevOps) — pur et testé.
// La couche azure-client.ts fait les requêtes et le stockage.
// parseTokenResponse/isExpired de google-auth.ts sont génériques : réutilisés tels quels.

// Client ID public de Visual Studio (même usage que Git Credential Manager)
// → aucun enregistrement d'application requis.
export const AZURE_CLIENT_ID = '872cd9fa-d31f-45e0-9eab-6e460a02d1f1';
export const DEVICE_CODE_ENDPOINT =
	'https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode';
export const AZURE_TOKEN_ENDPOINT =
	'https://login.microsoftonline.com/organizations/oauth2/v2.0/token';
// Ressource Azure DevOps (ID bien connu) + offline_access pour le refresh token.
export const AZURE_SCOPE =
	'499b84ac-1321-427f-aa17-267ca6975798/.default offline_access';

export function buildDeviceCodeBody(): string {
	return new URLSearchParams({
		client_id: AZURE_CLIENT_ID,
		scope: AZURE_SCOPE,
	}).toString();
}

export type RawDeviceCode = {
	device_code?: string;
	user_code?: string;
	verification_uri?: string;
	interval?: number;
	expires_in?: number;
};

export type DeviceCode = {
	deviceCode: string;
	userCode: string;
	verificationUri: string;
	intervalMs: number;
	expiresInMs: number;
};

export function parseDeviceCode(json: RawDeviceCode): DeviceCode {
	if (!json.device_code || !json.user_code) {
		throw new Error('réponse device-code invalide');
	}

	return {
		deviceCode: json.device_code,
		userCode: json.user_code,
		verificationUri:
			json.verification_uri ?? 'https://microsoft.com/devicelogin',
		intervalMs: (json.interval ?? 5) * 1000,
		expiresInMs: (json.expires_in ?? 900) * 1000,
	};
}

export function buildDeviceTokenBody(deviceCode: string): string {
	return new URLSearchParams({
		grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
		client_id: AZURE_CLIENT_ID,
		device_code: deviceCode,
	}).toString();
}

export function buildAzureRefreshBody(refreshToken: string): string {
	return new URLSearchParams({
		grant_type: 'refresh_token',
		client_id: AZURE_CLIENT_ID,
		refresh_token: refreshToken,
		scope: AZURE_SCOPE,
	}).toString();
}
