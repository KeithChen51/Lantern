ARG NODE_IMAGE=ipd-docker.pkg.coding.byd.com/aftersales_ai/base/node:24.18.0-slim
FROM ${NODE_IMAGE}
ARG SOURCE_REVISION
ARG APP_VERSION
LABEL org.opencontainers.image.revision="${SOURCE_REVISION}" org.opencontainers.image.version="${APP_VERSION}"
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
ENV LD_LIBRARY_PATH=/opt/lighthouse-system/lib
ENV PATH="/opt/lighthouse-system/bin:${PATH}"
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node
ENV AUTH_MODE=portal AUTH_ALLOW_LOCAL_HTTP=false PORTAL_ALLOW_LEGACY_CONFIRMATION=false
ENV HERMIT_DSH_ROOT="" HERMIT_RUNTIME=dsh KNOWLEDGE_HUB_ENABLED=true KNOWLEDGE_HUB_DRIVER=mysql
COPY system/ /opt/lighthouse-system/
COPY --chown=node:node standalone/ ./
COPY --chown=node:node knowledge-cli/ ./knowledge-cli/
# Existing persistent volumes are supplied at deployment, never baked into the image.
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready',{redirect:'manual'}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
