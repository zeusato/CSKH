# Exports and platform order — 2026-09-12

## PDF

The generic network-error translator matched `Failed to fetch dynamically imported module`, incorrectly presenting a missing lazy export module as a server connection failure. Production builds previously cleared the output directory, removing hashed modules that an already-open tab could still request. Prior export module names changed repeatedly during development; the exact user's failed browser request was unavailable, so stale modules remain a plausible cause, not a confirmed attribution of that particular incident.

Changes: distinguish module-loading errors and offer a reload action, retain prior build assets for open tabs, use the configured base URL for PDF assets, and report which PDF asset failed with a bounded fetch timeout. Attachment failures still produce an explicit missing-image note instead of aborting the PDF.

Verification: actual PDF exporter ran in the browser against locally served fonts/logo and generated a 58,995-byte PDF for an in-progress ticket with no completion date. Local exporter verification also generated MG/customer PDFs and reopened the Excel output. This does not reproduce the user's authenticated failing session.

Deployment must retain prior hashed assets when publishing updates, and serve the HTML entry with revalidation. `emptyOutDir: false` preserves modules across local builds; hosting that deletes prior releases may require its own asset-retention configuration. Retained files can accumulate and should be pruned during planned maintenance after old sessions are retired.

## Excel

The export API already accepted pending statuses, but the library supplied its fixed resolved filter. The export dialog now defaults to all statuses, allows choosing any individual status, and defaults to reception time if the page used completion time. Other page filters are retained; export dates can be changed explicitly. Export remains available even when the visible library page has zero rows. The library display itself remains resolved-only.

Verification: real export orchestration with a mocked transport exports received/in-progress/resolved together and preserves NULL completion values; browser dialog verified in-progress selection starting from resolved-library filters. Existing Excel worker artifact verification passed. No production tickets/accounts were created for these checks.

## Platform order

Read the actual platform names from Supabase and applied SH Smart APP → SH Smart WEB → SHA WEB → SHA APP → CORE → other names (Vietnamese alphabetical order). Sorting is shared by catalog fetch and post-write cache updates, covering ticket form, filters and catalog management without changing names or IDs.

19 tests and production build passed. No schema/RLS changes were required.
