#!/bin/sh
# Kunlik zaxira nusxa (PostgreSQL). Cron: 0 */4 * * *  /path/deploy/backup.sh   (ma'lumot yo'qotish ≤ 15 daqiqa uchun WAL arxivlash ham yoqing — ISHGA_TUSHIRISH.md)
# Foydalanish: POSTGRES_PASSWORD o'rnatilgan muhitda ishga tushiring. Nusxalar BACKUP_DIR da 14 kun saqlanadi.
set -eu
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dostavka}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
docker exec dostavka-postgres pg_dump -U dostavka -d dostavka --format=custom --compress=6 > "$BACKUP_DIR/dostavka-$STAMP.dump"
find "$BACKUP_DIR" -name 'dostavka-*.dump' -mtime +14 -delete
echo "Zaxira: $BACKUP_DIR/dostavka-$STAMP.dump ($(du -h "$BACKUP_DIR/dostavka-$STAMP.dump" | cut -f1))"
