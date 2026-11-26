# Changelog

本文档记录 `ProjectFlow` 的主要版本变更，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本规范。

## [0.1.0] - 2026-11-26

### Added
- **语音与图像智能拆解日程**：集成硅基流动 `SenseVoiceSmall` 语音转写、`Qwen3-8B` / `Qwen2.5-7B` 语义任务拆解与 `GLM-4.1V` 图片识别，支持按住说话自动生成带相对时间基准（`X-Client-Time`）的日程卡片与子任务。
- **跨端前端与番茄专注**：基于 Expo / React Native + Expo Web 提供移动端今日聚焦页与 Web 桌面工作台，内置番茄钟打卡（Redis `SETNX` 幂等防重复）、AI 洞察与任务列表多维筛选。
- **安全加固与 CI 回归**：补齐后端安全回归测试套件、GitHub Actions CI、CAS Token 轮换、流式上传限流与容器部署配置。
- **品牌与文档**：换装新版项目 Logo 及全套 Expo 应用图标，中英文 `README` 补齐 Web 与移动端实机界面截图。

### Fixed
- 收口前后端多轮红队审计 P0/P1/P2 项（刷新锁、本地时区日期处理、跨库 `JSONEncodedDict` 兼容、Expo Web `crypto.randomUUID()` 回退与 Zustand CJS 打包修复）。
