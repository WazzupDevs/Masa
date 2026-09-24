-- Local-only dev secrets. Never run against a hosted project; there the key is created by hand.
select vault.create_secret('local-dev-phone-hash-key', 'phone_hash_key');
