# Build and serve ChemPath (React + Express + persistent C++ engine)
# in one Railway-compatible container on a single public origin.
FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake g++ make ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm install --no-audit --no-fund
RUN cmake -S engine -B engine/build -DCMAKE_BUILD_TYPE=Release \
 && cmake --build engine/build --config Release -j 2
RUN npm run build:web

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV CHEMPATH_DATA_DIR=/app/data
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/engine/build/chempath ./engine/build/chempath
COPY --from=builder /app/data ./data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
