# =============================================================================
# Tándem Frontend — React 19 + Vite + TypeScript (pnpm 11)
# =============================================================================
# Stage 1: Build
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build-time env vars (injected via compose build args)
ARG VITE_API_URL="https://api.tandemapp.es"
ARG VITE_CLERK_PUBLISHABLE_KEY=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

RUN pnpm run build

# =============================================================================
# Stage 2: Serve with Nginx
# =============================================================================
FROM nginx:1.27-alpine AS serve

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
