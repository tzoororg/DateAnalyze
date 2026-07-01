// Feedback endpoint configuration.
//
// FEEDBACK_ENDPOINT is the deployed Cloudflare Worker URL.
// FEEDBACK_KEY is a light anti-abuse shared value sent as the x-feedback-key header.
// Note: this ships in the client, so it is NOT a true secret — it only deters trivial
// drive-by requests to the bare endpoint. The same value is set as a Worker secret.

export const FEEDBACK_ENDPOINT = "https://dateanalyze-feedback.tzoororg.workers.dev";
export const FEEDBACK_KEY = "c5801ee23816436a9b84705d8ec67407";
