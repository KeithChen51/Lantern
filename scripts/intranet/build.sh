#!/usr/bin/env bash
set -Eeuo pipefail
trap 'code=$?; echo "Intranet source build failed: exit=$code line=$LINENO"; exit "$code"' ERR
node -e 'if(process.platform!=="linux"||process.arch!=="x64"||!process.versions.node.startsWith("24."))throw Error("Requires Node 24 Linux x64")'
(cd deploy/offline && sha256sum -c SHA256SUMS)
tar -xzf deploy/offline/hermit-linux-x64.tar.gz
tar -xzf deploy/offline/openssl-bookworm-x64.tar.gz
export LD_LIBRARY_PATH="/app/deploy/system/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export PATH="/app/deploy/system/bin:$PATH"
openssl version
node --version
npm --version
gzip -dc deploy/offline/knowledge-vectors.json.gz > src/lib/hermit/knowledge/knowledge-vectors.json
npm ci --ignore-scripts --no-fund --no-audit --include=dev
node scripts/intranet/engine-mirror.mjs &
mirror_pid=$!
trap 'kill "$mirror_pid" 2>/dev/null || true' EXIT
ready=false
for attempt in {1..30}; do
  if node -e "fetch('http://127.0.0.1:18766/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]]
export PRISMA_ENGINES_MIRROR=http://127.0.0.1:18766
export DATABASE_URL='mysql://build:build@127.0.0.1:3306/build_only'
export HERMIT_KNOWLEDGE_USE_PREBUILT=true HERMIT_BUNDLE_REQUIRED=true
export HERMIT_DSH_ROOT='' HERMIT_RUNTIME=dsh KNOWLEDGE_HUB_ENABLED=true KNOWLEDGE_HUB_DRIVER=sqlite
export KNOWLEDGE_HUB_SQLITE_PATH=/tmp/lantern-build-only.sqlite
npm run db:generate
npm run check:hermit-runtime
npm run test:hermit-runtime
# Next must not inherit development mode from an older pipeline definition.
export NODE_ENV=production
printf "Next production build: NODE_ENV=%s\n" "$NODE_ENV"
npm run build
node scripts/package-knowledge-cli.mjs
cp node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node .next/standalone/node_modules/.prisma/client/
# Empty directory owned by node when copied into the final image/volume.
mkdir -p deploy/runtime-data/knowledge

# Minimal assembly context, independent of other Dockerfiles and their ignore rules.
node -e "require('fs').rmSync('.next/intranet-image', { recursive: true, force: true })"
mkdir -p .next/intranet-image
cp -a .next/standalone .next/intranet-image/standalone
cp -a release/knowledge-cli .next/intranet-image/knowledge-cli
cp -a deploy/system .next/intranet-image/system
cp -a deploy/runtime-data .next/intranet-image/runtime-data
