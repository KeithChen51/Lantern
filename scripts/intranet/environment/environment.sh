#!/usr/bin/env bash
# Explicit, server-side operations. Never sources a configuration file as shell code.
set -Eeuo pipefail
umask 077

fail() { printf 'Environment operation refused: %s\n' "$*" >&2; exit 1; }
usage() {
  printf 'Usage: bash environment.sh <verify|inventory|prepare|initialize|upgrade|backup|restore-verify> <private-control.env> [completed-backup-directory]\n'
}
[[ $# -ge 2 && $# -le 3 ]] || { usage; exit 2; }
MODE=$1
case "$MODE" in verify|inventory|prepare|initialize|upgrade|backup|restore-verify) ;; *) usage; exit 2 ;; esac
CONTROL=$(readlink -f -- "$2")
[[ -f "$CONTROL" && ! -L "$2" ]] || fail 'Control file must be a regular file, not a symlink'
SCRIPT_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
TEMPLATE_ROOT="$SCRIPT_ROOT/deploy/intranet/environments"

literal_config() {
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]] || fail 'Control file must use literal KEY=value lines'
    key=${BASH_REMATCH[1]}; value=${BASH_REMATCH[2]}
    case "$key" in
      ENVIRONMENT|COMPOSE_PROJECT_NAME|DATA_ROOT|BACKUP_ROOT|APP_ENV_FILE|LIGHTHOUSE_IMAGE|LIGHTHOUSE_TOOLS_IMAGE|MYSQL_IMAGE|MYSQL_DATABASE|MYSQL_USER|MYSQL_PASSWORD|MYSQL_ROOT_PASSWORD|DATABASE_URL|HTTP_BIND|HTTP_PORT|APP_UID|APP_GID|APP_MEMORY|MYSQL_MEMORY|OPERATIONS_MEMORY|GATEWAY_ENABLED|GATEWAY_NETWORK|GATEWAY_ALIAS) ;;
      *) fail "Unknown control key: $key" ;;
    esac
    if [[ "$value" == \'*\' && ${#value} -ge 2 ]]; then
      value=${value:1:${#value}-2}
      [[ "$value" != *\'* ]] || fail "Embedded apostrophe is unsupported in $key"
    else
      [[ "$value" != *[\ \"\'\$\`\\]* ]] || fail "Use single quotes for literal $key; interpolation is unsupported"
    fi
    [[ ! -v "SEEN_$key" ]] || fail "Duplicate control key: $key"
    printf -v "SEEN_$key" '%s' 1
    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$CONTROL"
}
literal_config
for key in ENVIRONMENT COMPOSE_PROJECT_NAME DATA_ROOT BACKUP_ROOT APP_ENV_FILE LIGHTHOUSE_IMAGE LIGHTHOUSE_TOOLS_IMAGE MYSQL_IMAGE MYSQL_DATABASE MYSQL_USER MYSQL_PASSWORD MYSQL_ROOT_PASSWORD DATABASE_URL HTTP_BIND HTTP_PORT; do
  [[ -v "$key" && -n "${!key}" ]] || fail "Missing control key: $key"
  [[ "${!key}" != *REPLACE* ]] || fail "Fill control key: $key"
done
case "$ENVIRONMENT" in production|test|restore) ;; *) fail 'ENVIRONMENT must be production, test or restore' ;; esac
[[ "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]{2,62}$ ]] || fail 'Invalid project name'
[[ "$MYSQL_DATABASE" =~ ^[a-z][a-z0-9_]{2,63}$ && "$MYSQL_USER" =~ ^[a-z][a-z0-9_]{2,31}$ ]] || fail 'Invalid database/account identifier'
[[ "$MYSQL_PASSWORD" != "$MYSQL_ROOT_PASSWORD" ]] || fail 'Use distinct root and application passwords'
[[ ( "$DATABASE_URL" == "mysql://$MYSQL_USER:"*"@mysql:3306/$MYSQL_DATABASE" || "$DATABASE_URL" == "mysql://$MYSQL_USER:"*"@mysql:3306/$MYSQL_DATABASE?"* ) && "$DATABASE_URL" != *"$MYSQL_ROOT_PASSWORD"* ]] || fail 'DATABASE_URL must use the application account and mysql service'
[[ "$HTTP_BIND" =~ ^[0-9.]+$ && "$HTTP_PORT" =~ ^[0-9]+$ ]] || fail 'Use an IPv4 bind address and numeric port'
(( HTTP_PORT >= 1024 && HTTP_PORT <= 65535 )) || fail 'HTTP port must be 1024..65535'
APP_UID=${APP_UID:-1000}; APP_GID=${APP_GID:-1000}
[[ "$APP_UID" =~ ^[0-9]+$ && "$APP_GID" =~ ^[0-9]+$ ]] || fail 'Invalid app UID/GID'
for key in LIGHTHOUSE_IMAGE LIGHTHOUSE_TOOLS_IMAGE MYSQL_IMAGE; do
  [[ "${!key}" =~ ^[^[:space:]]+@sha256:[a-f0-9]{64}$ ]] || fail "$key must pin a registry digest"
done

# Dedicated absolute roots, without traversal or symlinks in any ancestor.
# Deployment templates use the large /data filesystem; tests can use private temp roots.
safe_root() {
  local path=$1 cursor=/ component
  [[ "$path" =~ ^/[A-Za-z0-9._-]+/[A-Za-z0-9._/-]+$ && "$path" != */ && "$path" != *//* ]] || fail 'Use a dedicated absolute subdirectory'
  IFS=/ read -ra components <<< "$path"
  for component in "${components[@]}"; do
    [[ -z "$component" ]] && continue
    [[ "$component" != . && "$component" != .. ]] || fail 'Directory traversal is forbidden'
    cursor="${cursor%/}/$component"
    [[ ! -L "$cursor" ]] || fail 'Symlinked data/backup paths are forbidden'
  done
  [[ "$(readlink -m -- "$path")" == "$path" ]] || fail 'Path must already be canonical'
}
safe_root "$DATA_ROOT"; safe_root "$BACKUP_ROOT"
[[ "$DATA_ROOT" != "$BACKUP_ROOT" && "$DATA_ROOT" != "$BACKUP_ROOT/"* && "$BACKUP_ROOT" != "$DATA_ROOT/"* ]] || fail 'Data and backup roots must be separate'
[[ "$APP_ENV_FILE" == /* && -f "$APP_ENV_FILE" && ! -L "$APP_ENV_FILE" ]] || fail 'APP_ENV_FILE must be a private regular file'
if grep -Eq '^MYSQL_ROOT_PASSWORD=' "$APP_ENV_FILE"; then fail 'App runtime file must not contain MySQL root credentials'; fi
if grep -Eq '^[^#].*REPLACE' "$APP_ENV_FILE"; then fail 'Fill the application runtime file'; fi
[[ "$ENVIRONMENT" != production || "$HTTP_BIND" == 127.0.0.1 ]] || fail 'Production HTTP binding must remain loopback; public access uses the TLS gateway'

COMPOSE=(docker compose --env-file "$CONTROL" --project-name "$COMPOSE_PROJECT_NAME" -f "$TEMPLATE_ROOT/compose.yaml")
GATEWAY_ENABLED=${GATEWAY_ENABLED:-false}
case "$GATEWAY_ENABLED" in
  true)
    [[ "$ENVIRONMENT" == production ]] || fail 'Gateway override is production-only'
    [[ "${GATEWAY_NETWORK:-}" =~ ^[A-Za-z0-9_-]+$ && "${GATEWAY_ALIAS:-}" =~ ^[a-z0-9][a-z0-9-]+$ ]] || fail 'Set gateway network and a unique alias'
    COMPOSE+=(-f "$TEMPLATE_ROOT/gateway.override.yaml") ;;
  false) ;;
  *) fail 'GATEWAY_ENABLED must be true or false' ;;
esac
compose() { "${COMPOSE[@]}" "$@"; }
compose config --quiet

image_record() {
  docker image inspect --format '{{.Id}}|{{index .Config.Labels "org.opencontainers.image.revision"}}|{{index .Config.Labels "org.opencontainers.image.version"}}' "$1"
}
APP_RECORD=$(image_record "$LIGHTHOUSE_IMAGE") || fail 'App digest is not present locally; explicitly pull the selected artifact first'
TOOLS_RECORD=$(image_record "$LIGHTHOUSE_TOOLS_IMAGE") || fail 'Operations digest is not present locally; explicitly pull the selected artifact first'
IFS='|' read -r APP_ID REVISION VERSION <<< "$APP_RECORD"
IFS='|' read -r TOOLS_ID TOOLS_REVISION TOOLS_VERSION <<< "$TOOLS_RECORD"
[[ "$REVISION" =~ ^[a-f0-9]{40}$ && "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'App must expose full OCI revision and three-part version labels'
[[ "$TOOLS_REVISION" == "$REVISION" && "$TOOLS_VERSION" == "$VERSION" ]] || fail 'App/operations revision or version does not match'
MYSQL_ID=$(docker image inspect --format '{{.Id}}' "$MYSQL_IMAGE") || fail 'Selected MySQL digest is not present locally'
docker run --rm --pull never --network none "$LIGHTHOUSE_TOOLS_IMAGE" verify

LOCK="$CONTROL.operations-lock"
LOCK_HELD=false; RESTORE_APP=false
cleanup() {
  local code=$?
  trap - EXIT
  if [[ "$RESTORE_APP" == true ]]; then
    if ! compose start app; then printf 'App could not be restarted after backup; operator attention required.\n' >&2; code=1; fi
  fi
  if [[ "$LOCK_HELD" == true ]]; then rmdir -- "$LOCK" || code=1; fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
lock() { mkdir -- "$LOCK" 2>/dev/null || fail 'Another operation holds this control-file lock'; LOCK_HELD=true; }
owner_check() {
  [[ -f "$DATA_ROOT/.lighthouse-owner" ]] || fail 'This root is not prepared by this environment; existing test requires its own explicit procedure'
  [[ "$(cat -- "$DATA_ROOT/.lighthouse-owner")" == "$COMPOSE_PROJECT_NAME|$ENVIRONMENT" ]] || fail 'Data root belongs to a different environment'
}
empty_directory() { [[ -d "$1" && -z "$(find "$1" -mindepth 1 -maxdepth 1 -print -quit)" ]]; }
prepare_root() {
  [[ ! -e "$DATA_ROOT" ]] || empty_directory "$DATA_ROOT" || fail 'Preparation requires a new empty root'
  [[ -z "$(compose ps --all -q)" ]] || fail 'This compose project already has containers'
  mkdir -p -- "$DATA_ROOT/mysql" "$DATA_ROOT/app"
  chmod 700 -- "$DATA_ROOT"
  docker run --rm --pull never --network none --user 0:0 --entrypoint sh \
    --mount "type=bind,source=$DATA_ROOT/app,target=/data" "$LIGHTHOUSE_TOOLS_IMAGE" \
    -eu -c 'chown "$1:$2" /data; chmod 750 /data' sh "$APP_UID" "$APP_GID"
  printf '%s|%s\n' "$COMPOSE_PROJECT_NAME" "$ENVIRONMENT" > "$DATA_ROOT/.lighthouse-owner"
}
wait_healthy() {
  local service=$1 id status i
  id=$(compose ps --all -q "$service")
  [[ -n "$id" && "$id" != *$'\n'* ]] || fail "Expected one $service container"
  for ((i=0; i<60; i++)); do
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")
    [[ "$status" == healthy ]] && return
    [[ "$status" != exited && "$status" != dead ]] || fail "$service exited before becoming ready"
    sleep 2
  done
  fail "$service readiness timed out; examine protected container logs"
}
start_database() { compose up -d --pull never mysql; wait_healthy mysql; }
operations() { compose run --rm --no-deps --pull never operations "$1"; }
start_app() {
  compose up -d --no-deps --pull never app
  wait_healthy app
  compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health/ready',{redirect:'manual'}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
}
quiesce_app() {
  local id running previous_key configured_key previous_database_url
  id=$(compose ps --all -q app)
  [[ -n "$id" ]] || fail 'Backup/upgrade requires an existing app container'
  [[ "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "$id")" == "$DATA_ROOT/app" ]] || fail 'Actual app data mount differs from configured root'
  local mysql_container
  mysql_container=$(compose ps --all -q mysql)
  [[ -n "$mysql_container" && "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/mysql"}}{{.Source}}{{end}}{{end}}' "$mysql_container")" == "$DATA_ROOT/mysql" ]] || fail 'Actual MySQL data mount differs from configured root'
  previous_database_url=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$id" | sed -n 's/^DATABASE_URL=//p')
  [[ -n "$previous_database_url" && "$DATABASE_URL" == "$previous_database_url" ]] || fail 'Do not change the existing database connection during backup or ordinary upgrade'
  previous_key=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$id" | sed -n 's/^AUTH_ENCRYPTION_KEY=//p')
  if [[ -n "$previous_key" ]]; then
    configured_key=$(compose config --format json | docker run --rm -i --pull never --network none --entrypoint node "$LIGHTHOUSE_TOOLS_IMAGE" -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const c=JSON.parse(s);process.stdout.write(c.services.app.environment.AUTH_ENCRYPTION_KEY||"")})')
    [[ "$configured_key" == "$previous_key" ]] || fail 'Configured credential-encryption key changed; do not rotate it during an ordinary upgrade'
  fi
  running=$(docker inspect --format '{{.State.Running}}' "$id")
  [[ "$running" == true ]] || return
  RESTORE_APP=true
  compose stop -t 60 app
}
dump_database() {
  compose exec -T mysql sh -eu -c 'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysqldump -u "$MYSQL_USER" --single-transaction --no-tablespaces --skip-comments --hex-blob --order-by-primary --complete-insert "$MYSQL_DATABASE"'
}
check_archive() {
  local name
  # A generated archive may contain regular files and directories only.
  tar -tvzf "$1" | awk 'substr($1,1,1)!="-" && substr($1,1,1)!="d" {bad=1} END {exit bad}' || fail 'Archive contains unsupported links/devices'
  while IFS= read -r name; do
    [[ "$name" != /* && "/$name/" != */../* ]] || fail 'Unsafe archive member'
  done < <(tar -tzf "$1")
}
LAST_BACKUP=
capture_backup() {
  local stamp stage app_container mysql_container source_app_id source_record source_revision source_version
  [[ -d "$DATA_ROOT/app" && -d "$DATA_ROOT/mysql" ]] || fail 'Missing persistent directories'
  mkdir -p -- "$BACKUP_ROOT"
  chmod 700 -- "$BACKUP_ROOT"
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  stage="$BACKUP_ROOT/$stamp-$$.incomplete"
  mkdir -- "$stage"
  app_container=$(compose ps --all -q app)
  mysql_container=$(compose ps --all -q mysql)
  [[ "$(docker inspect --format '{{.Image}}' "$mysql_container")" == "$MYSQL_ID" ]] || fail 'Backup MySQL image differs from selected immutable image'
  source_app_id=$(docker inspect --format '{{.Image}}' "$app_container")
  source_record=$(image_record "$source_app_id")
  IFS='|' read -r _ source_revision source_version <<< "$source_record"
  # Contains actual current runtime values, including the stable encryption key;
  # unlike an operator-edited app.env, this describes the backed-up running version.
  docker inspect "$app_container" > "$stage/app-container.json"
  dump_database | gzip > "$stage/database.sql.gz"
  [[ -s "$stage/database.sql.gz" ]] || fail 'Database backup is empty'
  gzip -t "$stage/database.sql.gz"
  tar -czf "$stage/app-data.tar.gz" -C "$DATA_ROOT/app" .
  check_archive "$stage/app-data.tar.gz"
  (cd -- "$DATA_ROOT/app"; find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum) > "$stage/app-files.sha256"
  cp -- "$CONTROL" "$stage/control.env"
  cp -- "$APP_ENV_FILE" "$stage/app.env"
  cat > "$stage/manifest" <<EOF
FORMAT=1
PROJECT=$COMPOSE_PROJECT_NAME
ENVIRONMENT=$ENVIRONMENT
SOURCE_DATA_ROOT=$DATA_ROOT
DATABASE=$MYSQL_DATABASE
REVISION=$REVISION
VERSION=$VERSION
APP_ID=$APP_ID
SOURCE_APP_ID=$source_app_id
SOURCE_APP_REVISION=$source_revision
SOURCE_APP_VERSION=$source_version
TOOLS_ID=$TOOLS_ID
MYSQL_ID=$MYSQL_ID
CAPTURED_UTC=$stamp
EOF
  (cd -- "$stage"; sha256sum database.sql.gz app-data.tar.gz app-files.sha256 control.env app.env app-container.json manifest > SHA256SUMS; sha256sum --check --status SHA256SUMS)
  LAST_BACKUP="$BACKUP_ROOT/$stamp-$$"
  mv -- "$stage" "$LAST_BACKUP"
  touch -- "$LAST_BACKUP/COMPLETED"
  printf 'Completed backup: %s\n' "$LAST_BACKUP"
}
retain_backups() {
  local candidate
  # Only direct completed backup directories older than 14 days; never recursive deletion.
  while IFS= read -r -d '' candidate; do
    [[ ! -L "$candidate" && -f "$candidate/COMPLETED" && "$candidate" =~ /[0-9]{8}T[0-9]{6}Z-[0-9]+$ ]] || continue
    [[ "$(dirname -- "$candidate")" == "$BACKUP_ROOT" ]] || fail 'Invalid retention target'
    [[ "$(manifest_value PROJECT "$candidate")" == "$COMPOSE_PROJECT_NAME" && "$(manifest_value SOURCE_DATA_ROOT "$candidate")" == "$DATA_ROOT" ]] || continue
    local file
    for file in database.sql.gz app-data.tar.gz app-files.sha256 control.env app.env app-container.json manifest SHA256SUMS COMPLETED; do
      [[ -f "$candidate/$file" && ! -L "$candidate/$file" ]] || fail 'Unexpected old backup structure; retaining it'
    done
    [[ "$(find "$candidate" -mindepth 1 -maxdepth 1 | wc -l)" -eq 9 ]] || continue
    for file in database.sql.gz app-data.tar.gz app-files.sha256 control.env app.env app-container.json manifest SHA256SUMS COMPLETED; do rm -- "$candidate/$file"; done
    rmdir -- "$candidate"
  done < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +13 -print0)
}
manifest_value() { sed -n "s/^$1=//p" "$2/manifest"; }
restore_verify() {
  local backup source_root
  [[ "$ENVIRONMENT" == restore && "$GATEWAY_ENABLED" == false ]] || fail 'Restore requires an isolated ENVIRONMENT=restore, without gateway'
  [[ $# == 1 ]] || fail 'Specify the completed backup directory'
  backup=$(readlink -f -- "$1")
  [[ "$backup" == "$BACKUP_ROOT/"* && -f "$backup/COMPLETED" && ! -L "$1" ]] || fail 'Choose a completed backup under the configured backup root'
  [[ -f "$backup/SHA256SUMS" ]] || fail 'Missing checksums'
  # Do not allow an altered checksum list to inspect arbitrary host files.
  [[ "$(awk '{sub(/^\*/,"",$2); sub(/\r$/,"",$2); print $2}' "$backup/SHA256SUMS" | tr '\n' ' ')" == 'database.sql.gz app-data.tar.gz app-files.sha256 control.env app.env app-container.json manifest ' ]] || fail 'Unexpected checksum file list'
  (cd -- "$backup"; sha256sum --check --status SHA256SUMS) || fail 'Backup checksum verification failed'
  [[ "$(manifest_value FORMAT "$backup")" == 1 ]] || fail 'Unsupported backup format'
  [[ "$(manifest_value PROJECT "$backup")" != "$COMPOSE_PROJECT_NAME" && "$(manifest_value DATABASE "$backup")" != "$MYSQL_DATABASE" ]] || fail 'Restore project and database must differ from source'
  source_root=$(manifest_value SOURCE_DATA_ROOT "$backup")
  safe_root "$source_root"
  [[ "$DATA_ROOT" != "$source_root" && "$DATA_ROOT" != "$source_root/"* && "$source_root" != "$DATA_ROOT/"* ]] || fail 'Restore root must be separate from source'
  [[ "$(manifest_value REVISION "$backup")" == "$REVISION" && "$(manifest_value APP_ID "$backup")" == "$APP_ID" && "$(manifest_value TOOLS_ID "$backup")" == "$TOOLS_ID" && "$(manifest_value MYSQL_ID "$backup")" == "$MYSQL_ID" ]] || fail 'Restore verification must use the exact backed-up images'
  check_archive "$backup/app-data.tar.gz"
  prepare_root
  # This copy contains the original stable credential-encryption key. App stays stopped.
  mkdir -- "$DATA_ROOT/recovery"
  cp -- "$backup/app.env" "$DATA_ROOT/recovery/original-app.env"
  cp -- "$backup/control.env" "$DATA_ROOT/recovery/original-control.env"
  cp -- "$backup/app-container.json" "$DATA_ROOT/recovery/original-app-container.json"
  tar -xzf "$backup/app-data.tar.gz" -C "$DATA_ROOT/app" --no-same-owner
  (cd -- "$DATA_ROOT/app"; if [[ -s "$backup/app-files.sha256" ]]; then sha256sum --check --status "$backup/app-files.sha256"; fi) || fail 'Restored file contents differ'
  docker run --rm --pull never --network none --user 0:0 --entrypoint sh \
    --mount "type=bind,source=$DATA_ROOT/app,target=/data" "$LIGHTHOUSE_TOOLS_IMAGE" \
    -eu -c 'chown -R "$1:$2" /data' sh "$APP_UID" "$APP_GID"
  start_database
  gzip -dc "$backup/database.sql.gz" | compose exec -T mysql sh -eu -c 'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysql -u "$MYSQL_USER" "$MYSQL_DATABASE"'
  dump_database | gzip > "$DATA_ROOT/recovery/restored-database.sql.gz"
  docker run --rm --pull never --network none --read-only --user 0:0 --entrypoint node \
    --mount "type=bind,source=$SCRIPT_ROOT/scripts/intranet/environment/compare-mysql-dumps.mjs,target=/compare-mysql-dumps.mjs,readonly" \
    --mount "type=bind,source=$backup/database.sql.gz,target=/original.sql.gz,readonly" \
    --mount "type=bind,source=$DATA_ROOT/recovery/restored-database.sql.gz,target=/restored.sql.gz,readonly" \
    "$LIGHTHOUSE_TOOLS_IMAGE" /compare-mysql-dumps.mjs /original.sql.gz /restored.sql.gz \
    || fail 'Restored logical database differs from backup or could not be verified'
  printf 'Isolated restore verified; app was not started. Private recovery material: %s/recovery\n' "$DATA_ROOT"
}

case "$MODE" in
  verify) printf 'Verified immutable app/operations pair: version=%s revision=%s\n' "$VERSION" "$REVISION" ;;
  inventory) docker run --rm --pull never --network none "$LIGHTHOUSE_TOOLS_IMAGE" inventory ;;
  prepare) lock; prepare_root; printf 'Prepared new root: %s\n' "$DATA_ROOT" ;;
  initialize)
    [[ "$ENVIRONMENT" != restore ]] || fail 'Use restore-verify for restores'
    lock; owner_check
    empty_directory "$DATA_ROOT/mysql" && empty_directory "$DATA_ROOT/app" || fail 'Initialization requires empty MySQL and app directories'
    start_database
    operations migrate
    operations initialize
    start_app
    printf '%s\n' "$REVISION" > "$DATA_ROOT/.initialized"
    ;;
  backup)
    lock; owner_check; quiesce_app; capture_backup
    # Restart before retention so a retention problem does not prolong downtime.
    if [[ "$RESTORE_APP" == true ]]; then compose start app; RESTORE_APP=false; fi
    retain_backups
    ;;
  upgrade)
    [[ "$ENVIRONMENT" != restore ]] || fail 'Restore verification is not an upgrade'
    lock; owner_check; quiesce_app; capture_backup
    # A failed migration leaves app stopped for investigation, never auto-rolls schema back.
    RESTORE_APP=false
    operations migrate
    start_app
    retain_backups
    ;;
  restore-verify) lock; restore_verify "${3:-}" ;;
esac
