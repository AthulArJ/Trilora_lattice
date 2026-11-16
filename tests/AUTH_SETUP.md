Invitation/password setup regression checks
===========================================

Build both workspaces with `npm run build` before running the checks.
Tests do not use the project's real Supabase credentials or modify Auth users.

Install test-only tools outside the application dependency tree:

    npm install --prefix tmp/auth-qa --no-package-lock --ignore-scripts playwright @electric-sql/pglite

PowerShell:

    $env:PLAYWRIGHT_MODULE=(Resolve-Path 'tmp/auth-qa/node_modules/playwright').Path
    $env:PGLITE_MODULE=(Resolve-Path 'tmp/auth-qa/node_modules/@electric-sql/pglite').Path
    $env:CHROME_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
    node tests/auth-flow.cjs
    node tests/workspace-authorization.cjs

Alternatively install Playwright's Chromium and omit CHROME_PATH.

The browser suite serves the production build on an ephemeral loopback port,
uses the real Supabase JS SDK against isolated HTTP fixtures, and exercises
invitation/recovery callbacks, persistence, viewports, invalid/failed updates,
password sign-in, expired callbacks, logout/revisit, and forged user metadata.
No workspace requests are permitted while setup is pending.

The authorization suite executes the actual migration in isolated PostgreSQL
(PGlite) using representative existing permissive policies, then checks the
actual built Fastify preHandler with isolated Supabase HTTP responses.

Deployment requirement
----------------------
Apply `supabase/migrations/20261116120000_require_password_workspace_session.sql`
to the hosted database, and deploy both web and API together. Source changes
and local tests do not modify hosted policies or deployments. The migration
adds restrictive policies and a signed-claims helper; it creates no table or
column and does not modify users or invitation creation.

The application currently supports email/password login. Workspace access now
requires a signed `amr` password authentication claim. Link-only OTP sessions
remain limited to Supabase Auth password setup. After updateUser succeeds,
the app signs in with the chosen password and accepts that password session.
User metadata and browser flags never grant backend/RLS authorization.

These isolated tests do not replace a staging check with delivered email links
against the project's deployed Supabase version, token settings, and policies.

Session restoration regression
------------------------------
The browser suite also dispatches the browser hidden/visible lifecycle events
handled by the real Supabase SDK. It checks 1.1, 2, and 10.5 second background
periods, a retained workspace DOM marker and selected Devices page, unchanged
persisted session and document time origin, and subsequent rejected validation.
It closes/relaunches Chromium and restores its persisted fixture storage to
check browser reopening, verifies startup cannot render login prematurely,
and repeats background return after successful invitation completion.

Diagnostics stay in this isolated test harness and log only event names and
presence/equality booleans, never credentials or user/session objects.
These tests reproduced the prior regression with a valid session and unchanged
document: the provider set loading on focus SIGNED_IN, AuthGate unmounted App,
and App reset its selected page to the authenticated Operations Hub.
The fix keeps already-validated same-user sessions mounted during revalidation.
Initial validation, account switches, setup sessions, logout and validation
failure remain blocking. API authorization and database policies are unchanged.
