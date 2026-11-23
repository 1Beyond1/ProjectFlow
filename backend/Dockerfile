# 使用官方 Python 3.12 轻量版镜像
FROM python:3.12-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量 (防止生成 .pyc，实时日志)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# 创建非 root 运行用户
RUN groupadd --system appuser \
    && useradd --system --gid appuser --create-home --shell /usr/sbin/nologin appuser

# 复制依赖文件并安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码并设置目录权限
COPY --chown=appuser:appuser . .
RUN mkdir -p /app/temp_audio /app/temp_images \
    && chown -R appuser:appuser /app/temp_audio /app/temp_images

# 切换到非 root 用户
USER appuser

# 暴露端口
EXPOSE 8000

# 容器健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)" || exit 1

# 启动命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
