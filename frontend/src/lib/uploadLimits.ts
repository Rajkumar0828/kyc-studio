// Upload limits, shared by the API routes, the browser checks and the
// deployment's reverse proxy (docker/caddy/Caddyfile max_size is tested against
// MAX_REQUEST_BYTES in scripts/deploy-config-test.ts). No imports: safe on the client.

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // per document or selfie
export const MAX_DOCUMENTS = 5; // per application
export const MAX_FILE_LABEL = "10 MB";

// The largest legitimate request: an application with the maximum number of
// documents plus a selfie, each at the limit. Multipart boundaries, part headers
// and the text fields add well under 1 MiB.
export const MAX_REQUEST_BYTES = (MAX_DOCUMENTS + 1) * MAX_FILE_BYTES;
