import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import "./App.css";

async function etlFetch(repo, metrics = ["openrank", "activity"]) {
  const url = `/api/etl/fetch?repo=${encodeURIComponent(repo)}&metrics=${encodeURIComponent(metrics.join(","))}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`ETL失败 HTTP ${res.status}`);
  return res.json();
}

async function trend(repo, metric) {
  const url = `/api/metrics/trend?repo=${encodeURIComponent(repo)}&metric=${encodeURIComponent(metric)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`查询失败 HTTP ${res.status}`);
  return res.json(); // {repo, metric, points:[{dt,value}]}
}

function latest(points) {
  if (!points || points.length === 0) return null;
  return points[points.length - 1];
}

export default function App() {
  const [repo, setRepo] = useState("ossf/scorecard");
  const [status, setStatus] = useState("就绪");
  const [openrankPoints, setOpenrankPoints] = useState([]);
  const [activityPoints, setActivityPoints] = useState([]);
  const [embedInfo, setEmbedInfo] = useState(null);
  const [bootstrapStatus, setBootstrapStatus] = useState("未初始化");

  const openrankLast = useMemo(() => latest(openrankPoints), [openrankPoints]);
  const activityLast = useMemo(() => latest(activityPoints), [activityPoints]);

  const openrankOption = useMemo(() => ({
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: openrankPoints.map(p => p.dt) },
    yAxis: { type: "value" },
    series: [{ type: "line", smooth: true, data: openrankPoints.map(p => p.value) }]
  }), [openrankPoints]);

  const activityOption = useMemo(() => ({
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: activityPoints.map(p => p.dt) },
    yAxis: { type: "value" },
    series: [{ type: "line", smooth: true, data: activityPoints.map(p => p.value) }]
  }), [activityPoints]);

  async function queryOnly() {
    setStatus("查询中...");
    const [o, a] = await Promise.all([trend(repo, "openrank"), trend(repo, "activity")]);
    setOpenrankPoints(o.points || []);
    setActivityPoints(a.points || []);
    setStatus("完成 ✅");
  }

  async function fetchAndShow() {
    if (!repo.includes("/")) {
      setStatus("失败 ❌ repo 格式应为 owner/repo");
      return;
    }
    try {
      setStatus("ETL抓取并入库中...");
      await etlFetch(repo, ["openrank", "activity"]);
      await queryOnly();
    } catch (e) {
      console.error(e);
      setStatus("失败 ❌ " + e.message);
    }
  }

  async function bootstrapDataEase() {
    if (!repo.includes("/")) {
      setBootstrapStatus("失败 ❌ repo 格式应为 owner/repo");
      return;
    }
    setBootstrapStatus("DataEase 初始化中...");
    const url = `/api/dataease/bootstrap?repo=${encodeURIComponent(repo)}`;
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      const msg = await res.text();
      setBootstrapStatus(`失败 ❌ ${msg}`);
      return;
    }
    const data = await res.json();
    setEmbedInfo(data);
    setBootstrapStatus(data.reuse ? `复用已存在 screenId=${data.screen_id}` : `已创建 screenId=${data.screen_id}`);
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2>React 端到端 MVP（OpenDigger → ETL → DB → API → UI）</h2>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <div>
          <div style={{ color: "#666", fontSize: 13 }}>仓库（owner/repo）</div>
          <input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            style={{ padding: "10px 12px", minWidth: 280, borderRadius: 10, border: "1px solid #ccc" }}
          />
        </div>
        <button onClick={fetchAndShow} style={{ padding: "10px 14px", borderRadius: 10, border: 0, background: "#111", color: "#fff" }}>
          抓取并展示
        </button>
        <button onClick={queryOnly} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ccc", background: "#fff" }}>
          只查询
        </button>
        <div style={{ color: "#666" }}>状态：{status}</div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, minWidth: 240 }}>
          <div style={{ color: "#666", fontSize: 13 }}>OpenRank 最新值</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{openrankLast ? openrankLast.value : "-"}</div>
          <div style={{ color: "#666", fontSize: 13 }}>dt: {openrankLast ? openrankLast.dt : "-"}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, minWidth: 240 }}>
          <div style={{ color: "#666", fontSize: 13 }}>Activity 最新值</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{activityLast ? activityLast.value : "-"}</div>
          <div style={{ color: "#666", fontSize: 13 }}>dt: {activityLast ? activityLast.dt : "-"}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
          <div style={{ color: "#666", fontSize: 13 }}>OpenRank 趋势</div>
          <ReactECharts option={openrankOption} style={{ height: 360 }} />
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
          <div style={{ color: "#666", fontSize: 13 }}>Activity 趋势</div>
          <ReactECharts option={activityOption} style={{ height: 360 }} />
        </div>
      </div>

      <div style={{ marginTop: 18, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#666", fontSize: 13 }}>DataEase 健康总览大屏</div>
            <div style={{ color: "#999", fontSize: 12 }}>
              按“一键生成/复用”后，会调用 /api/dataease/bootstrap 自动创建数据源/数据集/大屏，并返回嵌入链接。
            </div>
          </div>
          <button onClick={bootstrapDataEase} style={{ padding: "10px 14px", borderRadius: 10, border: 0, background: "#2563eb", color: "#fff" }}>
            一键生成/复用
          </button>
          <div style={{ color: "#666" }}>状态：{bootstrapStatus}</div>
        </div>

        {embedInfo?.embed_url && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: "#666", fontSize: 13, marginBottom: 6 }}>嵌入链接</div>
            <input
              value={embedInfo.embed_url}
              readOnly
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", fontFamily: "monospace" }}
            />
            <div style={{ marginTop: 12, border: "1px solid #ccc", borderRadius: 12, overflow: "hidden" }}>
              <iframe title="DataEase dashboard" src={embedInfo.embed_url} style={{ width: "100%", height: 420, border: 0 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
