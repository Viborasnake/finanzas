# Workspace Rules & Context for MisFinanzas

## Project Identity & Stack
*   **Name:** MisFinanzas (Personal Finance Tracking Application).
*   **Tech Stack:** React, TypeScript, Vite, Supabase, Vanilla CSS (with neobrutalist styling rules).

## Admin Panel & User Status Rules
*   **Admin Account:** Only the email `viborasnake@gmail.com` has access to administrative views and actions.
*   **Permissions:** The admin account is permitted to read all user data (RUT, email, name, transaction counts, connected banks), toggle user status (pause/activate), edit details, and permanently delete accounts.
*   **Database Functions (RPCs):** These admin operations are handled by the following `SECURITY DEFINER` Postgres functions that strictly validate that the caller's email is `viborasnake@gmail.com`:
    *   `admin_get_dashboard_data`
    *   `admin_update_user_status`
    *   `admin_update_user_details`
    *   `admin_delete_user`
*   **Suspended Accounts:** Users with `status = 'paused'` in their profile must be blocked at the routing layer (`ProtectedRoute` in `App.tsx` and `AuthContext.tsx`), rendering `AccountPausedView` and preventing dashboard operations.

## Bank Statement Imports
*   **MACH PDF Parsing:**
    *   Use `pdfjs-dist@3.11.174` (legacy build with `.js` extensions) to ensure compatibility. Do not use versions 4+ to avoid ES2022 async iterators causing errors in Safari.
    *   Initialize worker with `pdfjs-dist/legacy/build/pdf.worker.min.js?url`.
    *   Ensure that any operations reading `arrayBuffer` slice the buffer (`arrayBuffer.slice(0)`) to prevent "Buffer is already detached" issues on multiple password attempts.
    *   Use standard `for (let i = 0; ...)` loops when iterating over text items from PDF.js to prevent iterability errors in web workers.
    *   Password format: RUT without points, dashes, or digit verifier (e.g. 17673553).

## Styling & Design Guidelines
*   MisFinanzas uses a **Neo-Brutalist** design pattern:
    *   Thick borders: `border: '2px solid black'` or `border: '3px solid black'`.
    *   Hard offset shadows: `boxShadow: '4px 4px 0px black'` or `boxShadow: '6px 6px 0px black'`.
    *   Table layouts: Use `tableLayout: 'fixed'` and define strict column widths (`width: '120px'`) for Date/Monto/Badge columns to maximize space for editable transaction description fields.
    *   Cards & Layouts: Table controls and filters should float inside cards with margin-bottom rather than using full-width grey background sections.
