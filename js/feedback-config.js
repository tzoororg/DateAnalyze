// Feedback endpoint configuration.
//
// Fill FEEDBACK_ENDPOINT with your deployed Cloudflare Worker URL, e.g.
//   "https://dateanalyze-feedback.<your-subdomain>.workers.dev"
// Until it is set, the "Send feedback" form shows a "not configured yet" hint.
//
// FEEDBACK_KEY is an optional shared secret sent as the x-feedback-key header.
// If you set a matching FEEDBACK_KEY secret on the Worker, set the same value here.
// It is NOT a real secret (it ships in the client) — it just deters trivial abuse.

export const FEEDBACK_ENDPOINT = "";
export const FEEDBACK_KEY = "";
