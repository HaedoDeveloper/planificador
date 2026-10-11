#!/bin/sh
set -eu
umask 077
backup_dir=/var/lib/planificador-backups
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
partial="$backup_dir/planificador-$timestamp.backup.partial"
destination="$backup_dir/planificador-$timestamp.backup"
pg_dump --format=custom --dbname=planificador --file="$partial"
pg_restore --list "$partial" >/dev/null
mv "$partial" "$destination"
printf '%s\n' 'Backup completed and archive list verified.'
