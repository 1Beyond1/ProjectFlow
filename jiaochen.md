# Project Flow 进阶教程指南

本指南包含 **用户限流策略修改** 和 **数据库可视化查看** 两部分内容。

---

# 第一部分：用户分级限流修改

## 1. 配置文件位置

限流配置位于后端的 `config.json` 文件中：

```bash
/backend/config.json
```

## 2. 修改免费用户每日限额

打开 `config.json`，找到 `limits` 字段：

```json
{
    "limits": {
        "free_daily_limit": 10
    }
}
```

将 `10` 修改为您想要的数值（例如 `20` 或 `50`），保存文件即可。

**注意**：修改后**无需重启后端服务**，新的限额会在下一次请求时立即生效（配置热重载）。

## 3. VIP 用户限流策略

目前 VIP 用户的限流策略在代码逻辑中默认为 **无限次**。

如果需要修改 VIP 用户的策略（例如改为每日 1000 次），需要修改源码文件：
`backend/database.py`

搜索 `check_user_limit` 函数：

```python
# VIP 用户无限制
if user.tier == "vip":
    return True, -1  # -1 表示无限
```

---

## 4. 常见问题 (限流)

**Q: 修改后为什么没有立即生效？**
A: 请确认是否保存了 `config.json` 文件，且 JSON 格式正确（不要有多余的逗号）。

**Q: 如何验证修改是否成功？**
A: 可以请求 `/auth/me` 接口查看当前用户的 `daily_usage`，或者查看后端日志。

---

# 第二部分：数据库可视化查看教程

本部分教您如何查看和管理用户数据 (`users` 表) 和交互记录 (`records` 表)。

## 1. 本地环境 (SQLite)

在本地开发时，数据存储在 `backend/flow.db` 文件中。

### 方法 A：使用 Database Client 插件 (强烈推荐)
这是一个功能强大的数据库管理插件，支持直接像 Excel 一样**修改**和**删除**数据。

1.  **安装插件**：
    - 在 VS Code 扩展商店搜索 **"Database Client"** (作者: cweijan)。
    - 点击安装。

2.  **建立连接**：
    - 点击 VS Code 左侧边栏的 **数据库图标**。
    - 点击 **"+" (Create Connection)** -> 选择 **SQLite**。
    - **Name**: 随便填 (比如 `ProjectFlow`)。
    - **Path**: 点击文件夹图标，选择 `backend/flow.db`。
    - 点击 **Connect**。

3.  **管理数据**：
    - 在左侧展开连接 -> 展开数据库 -> 找到 `flow.db` -> Tables。
    - 点击 `users` 表右侧的 **打开图标** (或者双击表名)。
    - **删除数据**: 右键点击某一行 -> 选择 **Delete**。
    - **修改数据**: 双击任意单元格即可直接修改。
    - **重要**: 操作完成后，务必点击底部或顶部的 **Save (保存图标)** 才能生效！

### 方法 B：彻底重置数据库
如果您想清空所有数据重新开始：
1. 停止后端服务 (`Ctrl+C`)。
2. 直接删除 `backend/flow.db` 文件。
3. 重启后端服务，系统会自动创建一个全新的空数据库。

---

## 2. 云端环境 (MySQL - 上云后)

当您将项目部署到宝塔面板并使用 MySQL 时。

### 方法 A：使用宝塔内置 phpMyAdmin (最方便)
1.  登录宝塔面板。
2.  点击左侧 "数据库" 菜单。
3.  找到您的数据库，点击右侧的 **"管理"** (或 phpMyAdmin)。
4.  在打开的网页中，直接点击左侧的表名即可查看数据。

