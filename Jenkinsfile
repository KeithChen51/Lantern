// Intranet Gitee dev -> two-phase build -> dev image. Issue #22.
pipeline {
  agent any
  options { skipDefaultCheckout(true); disableConcurrentBuilds(); timestamps() }
  stages {
    stage('Checkout dev') {
      steps {
        script {
          // CODING merge-request triggers may supply a commit SHA, not a branch.
          // This dedicated test job builds the fetched dev tip, not the MR merge revision.
          def ref = (env.GIT_BUILD_REF ?: env.BRANCH_NAME ?: 'dev').trim()
          def devRefs = ['dev', 'refs/heads/dev', 'origin/dev', 'refs/remotes/origin/dev', '*/dev']
          def commitTrigger = ref ==~ /(?i)[0-9a-f]{40}|[0-9a-f]{64}/
          if (!(ref in devRefs) && !commitTrigger) {
            error('This test pipeline accepts dev refs or commit triggers only: ' + ref)
          }
          echo('Trigger ref: ' + ref + '; build target: fetched origin/dev')
          if (env.GIT_REPO_URL && env.CREDENTIALS_ID) {
            checkout([$class: 'GitSCM', branches: [[name: '*/dev']], userRemoteConfigs: [[url: env.GIT_REPO_URL, credentialsId: env.CREDENTIALS_ID]]])
          } else {
            checkout scm
          }
          // Verify actual checked-out code, independently of trigger metadata.
          sh '''
            set -eu
            dev_head=$(git rev-parse --verify refs/remotes/origin/dev)
            actual_head=$(git rev-parse HEAD)
            if [ "$actual_head" != "$dev_head" ]; then
              echo "Refusing to publish: checked-out HEAD is not fetched origin/dev. Configure this job's SCM branch as dev."
              exit 1
            fi
            printf 'Verified dev commit: %s\n' "$actual_head"
          '''
          env.NODE_IMAGE = env.NODE_IMAGE ?: 'ipd-docker.pkg.coding.byd.com/aftersales_ai/base/node:24.18.0-slim'
          env.NPM_REGISTRY = env.NPM_REGISTRY ?: 'http://hub.byd.com:9081/repository/npm-npmmirror/'
          env.REG_HOST = env.REG_HOST ?: 'ipd-docker.pkg.coding.byd.com'
          env.REG_PROJECT = env.REG_PROJECT ?: 'aftersales_ai'
          env.REG_REPO = env.REG_REPO ?: 'aftersales_ai'
          env.IMAGE_REPO = "${env.REG_HOST}/${env.REG_PROJECT}/${env.REG_REPO}/lighthouse"
          env.BUILD_SHA = sh(script: 'git rev-parse --short=12 HEAD', returnStdout: true).trim()
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
            -e NEXT_TELEMETRY_DISABLED=1 \
            "$NODE_IMAGE" bash scripts/intranet/build.sh
        '''
      }
    }
    stage('Assemble and verify image') {
      steps {
        sh '''
          set -eu
          docker build --pull=false --build-arg NODE_IMAGE="$NODE_IMAGE" \
            -f deploy/intranet/Dockerfile -t "$IMAGE_REPO:dev-$BUILD_SHA" .next/intranet-image
          # Match the builder's thread-creation compatibility on the intranet host.
          # Keep verification offline and retain the image's non-root USER.
          docker run --rm --network none \
            --security-opt seccomp=unconfined --pids-limit -1 --memory 4g \
            --entrypoint node "$IMAGE_REPO:dev-$BUILD_SHA" -e \
            'const fs=require("fs");const m=JSON.parse(fs.readFileSync("runtime/hermit-dsh/runtime-manifest.json"));if(m.platform!=="linux"||m.arch!=="x64")throw Error("Runtime platform mismatch");require("node:sqlite");console.log("Image runtime and SQLite ready")'
        '''
      }
    }
    stage('Push dev image') {
      steps {
        sh '''
          set -eu
          docker push "$IMAGE_REPO:dev-$BUILD_SHA"
          docker tag "$IMAGE_REPO:dev-$BUILD_SHA" "$IMAGE_REPO:dev"
          docker push "$IMAGE_REPO:dev"
          printf '%s\n' "$IMAGE_REPO:dev-$BUILD_SHA" "$IMAGE_REPO:dev" > build-image.txt
        '''
      }
    }
  }
  post {
    always {
      archiveArtifacts artifacts: 'build-image.txt', allowEmptyArchive: true
      script {
        if (env.DOCKER_CONFIG) {
          dir(env.DOCKER_CONFIG) { deleteDir() }
        }
      }
    }
  }
}
