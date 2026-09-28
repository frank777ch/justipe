# syntax=docker/dockerfile:1
# Imagen de la API. El contexto de build es la raíz del repo (monorepo pnpm).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# --- Build: instala dependencias, compila TypeScript y prepara una carpeta solo con producción ---
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# "@justipe/api..." instala la API y sus dependencias del workspace (@justipe/shared)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @justipe/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
# El build de la API compila primero @justipe/shared
RUN pnpm --filter @justipe/api build
# Copia dist/, drizzle/ y solo las dependencias de producción (incluida shared compilada) a /out
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @justipe/api deploy --prod --legacy /out

# --- Runtime: imagen mínima, sin pnpm ni dependencias de desarrollo ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
# Node trae su propia base de zonas horarias (ICU); no hace falta instalar tzdata
ENV TZ=America/Lima
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/health > /dev/null || exit 1
CMD ["node", "dist/index.js"]
