# Project Flow 云部署指南 (1panel / Docker Compose 版)

本指南针对使用 [1panel](https://1panel.cn/) 面板或标准 Docker Compose 的 Linux 服务器环境进行定制。

## 一、环境准备

### 1.1 安装 1panel
如果尚未安装，请参考官方文档安装 1panel：
```bash
curl -sSL https://resource.fit2cloud.com/1panel/package/quick_start.sh -o quick_start.sh && bash quick_start.sh
```

### 1.2 安装基础软件 (应用商店)
登录 1panel 面板，进入 **应用商店**，安装以下应用：
1. **OpenResty** (推荐) 或 Nginx：作为 Web 服务器和反向代理。
2. **MySQL** (推荐 8.0)：数据库服务。
   - 进入「数据库」菜单，创建一个最小权限业务数据库与账号（**切勿在生产容器中使用 MySQL `root` 账号**）：
     - 名称：`project_flow`
     - 用户：`flow_user`
     - 密码：`你的强密码`
3. **Redis** (推荐 7.x)：用于封禁列表原子缓存与番茄钟打卡幂等去重。
   - 安装后务必设置连接密码并妥善记录。

---

## 二、后端部署 (Docker Compose)

### 2.1 获取代码与准备配置文件
```bash
cd /opt/1panel/apps/project-flow
git clone https://github.com/1Beyond1/ProjectFlow.git .
cp backend/config.example.json backend/config.json
```
编辑 `backend/config.json`，填入上游模型服务商的 `api_key`（格式详见 [CONFIG_GUIDE.md](CONFIG_GUIDE.md)）。

### 2.2 配置环境变量
先在终端生成 64 位随机 JWT 密钥（**注意：Docker Compose 不会执行 `.env` 中的 `$(...)` 子命令，请勿把 `$(openssl rand -hex 32)` 直接写入 `.env`**）：

```bash
openssl rand -hex 32
```

然后在项目根目录创建 `.env` 文件（权限设为 `chmod 600 .env`），将上一步输出的 64 位十六进制密钥粘贴到 `JWT_SECRET_KEY` 中：

```dotenv
MYSQL_PASSWORD=你的强数据库密码
REDIS_PASSWORD=你的强Redis密码
JWT_SECRET_KEY=请粘贴上一步生成的64位十六进制随机密钥
CORS_ALLOW_ORIGINS=https://flow.example.com
```

> **安全说明**：
> - `docker-compose.yml` 默认仅将后端端口绑定到 `127.0.0.1:8000:8000`，不直接对外网暴露 8000 端口，需通过 OpenResty/Nginx 反代暴露 HTTPS。
> - 容器以非 root 用户（`appuser`）运行，并仅以只读方式挂载 `./backend/config.json:/app/config.json:ro`，不再将整个源码目录读写挂载进容器。
> - 如果 Docker 容器访问宿主机 MySQL/Redis 无法解析 `host.docker.internal`，请改为宿主机 Docker 网桥 IP（如 `172.17.0.1`）。

### 2.3 构建并启动容器
```bash
docker compose up -d --build
docker compose logs -f backend
```
确认健康检查通过（`docker ps` 状态为 `healthy`），本地自检：
```bash
curl http://127.0.0.1:8000/api/health
```

---

## 三、前端部署 (静态网站)

### 3.1 本地编译 Web 静态资源
在构建前指定后端站点根地址（**注意：填写站点根域名，不要拼接 `/api`**，因为前端会自动请求 `/api/*` 和 `/auth/*`）：

```bash
cd frontend
EXPO_PUBLIC_API_URL=https://flow.example.com npx expo export -p web
```
构建完成后会生成 `frontend/dist` 目录。

### 3.2 创建网站并上传资源
1. 1panel **网站** -> **创建网站** -> 运行环境选 `静态网站` -> 填写域名（如 `flow.example.com`）并配置 HTTPS 证书。
2. 将 `frontend/dist` 目录内的所有文件上传到网站根目录（确保根目录直接包含 `index.html`）。

---

## 四、反向代理 (OpenResty / Nginx)

前端同时访问 `/api/*`（AI 解析、模型目录、历史记录、番茄钟）与 `/auth/*`（注册、登录、刷新令牌、登出），**反向代理必须同时转发 `/api/` 和 `/auth/`**！

在 OpenResty/Nginx 站点配置中添加以下规则：

```nginx
# 1. 转发业务 API（含 /api/pomodoro/*、/api/process-* 等）
location /api/ {
    proxy_pass http://127.0.0.1:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 12m;
    proxy_read_timeout 120s;
}

# 2. 转发认证路由（/auth/login, /auth/register, /auth/refresh, /auth/logout, /auth/me）
location /auth/ {
    proxy_pass http://127.0.0.1:8000/auth/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# 3. SPA 前端路由回退
location / {
    try_files $uri $uri/ /index.html;
}
```

配置完成后：
- 静态页面：`https://flow.example.com`
- 业务接口：`https://flow.example.com/api/...`
- 认证接口：`https://flow.example.com/auth/...`

> **常见错误避坑**：切勿把 `EXPO_PUBLIC_API_URL` 设为 `https://flow.example.com/api` 或 `/api`，否则请求会被拼成 `/api/api/...` 且 `/auth/*` 会被发往 `/api/auth/*` 导致 404。

---

## 五、Android / iOS 打包 (EAS Build)

1. 在构建环境配置 `EXPO_PUBLIC_API_URL=https://flow.example.com`（用户安装后也可在 App 内「设置 -> 开发者选项」直接修改并保存 `API URL`）。
2. 执行 `eas build -p android --profile production`。

---

## 常见问题 Troubleshoot

### 1. 数据库连不上？
- 检查 MySQL 用户 `flow_user` 是否授权从 Docker 网段（如 `172.17.0.1`）访问 `project_flow` 库，避免随意使用 `root` 账号。

### 2. 静态资源 404 或刷新子路由 404？
- 确保上传的是 `dist` 目录内的文件而非 `dist` 目录本身，并在 Nginx 中配置 `try_files $uri $uri/ /index.html;`。

### 3. 跨域 (CORS) 错误？
- 若前后端同域反代（推荐），通常无跨域问题。
- 若前后端分离部署，请在 `.env` 中通过 `CORS_ALLOW_ORIGINS=https://your-frontend.example.com` 添加前端源后重启后端容器，无需修改源码。
