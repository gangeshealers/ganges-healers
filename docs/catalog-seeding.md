# Development-only public catalog sample setup

The public services, programs, and courses pages query database rows; GitHub code and Prisma migrations do **not** create listings. The example records previously embedded in `prisma/seed.ts` are now shared by both the original full seed and a safer catalog-only command.

## Safe first look

With `.env` pointing to a disposable development database:

```bash
pnpm exec prisma migrate status
pnpm seed:catalog
```

The default command only prints the sanitized database host, database name, and planned record counts. It **does not connect or write**.

After verifying in Neon that this host belongs to an **isolated development branch** (not the production/default branch), explicitly confirm the exact hostname shown by the dry run:

```bash
pnpm seed:catalog --apply --confirm-host=<your-development-database-host>
```

This inserts missing rows for 10 sample services, 6 sample programs, 8 sample courses, and 41 sample lesson outlines. It is idempotent for catalog slugs and existing lesson slots: existing catalog data, activity flags, prices, enrollments, payment records, and real lesson content are left unchanged. All catalog writes occur in one transaction, and failures roll back that transaction.

## Safety boundaries

- Never run this with production credentials or against the default/production Neon branch. The explicit hostname confirms your intended target but **cannot prove** the branch identity; verify it in Neon before running.
- The command fails closed under `NODE_ENV=production` or `VERCEL`, rejects URL routing overrides, and never prints connection passwords.
- `pnpm seed` and `pnpm db:seed` remain the original **full development fixtures**: they may create example accounts, payment/refund data, memberships, products, and other records. Do not use them to restore only a missing catalog.
- Sample course lessons have *outline placeholders*, not finished audio/video training. Their presence in development is for UI/demo workflows only. **Do not sell or publish sample courses, programs, or services as approved production content.**
- No migrations, admin permissions, webhook flows, or public APIs change in this work.

## If a catalog still appears empty

Verify the application and this command use the same `DATABASE_URL` hostname and database name, check Prisma migrations, and inspect the catalog's `isActive` state. This command never reactivates archived rows.

Rollback: revert the code change to remove the command. The inserted sample data remains in the disposable development branch until manually cleaned or the branch is deleted. No production rollback is needed.
