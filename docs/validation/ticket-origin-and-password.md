# Ticket origin and password update — 2026-09-12

Implemented MG/Khách hàng source selection with three free-text fields per branch. New tickets require a source; detail fields are optional (maximum 240 characters). Existing tickets retain NULL source and display “Chưa ghi nhận”; they remain editable without inventing a source. Account numbers remain text, preserving leading zeros. Saving after switching branches clears the inactive branch. Database constraints reject invalid sources, mixed branches and overlong values.

The fields are included in create/edit, detail, Excel and PDF. Search behavior remains title/description/resolution as before.

Migration `017_ticket_origin.sql` applied to Supabase. Auth minimum length set to 8 and verified by a fresh GET of the config. `admin-users` deployed ACTIVE with the same minimum for create/reset. Account self-service/recovery and Admin form validation use 8. New-account dialogs start with the user-requested `Shs@12345`, editable before submission; password reset dialogs still start empty.

Validation:

- 16 tests passed, including 7/8-character boundaries against the actual Edge handler with a mocked Auth service, and branch normalization.
- Live authenticated SQL transaction verified insert/read, switching source, version increment, leading zeros, invalid/mixed/long fields and legacy NULL. Rolled back, explicit negative number used to avoid consuming the ticket sequence. No test accounts created. See `ticket-origin-db.json`.
- Browser checked actual source component in a local harness, switched MG to customer, entered leading-zero account number, and inspected normalized output. Actual full TicketForm layout visually inspected. This is UI/component validation, not a signed-in end-to-end save.
- Actual PDF exporter generated synthetic MG and customer PDFs; rendered both with Poppler and visually checked layout/text.
- Actual Excel worker generated and reopened a workbook; source columns, leading zeros, formula escaping and date cells verified.
- TypeScript and production build passed.

Auth API reference: https://supabase.com/docs/reference/api/v1-update-auth-service-config
