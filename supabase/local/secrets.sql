-- Local-only dev secrets, applied by `pnpm db:reset` (scripts/apply-local-secrets.ts), which
-- refuses any non-local database. Never run against a hosted project; there the key is created
-- by hand (see CLAUDE.md).
select vault.create_secret('local-dev-phone-hash-key', 'phone_hash_key');
