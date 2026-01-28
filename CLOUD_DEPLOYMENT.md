# Project Flow 云部署指南 (1panel 版)

本指南针对使用 [1panel](https://1panel.cn/) 面板的服务器环境进行定制。

## 一、环境准备

### 1.1 安装 1panel
如果尚未安装，请参考官方文档安装 1panel：
```bash
curl -sSL https://resource.fit2cloud.com/1panel/package/quick_start.sh -o quick_start.sh && bash quick_start.sh
```

### 1.2 安装基础软件 (应用商店)
登录 1panel 面板，进入 **应用商店**，安装以下应用：
1.  **OpenResty** (推荐) 或 Nginx：作为 Web 服务器和反向代理。
2.  **MySQL** (推荐 8.0 或 5.7)：数据库服务。
    - 安装后点击"详情" -> "连接信息"，记下 `Root 密码`。
    - 进入"数据库"菜单，创建一个新数据库：
        - 名称: `project_flow`
        - 用户: `flow_user`
        - 密码: `你的强密码`
3.  **Redis** (推荐 6.x 或 7.x)：缓存服务。
    - 安装后记下连接密码 (如果有)。

---

## 二、后端部署 (Docker Compose)

### 2.1 上传代码
1.  在 1panel 文件管理中，进入 `/opt/1panel/apps` 或自定义目录，创建文件夹 `project-flow`。
2.  将本地代码打包上传，或使用 Git 拉取：
    ```bash
    cd /opt/1panel/apps/project-flow
    git clone https://github.com/your-repo/project-flow.git .
    ```

### 2.2 配置环境变量
1.  修改 `docker-compose.yml` 中的环境变量，确保连接到宿主机的数据库。
    - **注意**: 在 Docker 中访问宿主机（1panel 安装的数据库），通常不能用 `localhost`。
    - **方法一 (推荐)**: 使用 1panel 数据库的内网 IP (通常是 Docker 网桥 Gateway，如 `172.17.0.1`)。
    - **方法二**: 如果 MySQL 允许外网访问（不推荐），可用公网 IP。

    编辑 `backend/.env` (如无则创建) 或直接在 `docker-compose.yml` 修改：
    ```yaml
    environment:
      - DATABASE_URL=mysql+aiomysql://flow_user:你的强密码@172.17.0.1:3306/project_flow
      - REDIS_URL=redis://:你的Redis密码@172.17.0.1:6379/0
    ```

### 2.3 构建并启动容器
1.  进入 1panel **容器** -> **编排** -> **创建编排**。
2.  选择 **路径选择** (或直接粘贴 YAML)。
    - 如果选择路径，指向 `/opt/1panel/apps/project-flow`。
3.  点击 **确定**，等待镜像构建和容器启动。
4.  检查日志：在容器列表中找到 `flow-backend`，查看日志确认显示 `Uvicorn running on http://0.0.0.0:8000`。

---

## 三、前端部署 (静态网站)

### 3.1 本地编译
在本地开发环境执行 Web 端构建：
```bash
cd frontend
# 确保 app.json 中 web.bundler 为 "metro"
npx expo export -p web
```
构建完成后会生成 `dist` 目录。

### 3.2 创建网站
1.  1panel **网站** -> **创建网站**。
2.  **运行环境**: `静态网站` (OpenResty/Nginx)。
3.  **主域名**: 填写你的域名 (如 `flow.example.com`)。
4.  **代号**: `project-flow-web`。
5.  点击确认。

### 3.3 上传资源
1.  进入网站目录 (通常在 `/opt/1panel/websites/project-flow-web/index`)。
2.  清空默认文件。
3.  将本地 `dist` 目录下的所有文件上传到该目录。

---

## 四、反向代理 (后端 API)

为了让前端能访问后端 API (避免跨域和端口暴露)，如果不希望暴露 8000 端口，建议配置反代。

1.  进入刚才创建的网站设置 -> **反向代理**。
2.  **添加反向代理**：
    - **代理路径**: `/api`
    - **代理地址**: `http://127.0.0.1:8000` (如果后端容器映射了 8000 端口)
    - 或者容器内部 IP `http://flow-backend:8000` (如果使用了 Docker 网络)
3.  保存。

此时：
- 静态页面访问: `http://flow.example.com`
- API 访问: `http://flow.example.com/api/...`

**注意**: 前端构建时，`API_URL` 需要配置为 `/api` (如果同域) 或 `http://flow.example.com/api`。如果在 `frontend/config.json` 或 `.env` 中写死 `localhost:8000`，生产环境将无法访问。

---

## 五、Android 打包 (EAS Build)
*(同原指南，仅需确保 API URL 指向云端域名)*

1.  修改 `frontend/store/useConfigStore.ts` 或环境变量，将 API 地址改为你的线上域名。
2.  `eas build -p android --profile production`

---

## 常见问题 Troubleshoot

### 1. 数据库连不上？
- 检查 1panel 数据库权限，确保 `flow_user` 允许从 `172.17.0.1` (Docker网段) 或 `%` 连接。
- 可以在 1panel 数据库管理中修改用户权限为 `%` (注意安全)。

### 2. 静态资源 404？
- 确保上传的是 `dist` 文件夹**里面的内容**，而不是 `dist` 文件夹本身。网站根目录下应该直接有 `index.html`。

### 3. 跨域 (CORS) 错误？
- 如果采用了**反向代理**方案 (`/api` -> 8000)，通常不会有跨域问题。
- 如果前后端分离部署 (前端 A 域名，后端 IP:8000)，需要在 `backend/main.py` 的 `CORSMiddleware` 中添加前端域名。
