# Penocracy

A private manuscript studio with four pages: Library, Editor, Export, and Archive & History.

The primary branch is `main`. `My-Elastic-Repo` is not used.

## Local development

PostgreSQL 16, Typst 0.15, and EPUBCheck 5.4.0 are required for the full export path.

```bash
npm install
npx prisma migrate deploy
npm run dev
```

Copy `.env.example` to `.env` for local development. On Vercel, the Neon integration sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct). The build applies migrations when either of those, or `DIRECT_URL`, is present. Set `AUTH_SECRET` and `AUTH_TRUST_HOST=true` in the Vercel project as well.

`EXPORT_MODE=inline` compiles PDF, EPUB, and DOCX inside the Next.js server after the request returns a job id. Production should run `export-worker/Dockerfile` with `EXPORT_MODE=worker`. The worker claims rows from `export_jobs`. Set `BLOB_READ_WRITE_TOKEN` on Vercel so finished files are not left on the ephemeral disk. Without that token, files are stored in PostgreSQL.

## Checkpoints

Live chapter text is saved on a short debounce. A revision row is not written for every keystroke.

Automatic checkpoints are created when:

- you press Cmd/Ctrl+S
- a chapter has been edited for five minutes
- you import, replace across the book, archive, or restore
- you start an export

Blobs are stored once per SHA-256. Revisions are not deleted by count.

## Recovery

- Archive is reversible from Archive & History. Restoring a chapter uses the neighboring chapter ids captured at archive time.
- Restoring a revision first writes the current text as a “Before restore” checkpoint.
- If two editors save the same chapter from different base revisions, the server returns a conflict and keeps the copy it already has. The editor asks which copy to keep.
- A Vercel rollback does not roll back PostgreSQL or stored export files. Restore the database from Neon’s point-in-time recovery, then deploy the application release that matches that schema. Use expand-and-contract migrations so an old release can still read the database during a rollback.

## Git and deploy

GitLab is the primary remote. GitHub can mirror `main`. Vercel production tracks `main`. Git history is not manuscript history.
