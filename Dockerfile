# Stage 1: Build Stage
FROM node:23-alpine as builder

WORKDIR /app

# Copy các file cấu hình
COPY package.json package-lock.json ./
COPY .env /app/.env

# Cài đặt dependencies
RUN yarn  --frozen-lockfile

# Copy toàn bộ mã nguồn
COPY . .


# Build ứng dụng
RUN yarn build

# Stage 2: Final Image
FROM node:23-alpine

WORKDIR /app

RUN yarn cache clean
RUN rm -rf node_modules

RUN yarn --production --frozen-lockfile --no-optional
RUN yarn autoclean --force

RUN npm prune --production

RUN rm -rf node_modules/rxjs/src/
RUN rm -rf node_modules/rxjs/bundles/
RUN rm -rf node_modules/rxjs/_esm5/
RUN rm -rf node_modules/rxjs/_esm2015/
RUN rm -rf node_modules/swagger-ui-dist/*.map
RUN rm -rf node_modules/couchbase/src/

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Expose port
EXPOSE 5000

# Lệnh chạy ứng dụng
CMD ["yarn", "start:prod"]
