#!/bin/sh
# Oylik tiklash sinovi: oxirgi zaxirani VAQTINCHA bazaga tiklab, jadvallar sonini tekshiradi (asosiy baza tegilmaydi).
set -eu
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dostavka}"
LATEST="$(ls -1t "$BACKUP_DIR"/dostavka-*.dump | head -1)"
echo "Tiklanadi: $LATEST"
docker exec dostavka-postgres psql -U dostavka -d postgres -c "drop database if exists dostavka_restore_test" -c "create database dostavka_restore_test"
docker exec -i dostavka-postgres pg_restore -U dostavka -d dostavka_restore_test --no-owner < "$LATEST"
docker exec dostavka-postgres psql -U dostavka -d dostavka_restore_test -tc "select count(*) as tables from information_schema.tables where table_schema = 'public'"
docker exec dostavka-postgres psql -U dostavka -d dostavka_restore_test -tc "select count(*) as tenants from tenants"
docker exec dostavka-postgres psql -U dostavka -d postgres -c "drop database dostavka_restore_test"
echo "Tiklash sinovi: OK"
