# FlagWatch — one Node process: static PWA + JSON API + SSE + the 2h Copernicus collector.
# (After the Netlify cutover there are zero production dependencies, so the install is a no-op;
#  it stays here so the image remains reproducible if a prod dep is ever added.)
FROM node:22-alpine

WORKDIR /app

# Install production deps only (devDependencies — jsdom/axe — never ship).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# App source (node_modules, tests, docs, etc. are excluded via .dockerignore).
COPY . .

ENV NODE_ENV=production \
    PORT=8080 \
    STATE_DIR=/state

EXPOSE 8080
CMD ["node", "server.mjs"]
