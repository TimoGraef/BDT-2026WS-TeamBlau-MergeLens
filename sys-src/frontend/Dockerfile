# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src

ARG VITE_INFERENCE_API_URL=http://localhost:8000
ARG VITE_INFERENCE_MODE=live
ARG VITE_GITHUB_API_URL=https://api.github.com

ENV VITE_INFERENCE_API_URL=$VITE_INFERENCE_API_URL
ENV VITE_INFERENCE_MODE=$VITE_INFERENCE_MODE
ENV VITE_GITHUB_API_URL=$VITE_GITHUB_API_URL

RUN npm run build

# Runtime stage
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
