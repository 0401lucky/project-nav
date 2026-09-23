# 多阶段构建：构建阶段装全部依赖产出 dist/ 与 dist-server/，
# 运行阶段只留生产依赖，镜像里不带编译工具链。
#
# 注意：内置壁纸的产物 public/wallpapers/ 是提交进仓库的，
# 这里**不需要**跑 npm run build:wallpapers（那要它的源图，源图没进仓库）。

FROM node:24-alpine AS build
WORKDIR /app

# 先只拷依赖清单，让这一层能被缓存
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

# SQLite、图标缓存、上传的壁纸都在这里；备份这一个目录就能恢复整站
VOLUME /app/data
EXPOSE 3000

# 未登录访问 /api/bootstrap 返回 401，正好用来判断进程是否在正常服务
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/bootstrap').then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist-server/index.js"]
