// Separate CODING jobs configure dev (HTTP test) or master (production build).
// Issue #50: builds paired images; never deploys, migrates, seeds or initializes.
pipeline {
  agent any
  options { skipDefaultCheckout(true); disableConcurrentBuilds(); timestamps() }
  stages {
    stage('Checkout configured branch') {
      steps {
        script {
          env.IMAGES_PUBLISHED = 'false'
          env.LIGHTHOUSE_BUILD_BRANCH = (env.LIGHTHOUSE_BUILD_BRANCH ?: 'dev').trim()
          if (!(env.LIGHTHOUSE_BUILD_BRANCH in ['dev', 'master'])) { error('LIGHTHOUSE_BUILD_BRANCH must be dev or master') }
          if (!(env.BUILD_NUMBER ==~ /[1-9][0-9]*/)) { error('BUILD_NUMBER must be a positive integer') }
          // Trigger SHAs/MR refs describe the event, not the selected source branch.
          if (env.GIT_REPO_URL && env.CREDENTIALS_ID) {
            checkout([$class: 'GitSCM', branches: [[name: '*/' + env.LIGHTHOUSE_BUILD_BRANCH]], userRemoteConfigs: [[url: env.GIT_REPO_URL, credentialsId: env.CREDENTIALS_ID]]])
          } else {
            checkout scm
          }
          sh '''
            set -eu
            rm -f build-image.txt build-manifest.json
            # BEGIN CHECKOUT GUARD (also exercised against temporary Git repositories)
            case "$LIGHTHOUSE_BUILD_BRANCH" in dev|master) ;; *) echo 'Invalid configured build branch'; exit 1 ;; esac
            case "$BUILD_NUMBER" in ''|*[!0-9]*|0*) echo 'Invalid build number'; exit 1 ;; esac
            target_head=$(git rev-parse --verify "refs/remotes/origin/$LIGHTHOUSE_BUILD_BRANCH")
            actual_head=$(git rev-parse HEAD)
            if [ "$actual_head" != "$target_head" ]; then
              echo "Refusing to publish: HEAD differs from fetched origin/$LIGHTHOUSE_BUILD_BRANCH. Configure this job's SCM branch accordingly."
              exit 1
            fi
            printf 'Verified source commit: %s\n' "$actual_head"
            # END CHECKOUT GUARD
          '''
          env.NODE_IMAGE = env.NODE_IMAGE ?: 'ipd-docker.pkg.coding.byd.com/aftersales_ai/base/node:24.18.0-slim'
          env.NPM_REGISTRY = env.NPM_REGISTRY ?: 'http://hub.byd.com:9081/repository/npm-npmmirror/'
          env.REG_HOST = env.REG_HOST ?: 'ipd-docker.pkg.coding.byd.com'
          env.REG_PROJECT = env.REG_PROJECT ?: 'aftersales_ai'
          env.REG_REPO = env.REG_REPO ?: 'aftersales_ai'
          env.IMAGE_REPO = "${env.REG_HOST}/${env.REG_PROJECT}/${env.REG_REPO}/lighthouse"
          env.TOOLS_IMAGE_REPO = "${env.IMAGE_REPO}-tools"
          env.BUILD_REVISION = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
          env.BUILD_SHA = env.BUILD_REVISION.take(12)
          env.IMAGE_TAG = "${env.LIGHTHOUSE_BUILD_BRANCH}-${env.BUILD_SHA}-${env.BUILD_NUMBER}"
          env.DOCKER_CONFIG = "${pwd(tmp: true)}/docker-config-${env.BUILD_NUMBER}"
          if (!env.CODING_DOCKER_CREDENTIAL_ID) { error('Missing CODING_DOCKER_CREDENTIAL_ID username/password credential ID') }
        }
      }
    }
    stage('Login and pull internal Node image') {
      steps {
        withCredentials([usernamePassword(credentialsId: env.CODING_DOCKER_CREDENTIAL_ID, usernameVariable: 'REG_USER', passwordVariable: 'REG_PASSWORD')]) {
          sh '''
            set -eu
            set +x
            mkdir -p "$DOCKER_CONFIG"
            printf '%s' "$REG_PASSWORD" | docker login "$REG_HOST" --username "$REG_USER" --password-stdin
            docker pull "$NODE_IMAGE"
          '''
        }
      }
    }
    stage('Build inside docker run') {
      steps {
        sh '''
          set -eu
          docker run --rm --network=host --user root \
            --security-opt seccomp=unconfined --pids-limit -1 --memory 4g \
            -v "$WORKSPACE:/app" -w /app \
            -e NODE_ENV=production -e NPM_CONFIG_REGISTRY="$NPM_REGISTRY" \
            -e NEXT_TELEMETRY_DISABLED=1 -e BUILD_REVISION="$BUILD_REVISION" \
            "$NODE_IMAGE" bash scripts/intranet/build.sh
        '''
        script {
          env.APP_VERSION = sh(script: '''
            docker run --rm --network none --security-opt seccomp=unconfined --pids-limit -1 --memory 4g \
              -v "$WORKSPACE:/app:ro" -w /app "$NODE_IMAGE" node -p 'require("./package.json").version'
          ''', returnStdout: true).trim()
        }
      }
    }
    stage('Assemble and verify images') {
      steps {
        sh '''
          set -eu
          docker build --pull=false --build-arg NODE_IMAGE="$NODE_IMAGE" \
            --build-arg SOURCE_REVISION="$BUILD_REVISION" --build-arg APP_VERSION="$APP_VERSION" \
            -f deploy/intranet/Dockerfile -t "$IMAGE_REPO:$IMAGE_TAG" .next/intranet-image
          docker build --pull=false --build-arg NODE_IMAGE="$NODE_IMAGE" \
            --build-arg SOURCE_REVISION="$BUILD_REVISION" --build-arg APP_VERSION="$APP_VERSION" \
            -f deploy/intranet/Dockerfile.tools -t "$TOOLS_IMAGE_REPO:$IMAGE_TAG" release/intranet-operations
          for image in "$IMAGE_REPO:$IMAGE_TAG" "$TOOLS_IMAGE_REPO:$IMAGE_TAG"; do
            revision=$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
            version=$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')
            [ "$revision" = "$BUILD_REVISION" ] && [ "$version" = "$APP_VERSION" ]
          done
          # Match the builder's thread compatibility, retain non-root USER and no network.
          docker run --rm --network none \
            --security-opt seccomp=unconfined --pids-limit -1 --memory 4g \
            --entrypoint node "$IMAGE_REPO:$IMAGE_TAG" -e \
            'const fs=require("fs");const m=JSON.parse(fs.readFileSync("runtime/hermit-dsh/runtime-manifest.json"));if(m.platform!=="linux"||m.arch!=="x64")throw Error("Runtime platform mismatch");require("node:sqlite");console.log("Image runtime and SQLite ready")'
          docker run --rm --network none \
            --security-opt seccomp=unconfined --pids-limit -1 --memory 4g \
            "$TOOLS_IMAGE_REPO:$IMAGE_TAG" verify
        '''
      }
    }
    stage('Push paired images and archive identity') {
      steps {
        sh '''
          set -eu
          publish_immutable() {
            image=$1
            if remote_manifest=$(docker manifest inspect "$image" 2>&1); then
              echo "Refusing to replace existing immutable image: $image"
              exit 1
            else
              # Accept only Docker's explicit not-found response for this exact tag.
              # Auth, transport, registry or unsupported-command errors are not absence.
              case "$remote_manifest" in
                "no such manifest: $image") ;;
                *) echo "Cannot verify remote tag absence; refusing to publish: $image"; exit 1 ;;
              esac
            fi
            docker push "$image"
          }
          publish_immutable "$IMAGE_REPO:$IMAGE_TAG"
          publish_immutable "$TOOLS_IMAGE_REPO:$IMAGE_TAG"
          # Resolve the pushed repository digests, not local image IDs.
          repo_digest() {
            repository=$1
            docker image inspect "$repository:$IMAGE_TAG" --format '{{range .RepoDigests}}{{println .}}{{end}}' |
              while IFS= read -r digest; do
                case "$digest" in "$repository@sha256:"*) printf '%s\n' "$digest" ;; esac
              done
          }
          app_digest=$(repo_digest "$IMAGE_REPO")
          tools_digest=$(repo_digest "$TOOLS_IMAGE_REPO")
          for digest in "$app_digest" "$tools_digest"; do
            hash=${digest##*@sha256:}
            [ ${#hash} -eq 64 ]
            case "$hash" in *[!0-9a-f]*) exit 1 ;; esac
          done
          printf '{"schemaVersion":1,"branch":"%s","buildNumber":%s,"revision":"%s","version":"%s","application":{"tag":"%s","digest":"%s"},"operations":{"tag":"%s","digest":"%s"}}\n' \
            "$LIGHTHOUSE_BUILD_BRANCH" "$BUILD_NUMBER" "$BUILD_REVISION" "$APP_VERSION" \
            "$IMAGE_REPO:$IMAGE_TAG" "$app_digest" "$TOOLS_IMAGE_REPO:$IMAGE_TAG" "$tools_digest" > build-manifest.json
          docker tag "$IMAGE_REPO:$IMAGE_TAG" "$IMAGE_REPO:$LIGHTHOUSE_BUILD_BRANCH"
          docker tag "$TOOLS_IMAGE_REPO:$IMAGE_TAG" "$TOOLS_IMAGE_REPO:$LIGHTHOUSE_BUILD_BRANCH"
          docker push "$IMAGE_REPO:$LIGHTHOUSE_BUILD_BRANCH"
          docker push "$TOOLS_IMAGE_REPO:$LIGHTHOUSE_BUILD_BRANCH"
          printf '%s\n' "$app_digest" "$tools_digest" > build-image.txt
        '''
        script { env.IMAGES_PUBLISHED = 'true' }
      }
    }
  }
  post {
    always {
      script {
        if (env.IMAGES_PUBLISHED == 'true') {
          archiveArtifacts artifacts: 'build-image.txt,build-manifest.json', allowEmptyArchive: false
        }
        if (env.DOCKER_CONFIG) { dir(env.DOCKER_CONFIG) { deleteDir() } }
      }
    }
  }
}
