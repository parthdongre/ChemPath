# ChemPath Deployment Guide

## One-service deployment (recommended for demo)

ChemPath combines a React/Vite frontend, Express API and persistent C++17
worker. The checked-in multi-stage Dockerfile builds and runs all three
under one HTTP origin, so there is no need to configure cross-origin API
URLs. The container is suitable for Railway or another Docker-based host.

### Running locally

\`\`\`sh
docker build -t chempath:local .
docker run --rm -p 8080:8080 -e PORT=8080 chempath:local
\`\`\`

Open \`http://localhost:8080/\`. API endpoints live under \`/api\`.
The readiness probe is \`GET /api/health\`.

### Deploying to Railway

1. Connect GitHub, select \`parthdongre/ChemPath\`, and create a service.
2. Select the root **Dockerfile**. Railway recognizes \`railway.json\`.
3. Leave \`PORT\` to the assigned Railway port (the server respects it).
   Production \`NODE_ENV=production\` is set in the Docker image.
4. Set \`CHEMPATH_DATA_DIR=/app/data\` for the curated dataset, or
   \`/app/data/expanded\` to use the bounded Rhea dataset.
5. Ensure \`/api/health\` succeeds, then generate a public domain through
   Railway Networking.
6. Try pathfinding, graph interaction, algorithm comparison and mobile UI
   on the production URL. Inspect logs and memory.

No Railway project/service has been created by this code change.
The hosting files configure a *potential* deployment, not a live URL.

### Security and operational limitations

- Production uses one persistent C++ process; API calls are queued and
  serialized. The queue is bounded at 16 waiting/inflight requests.
- The backend uses a best-effort in-memory rate limit of 120 requests per
  IP per minute, settable with \`API_RATE_LIMIT\`. It is not coordinated
  across replicas and is reset when the process restarts.
- Input controls reject line-protocol separators. Public routes validate
  bounds for graph expansion, simulation and other compute-heavy operations.
- Untrusted clients can still impose meaningful CPU load. Add proxy-layer
  limits/authentication before hosting to a high-traffic audience.
- Docker image includes bundled curated and Rhea datasets. License and
  attribution details: \`data/expanded/SOURCES.md\`.
- No claim of full ORD 2M+ ingestion, verified reaction synthesis,
  multiuser persistence, advanced tracing for all eight algorithms, or
  distributed worker scaling.
- If building a large production dataset, use a real indexed database and
  subgraph queries. Do not ship multi-million-reaction CSVs to browsers.

### CI checks

\`.github/workflows/ci.yml\` runs C++ engine and React unit/smoke builds,
chemistry audit, persistent API regression, and production single-origin
API checks. \`.github/workflows/deployability.yml\` builds the Docker
image, executes health and neighborhood checks, launches Chromium with a
software WebGL backend, opens the page, switches Sigma↔Cytoscape,
runs DSA algorithm comparison, and saves a browser screenshot artifact.

### Dual-service setup (optional)

A static Vite build can be deployed to Vercel separately from a Railway API
container. Set \`VITE_API_URL=https://<your-railway-domain>/api\` at Vite
**build time**, and configure CORS origin restrictions and HTTPS before
public release. The single-service configuration is simpler and the
recommended first deployment.
