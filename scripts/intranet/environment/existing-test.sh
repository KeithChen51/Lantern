#!/usr/bin/env bash
# Retain the existing project, compose, MySQL container, and anonymous /data volume.
set -Eeuo pipefail
umask 077
fail() { printf 'Existing-test operation refused: %s\n' "$*" >&2; exit 1; }
[[ $# -ge 8 && $# -le 10 ]] || fail 'Usage: existing-test.sh <backup|upgrade> <compose.yaml> <control.env> <project> <backup-root> <new-app-digest> <matching-tools-digest> <existing-network> [app-service=lighthouse] [mysql-service=mysql]'
MODE=$1; FILE=$(readlink -f -- "$2"); CONTROL=$(readlink -f -- "$3"); PROJECT=$4
ROOT=$5; NEW_APP=$6; TOOLS=$7; NETWORK=$8; APP_SERVICE=${9:-lighthouse}; MYSQL_SERVICE=${10:-mysql}
[[ "$MODE" == backup || "$MODE" == upgrade ]] || fail 'Only backup and upgrade are supported'
[[ -f "$FILE" && -f "$CONTROL" && ! -L "$2" && ! -L "$3" ]] || fail 'Use existing regular compose/config files'
for name in "$PROJECT" "$NETWORK" "$APP_SERVICE" "$MYSQL_SERVICE"; do [[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9_-]+$ ]] || fail 'Invalid project/network/service'; done
[[ "$ROOT" =~ ^/[A-Za-z0-9._-]+/[A-Za-z0-9._/-]+$ && "$ROOT" != */ && "$ROOT" != *//* && "$(readlink -m -- "$ROOT")" == "$ROOT" ]] || fail 'Use a dedicated canonical backup directory'
cursor=/; IFS=/ read -ra parts <<< "$ROOT"
for part in "${parts[@]}"; do [[ -z "$part" ]] && continue; cursor="${cursor%/}/$part"; [[ ! -L "$cursor" ]] || fail 'Symlinked backup directory'; done
for image in "$NEW_APP" "$TOOLS"; do [[ "$image" =~ ^[^[:space:]]+@sha256:[a-f0-9]{64}$ ]] || fail 'Pin app/operations registry digests'; done
record() { docker image inspect --format '{{.Id}}|{{index .Config.Labels "org.opencontainers.image.revision"}}|{{index .Config.Labels "org.opencontainers.image.version"}}' "$1"; }
IFS='|' read -r APP_ID REVISION VERSION <<< "$(record "$NEW_APP")"
IFS='|' read -r TOOLS_ID TOOLS_REVISION TOOLS_VERSION <<< "$(record "$TOOLS")"
[[ "$REVISION" =~ ^[a-f0-9]{40}$ && "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$REVISION" == "$TOOLS_REVISION" && "$VERSION" == "$TOOLS_VERSION" ]] || fail 'App/operations labels must match'
docker run --rm --pull never --network none "$TOOLS" verify
# This contract intentionally targets the existing compose's LH_IMAGE interpolation.
# Inspect resolved config below and refuse instead of guessing a different image key.
export LH_IMAGE="$NEW_APP"
COMPOSE=(docker compose --env-file "$CONTROL" --project-name "$PROJECT" -f "$FILE")
compose() { "${COMPOSE[@]}" "$@"; }
compose config --quiet
[[ "$(grep -Ec '^LH_IMAGE=' "$CONTROL" || true)" -le 1 ]] || fail 'Duplicate LH_IMAGE assignments'
APP_CONTAINER=$(compose ps --all -q "$APP_SERVICE")
MYSQL_CONTAINER=$(compose ps --all -q "$MYSQL_SERVICE")
[[ -n "$APP_CONTAINER" && -n "$MYSQL_CONTAINER" && "$APP_CONTAINER" != *$'\n'* && "$MYSQL_CONTAINER" != *$'\n'* ]] || fail 'Expected existing app and MySQL containers'
docker inspect --format '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$APP_CONTAINER" | grep -Fxq -- "$NETWORK" || fail 'App is not on the selected existing network'
docker inspect --format '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$MYSQL_CONTAINER" | grep -Fxq -- "$NETWORK" || fail 'MySQL is not on the selected existing network'
APP_MOUNT=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}|{{.Name}}|{{.Source}}{{end}}{{end}}' "$APP_CONTAINER")
MYSQL_MOUNT=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/mysql"}}{{.Type}}|{{.Name}}|{{.Source}}{{end}}{{end}}' "$MYSQL_CONTAINER")
[[ -n "$APP_MOUNT" && -n "$MYSQL_MOUNT" ]] || fail 'Expected persistent app /data and MySQL mounts'
SOURCE_ROOT=${APP_MOUNT##*|}
SOURCE_APP_ID=$(docker inspect --format '{{.Image}}' "$APP_CONTAINER")
IFS='|' read -r _ SOURCE_REVISION SOURCE_VERSION <<< "$(record "$SOURCE_APP_ID")"
MYSQL_ID=$(docker inspect --format '{{.Image}}' "$MYSQL_CONTAINER")
mkdir -p -- "$ROOT"; chmod 700 -- "$ROOT"
LOCK="$CONTROL.operations-lock"
mkdir -- "$LOCK" 2>/dev/null || fail 'Another operation holds the environment lock'
CONFIG=$(mktemp "$ROOT/.resolved-config.XXXXXX")
RESTORE_APP=false
cleanup() {
  local code=$?
  trap - EXIT
  if [[ "$RESTORE_APP" == true ]]; then docker start "$APP_CONTAINER" >/dev/null || code=1; fi
  rm -- "$CONFIG"
  rmdir -- "$LOCK" || code=1
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
compose config --format json > "$CONFIG"
config_value() {
  docker run --rm -i --pull never --network none --entrypoint node "$TOOLS" -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{let c=JSON.parse(s).services[process.argv[1]];process.stdout.write(String(process.argv[2]==="image"?c.image:c.environment[process.argv[2]]??""))})' "$APP_SERVICE" "$1" < "$CONFIG"
}
[[ "$(config_value image)" == "$NEW_APP" ]] || fail 'Existing app must use LH_IMAGE; resolved image did not match selected digest'
if [[ "$MODE" == upgrade ]]; then
  [[ "$(config_value LIGHTHOUSE_DEPLOYMENT_ENV)" == test && "$(config_value NODE_ENV)" == production && "$(config_value AUTH_ALLOW_LOCAL_HTTP)" == false ]] || fail 'Configure the accepted production-build HTTP-test portal contract first'
fi
CURRENT_DB=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$APP_CONTAINER" | sed -n 's/^DATABASE_URL=//p')
[[ -n "$CURRENT_DB" && "$(config_value DATABASE_URL)" == "$CURRENT_DB" ]] || fail 'Do not switch existing test database during upgrade'
CURRENT_KEY=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$APP_CONTAINER" | sed -n 's/^AUTH_ENCRYPTION_KEY=//p')
[[ -z "$CURRENT_KEY" || "$(config_value AUTH_ENCRYPTION_KEY)" == "$CURRENT_KEY" ]] || fail 'Credential-encryption key changed'

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
STAGE="$ROOT/$STAMP-$$.incomplete"
mkdir -- "$STAGE"
docker inspect "$APP_CONTAINER" > "$STAGE/app-container.json"
docker inspect "$MYSQL_CONTAINER" > "$STAGE/mysql-container.json"
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$APP_CONTAINER" > "$STAGE/app.env"
cp -- "$CONTROL" "$STAGE/control.env"
cp -- "$FILE" "$STAGE/existing-compose.yaml"
printf 'DATABASE_URL=%s\nKNOWLEDGE_HUB_DRIVER=mysql\nKNOWLEDGE_HUB_ENABLED=true\n' "$CURRENT_DB" > "$STAGE/operations.env"
RUNNING=$(docker inspect --format '{{.State.Running}}' "$APP_CONTAINER")
if [[ "$RUNNING" == true ]]; then RESTORE_APP=true; compose stop -t 60 "$APP_SERVICE"; fi
dump_database() { compose exec -T "$MYSQL_SERVICE" sh -eu -c 'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysqldump -u "$MYSQL_USER" --single-transaction --no-tablespaces --skip-comments --hex-blob --order-by-primary --complete-insert "$MYSQL_DATABASE"'; }
dump_database | gzip > "$STAGE/database.sql.gz"
gzip -t "$STAGE/database.sql.gz"
docker run --rm --pull never --network none --user 0:0 --volumes-from "$APP_CONTAINER:ro" --entrypoint sh "$TOOLS" -eu -c 'exec tar -czf - -C /data .' > "$STAGE/app-data.tar.gz"
tar -tvzf "$STAGE/app-data.tar.gz" | awk 'substr($1,1,1)!="-" && substr($1,1,1)!="d" {bad=1} END {exit bad}' || fail 'App archive has unsupported links/devices'
docker run --rm --pull never --network none --user 0:0 --volumes-from "$APP_CONTAINER:ro" --entrypoint sh "$TOOLS" -eu -c 'cd /data; find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum' > "$STAGE/app-files.sha256"
DATABASE=$(compose exec -T "$MYSQL_SERVICE" sh -eu -c 'printf %s "$MYSQL_DATABASE"')
cat > "$STAGE/manifest" <<EOF
FORMAT=1
PROJECT=$PROJECT
ENVIRONMENT=test
SOURCE_DATA_ROOT=$SOURCE_ROOT
DATABASE=$DATABASE
REVISION=$REVISION
VERSION=$VERSION
APP_ID=$APP_ID
SOURCE_APP_ID=$SOURCE_APP_ID
SOURCE_APP_REVISION=$SOURCE_REVISION
SOURCE_APP_VERSION=$SOURCE_VERSION
TOOLS_ID=$TOOLS_ID
MYSQL_ID=$MYSQL_ID
APP_MOUNT=$APP_MOUNT
MYSQL_MOUNT=$MYSQL_MOUNT
CAPTURED_UTC=$STAMP
EOF
# Same core checksum list as the isolated restore CLI; supplemental recovery
# files are checked separately and remain in the same private directory.
(cd -- "$STAGE"; sha256sum database.sql.gz app-data.tar.gz app-files.sha256 control.env app.env app-container.json manifest > SHA256SUMS; sha256sum mysql-container.json existing-compose.yaml operations.env > RECOVERY-SHA256SUMS; sha256sum --check --status SHA256SUMS; sha256sum --check --status RECOVERY-SHA256SUMS)
BACKUP="$ROOT/$STAMP-$$"
mv -- "$STAGE" "$BACKUP"
touch -- "$BACKUP/COMPLETED"
printf 'Completed private existing-test backup: %s\n' "$BACKUP"

retain_backups() {
  local candidate file
  while IFS= read -r -d '' candidate; do
    [[ "$candidate" =~ /[0-9]{8}T[0-9]{6}Z-[0-9]+$ && -f "$candidate/COMPLETED" && ! -L "$candidate" ]] || continue
    [[ "$(sed -n 's/^PROJECT=//p' "$candidate/manifest")" == "$PROJECT" && "$(sed -n 's/^SOURCE_DATA_ROOT=//p' "$candidate/manifest")" == "$SOURCE_ROOT" ]] || continue
    [[ "$(find "$candidate" -mindepth 1 -maxdepth 1 | wc -l)" -eq 13 ]] || continue
    for file in database.sql.gz app-data.tar.gz app-files.sha256 control.env app.env app-container.json mysql-container.json existing-compose.yaml operations.env manifest SHA256SUMS RECOVERY-SHA256SUMS COMPLETED; do
      [[ -f "$candidate/$file" && ! -L "$candidate/$file" ]] || fail 'Unexpected retention structure'
    done
    for file in database.sql.gz app-data.tar.gz app-files.sha256 control.env app.env app-container.json mysql-container.json existing-compose.yaml operations.env manifest SHA256SUMS RECOVERY-SHA256SUMS COMPLETED; do rm -- "$candidate/$file"; done
    rmdir -- "$candidate"
  done < <(find "$ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +13 -print0)
}

if [[ "$MODE" == backup ]]; then
  if [[ "$RESTORE_APP" == true ]]; then docker start "$APP_CONTAINER" >/dev/null; RESTORE_APP=false; fi
  retain_backups
  exit 0
fi
RESTORE_APP=false
# Direct tools migration on the existing DB network: no old migrate service,
# db:setup, demo seed, knowledge import or runtime package installation.
docker run --rm --pull never --network "$NETWORK" --env-file "$BACKUP/operations.env" "$TOOLS" migrate
ENV_TMP=$(mktemp "${CONTROL}.next.XXXXXX")
awk -v replacement="LH_IMAGE=$NEW_APP" 'BEGIN{found=0} /^LH_IMAGE=/{print replacement;found=1;next} {print} END{if(!found)print replacement}' "$CONTROL" > "$ENV_TMP"
chmod 600 -- "$ENV_TMP"
mv -- "$ENV_TMP" "$CONTROL"
compose up -d --no-deps --pull never "$APP_SERVICE"
NEW_CONTAINER=$(compose ps --all -q "$APP_SERVICE")
if [[ "$(compose ps --all -q "$MYSQL_SERVICE")" != "$MYSQL_CONTAINER" || "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}|{{.Name}}|{{.Source}}{{end}}{{end}}' "$NEW_CONTAINER")" != "$APP_MOUNT" || "$(docker inspect --format '{{.Image}}' "$NEW_CONTAINER")" != "$APP_ID" ]]; then
  compose stop -t 60 "$APP_SERVICE"
  fail 'Container/image/data mount changed unexpectedly; app stopped for investigation'
fi
for ((i=0; i<60; i++)); do
  if compose exec -T "$APP_SERVICE" node -e "fetch('http://127.0.0.1:3000/api/health/ready',{redirect:'manual'}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"; then
    printf 'Existing HTTP test upgraded; original MySQL container and app data mount retained.\n'
    retain_backups
    exit 0
  fi
  sleep 2
done
fail 'New app readiness failed; retain backup and inspect protected logs, no automatic rollback'
