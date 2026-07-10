# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project — including but
not limited to authentication bypass, data exposure across patients,
IDOR, injection, or a way to defeat the local database encryption —
please **do not open a public GitHub issue**.

Instead, report it privately using [GitHub Security Advisories](../../security/advisories/new)
for this repository ("Report a vulnerability" under the Security tab).
If that is not available to you, open a regular issue asking for a
private contact channel and avoid including exploit details until one
is established.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept code is welcome)
- The affected version/commit

We aim to acknowledge reports within a reasonable timeframe and will
credit reporters in the fix commit/release notes unless you prefer
otherwise.

## Scope Notes

This is a local-first application: patient data is stored in the
browser's IndexedDB on each staff terminal, not on a central server.
Reports about the following are especially valuable:

- Encryption of locally stored data (`rxdb/plugins/encryption-crypto-js`)
  and the `NEXT_PUBLIC_DB_PASSWORD` key-handling path
- Authentication / session handling (`src/lib/auth.ts`)
- Audit log integrity (`src/lib/audit_integrity.ts`)
- Any path where one patient's data could become visible to, or
  modifiable by, an unauthorized user or a different patient's context
  (IDOR-style issues)
- File upload handling in OCR/import flows (MIME/size validation)

## Out of Scope

This project is **not** a certified medical device or a certified
receipt-computer (レセプトコンピュータ) system — see the disclaimer in
[README.md](README.md). Reports about clinical-logic correctness,
claim-calculation accuracy, or drug-master data staleness are welcome as
regular issues (not security advisories); they are tracked as
correctness/data-quality work, not vulnerabilities.
