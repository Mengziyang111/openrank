# DataEase Dashboards

- datasets/: 数据集 SQL（metric_points/snapshots/alerts 等）
- screenshots/: 看板截图（README/PPT 用）

## 使用官方 Docker 方式启动 DataEase

> 说明：优先使用官方镜像（dataease.io 文档中提供的镜像/版本）。如需使用官方安装产物模式，请将产物目录挂载到 `/opt/dataease`。

### 方式一：官方镜像（推荐）

```bash
# 使用官方镜像启动
# 如需固定版本，请将 :latest 替换为 dataease.io 文档中推荐的版本号

docker run -d \
  --name dataease \
  -p 8100:8100 \
  dataease/dataease:latest
```

### 方式二：官方安装产物模式（挂载 /opt/dataease）

```bash
# 假设官方安装产物位于宿主机 /opt/dataease
# 将该目录挂载到容器内同路径

docker run -d \
  --name dataease \
  -p 8100:8100 \
  -v /opt/dataease:/opt/dataease \
  dataease/dataease:latest
```

## 验证 DataEase Web 可访问

- 浏览器访问：`http://localhost:8100`
- 或使用命令验证：

```bash
curl -I http://localhost:8100
```
