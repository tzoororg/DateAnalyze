// Google Photos Picker configuration.
//
// GP_CLIENT_ID: OAuth 2.0 Web client ID from the Google Cloud console
//   (project us-date-tracker-c988b → Credentials). Empty = feature shows a
//   "not set up" toast. Setup: enable "Google Photos Picker API", add the
//   GitHub Pages origin + http://localhost:8000 to Authorized JS origins,
//   add scope photospicker.mediaitems.readonly to the consent screen.
// GP_PROXY: Cloudflare Worker route that relays photo bytes (googleusercontent
//   requires an Authorization header and serves no CORS headers).

export const GP_CLIENT_ID = "769027499995-1g3ae4pshhs55aohcv2uh8dkbiocd311.apps.googleusercontent.com";
export const GP_PROXY = "https://dateanalyze-feedback.tzoororg.workers.dev/gphoto";