### 方法 B：使用 DBeaver 远程连接
1.  **放行端口**: 确保宝塔面板和云服务器安全组都放行了 `3306` 端口 (出于安全考虑，生产环境通常不建议直接开放，可以使用 SSH 隧道)。
2.  **创建权限**: 在宝塔数据库管理中，将权限设置为 "所有人" 或指定您的 IP (为了安全，调试完请改回 "本地服务器")。
3.  **DBeaver 连接**:
    -   新建连接 -> MySQL
    -   **主机 (Host)**: 您的云服务器公网 IP
    -   **端口 (Port)**: 3306
    -   **数据库**: 您创建的数据库名
    -   **用户名/密码**: 宝塔中创建数据库时设置的账号密码
4.  测试连接并保存。

## 3. 核心数据表说明

| 表名 | 描述 | 关键字段 |
| :--- | :--- | :--- |
| **users** | 用户表 | `uid` (用户ID), `username` (账号), `tier` (等级: free/vip), `daily_usage` (今日已用次数) |
| **records** | 记录表 | `raw_text` (语音识别文本), `ai_json` (AI回复JSON), `created_at` (时间) |

---

# 第三部分：模型配置与权限标签

本项目的模型列表、权限标签与默认模型均在后端 `config.json` 中维护，前端会通过 `/api/models` 拉取并展示。

## 1. 配置文件位置

```bash
/backend/config.json
```

## 2. 添加/更新模型列表

在 `config.json` 中找到 `models` 字段：

```json
"models": {
  "llm": [
    {
      "id": "Qwen/Qwen2.5-7B-Instruct",
      "name": "Qwen2.5-7B-Instruct",
      "vendor": "SiliconFlow",
      "tier": "free",
      "is_default": true
    }
  ],
  "vision": [
    {
      "id": "THUDM/GLM-4.1V-9B-Thinking",
      "name": "GLM-4.1V-9B-Thinking",
      "vendor": "SiliconFlow",
      "tiers": ["free", "vip"],
      "is_default": true
    }
  ],
  "stt": [
    {
      "id": "FunAudioLLM/SenseVoiceSmall",
      "name": "SenseVoiceSmall",
      "vendor": "SiliconFlow",
      "tiers": ["free", "vip"],
      "is_default": true
    }
  ]
}
```

字段说明：
- **id**：模型 ID（将作为后端调用的 model 值）
- **name**：前端展示名称
- **vendor**：供应商标签
- **tier**：仅限单一权限（`free` / `vip`）
- **tiers**：多权限可用（如视觉模型 `free` 与 `vip` 同时可用）
- **is_default**：该分组的默认模型（可选，前端会自动使用）

> 注意：若同时出现 `tier` 与 `tiers`，系统优先使用 `tiers`。

## 3. 设置默认模型（免费/VIP）

在 `config.json` 顶层字段设置默认模型：

- `llm.model`：免费默认模型
- `llm_vip.model`：VIP 默认模型
- `stt.model`：语音模型默认值
- `vision.model`：视觉模型默认值

示例：
```json
"llm": { "model": "Qwen/Qwen2.5-7B-Instruct" },
"llm_vip": { "model": "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B" },
"vision": { "model": "THUDM/GLM-4.1V-9B-Thinking" }
```

## 4. 权限标签生效规则

- `tier: free`：仅免费用户可选
- `tier: vip`：仅 VIP 用户可选
- `tiers: ["free", "vip"]`：免费与 VIP 均可使用

后端在 `/api/models` 返回时会根据当前用户等级自动标记 `available`，前端会据此阻止选择并提示升级。

## 5. 若需要切换到数据库配置（可选）

当前版本**仅从 `config.json` 读取模型配置**。如需改为数据库配置，可考虑：

1. 在 `system_config` 表中新增一条 `key=models` 的 JSON 记录（与 `config.json` 的结构一致）
2. 修改 `backend/auth.py` 中的 `load_config()`，优先从数据库读取并解析该配置
3. 仅在数据库读取失败时回退到 `config.json`

这部分需自行扩展代码逻辑。

## 6. 修改后生效方式

`load_config()` 会在请求时读取配置文件，因此**保存后无需重启后端即可生效**。
