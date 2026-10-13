ARG NODE_IMAGE=ipd-docker.pkg.coding.byd.com/aftersales_ai/base/node:24.18.0-slim
FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
ENV LD_LIBRARY_PATH=/opt/lighthouse-system/lib
ENV PATH="/opt/lighthouse-system/bin:${PATH}"
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node
ENV HERMIT_DSH_ROOT="" HERMIT_RUNTIME=dsh KNOWLEDGE_HUB_ENABLED=true KNOWLEDGE_HUB_DRIVER=sqlite KNOWLEDGE_HUB_SQLITE_PATH=/data/knowledge/lighthouse.sqlite
COPY system/ /opt/lighthouse-system/
COPY --chown=node:node standalone/ ./
COPY --chown=node:node knowledge-cli/ ./knowledge-cli/
COPY --chown=node:node runtime-data/ /data/
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/hermit').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
