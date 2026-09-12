# Catalog save latency — 2026-09-12

## Confirmed finding

The previous Catalogs save handler awaited the database mutation and then awaited `invalidateQueries(['catalogs'])` before clearing its busy state. That invalidation refetched categories, systems, departments, staff and app_users. Consequently, the disabled Save button covered both the write and the subsequent reads, including any read retry. This is a confirmed unnecessary wait, but does not establish that it explains the entire reported 15–20 seconds.

## Database measurement

See `catalog-latency.json`. Eight INSERT ... RETURNING statements were measured with EXPLAIN ANALYZE under the authenticated role and the existing active Admin's membership. Each transaction was rolled back. No test account or catalog record was retained.

- Departments: 3.030–34.634 ms SQL execution.
- Systems: 2.959–8.905 ms SQL execution.
- Catalog list reads: 0.624–1.447 ms SQL execution.

These measurements include SQL policies/triggers but exclude the browser REST request, authentication refresh, network latency and commit acknowledgement. Management API round trips are recorded separately and are not representative measurements of the frontend REST path. The reported 15–20 second delay has not been reproduced or fully attributed.

## Change

- Wait for the INSERT/UPDATE response with the actual returned row before reporting success.
- Cancel obsolete catalog reads, update the cached list using that confirmed row, then refetch in the background.
- Apply the same acknowledgement requirement to deletion and reject a deletion that returns no row.
- Pass query cancellation signals to catalog requests.
- Preserve cached catalog contents if a background refresh fails, with a retry message.
- Log `[catalog-write]` with table, operation, durationMs and success only. This measures the client SDK request through its response; it does not log names, row IDs, payloads or credentials.

No database policy, role or schema change was made.

## Validation

Six regression tests exercise write acknowledgement, pending/failed background reads, failed writes, stale-read cancellation, rename and confirmed deletion. The full suite passes (11 tests). TypeScript and production build pass. Browser navigation to the rebuilt preview reaches the login page; authenticated manual verification remains outstanding because no test account or authenticated browser session is available.
