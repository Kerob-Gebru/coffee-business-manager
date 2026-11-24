# Backup plan (implementation pending)

The production backup utility must create encrypted database and document backups, write a timestamped manifest, verify integrity, copy to an approved external USB destination, and log success/failure. Restore testing is mandatory. Do not treat browser cache or IndexedDB as a backup. This directory is reserved for the hardened scripts in a later milestone.
