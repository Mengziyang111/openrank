import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchTrendDerived, fetchTrendSeries, postTrendReport } from '../service/api';

const OVERVIEW_CARDS = [
  { key: 'metric_activity', title: '活跃度趋势', desc: 'commit / issue / PR 综合活跃' },
  { key: 'metric_pr_response_time_h', title: '响应性趋势', desc: 'Time to First Response & Close' },
  { key: 'metric_bus_factor', title: '风险趋势', desc: 'Bus Factor / Top1 Share' },
];

const RESPONSIVENESS_METRICS = [
  { key: 'metric_pr_response_time_h', title: 'PR Time to First Response (h)', unit: 'h' },
  { key: 'metric_issue_response_time_h', title: 'Issue Time to First Response (h)', unit: 'h' },
  { key: 'metric_pr_resolution_duration_h', title: 'PR Time to Close (h)', unit: 'h' },
  { key: 'metric_issue_resolution_duration_h', title: 'Issue Time to Close (h)', unit: 'h' },
];

const ACTIVITY_METRICS = [
  { key: 'metric_activity', title: 'Activity' },
  { key: 'metric_participants', title: 'Participants' },
  { key: 'metric_new_contributors', title: 'New Contributors' },
  { key: 'metric_openrank', title: 'OpenRank' },
  { key: 'metric_attention', title: 'Attention' },
  { key: 'metric_activity_growth', title: 'Activity Growth' },
];

const RISK_METRICS = [
  { key: 'metric_bus_factor', title: 'Bus Factor' },
  { key: 'metric_hhi', title: 'HHI' },
  { key: 'metric_top1_share', title: 'Top1 Share' },
  { key: 'metric_retention_rate', title: 'Retention Rate' },
  { key: 'metric_scorecard_score', title: 'Scorecard Score' },
];

const METRIC_KEYS = Array.from(
  new Set([
    ...OVERVIEW_CARDS.map((c) => c.key),
    ...RESPONSIVENESS_METRICS.map((m) => m.key),
    ...ACTIVITY_METRICS.map((m) => m.key),
    ...RISK_METRICS.map((m) => m.key),
    'metric_issues_new',
    'metric_issues_closed',
    'metric_prs_new',
    'metric_change_requests_accepted',
  ]),
);

const CHAOSS_LABELS = {
  metric_issue_response_time_h: 'Issue Response Time',
  metric_issue_resolution_duration_h: 'Issue Resolution Duration',
  metric_issue_age_h: 'Issue Age',
  metric_pr_response_time_h: 'Time to First Response',
  metric_pr_resolution_duration_h: 'Time to Close (PR)',
  metric_pr_age_h: 'PR Age',
};

const formatNumber = (val, unit) => {
  if (val === null || val === undefined || Number.isNaN(val)) return '--';
  const num = typeof val === 'number' ? val : Number(val);
  if (Number.isNaN(num)) return '--';
  if (Math.abs(num) >= 1000) return `${num.toFixed(0)}`;
  if (Math.abs(num) >= 10) return `${num.toFixed(1)}${unit || ''}`;
  return `${num.toFixed(2)}${unit || ''}`;
};

function buildLineOption(metricKey, data, derived, accent = '#2563eb', unit = '') {
  const x = data.map((d) => d.dt);
  const y = data.map((d) => d.value);
  const markLines = [];
  if (derived?.rolling_mean_7d !== undefined && derived?.rolling_mean_7d !== null) {
    markLines.push({ yAxis: derived.rolling_mean_7d, name: '7d mean' });
  }
  if (derived?.rolling_median_7d !== undefined && derived?.rolling_median_7d !== null) {
    markLines.push({ yAxis: derived.rolling_median_7d, name: '7d median' });
  }

  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => formatNumber(v, unit) },
    grid: { left: 56, right: 16, top: 32, bottom: 46 },
    xAxis: { type: 'category', data: x, boundaryGap: false },
    yAxis: { type: 'value' },
    series: [
      {
        name: metricKey,
        type: 'line',
        data: y,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: accent, width: 3 },
        areaStyle: { color: `${accent}1a` },
        markLine: markLines.length ? { symbol: 'none', label: { formatter: '{b}' }, data: markLines } : undefined,
      },
    ],
  };
}

function computeRatio(seriesMap, openKey, closeKey) {
  const opens = seriesMap[openKey] || [];
  const closes = seriesMap[closeKey] || [];
  const totalOpen = opens.reduce((acc, cur) => acc + (cur.value || 0), 0);
  const totalClose = closes.reduce((acc, cur) => acc + (cur.value || 0), 0);
  if (!totalOpen) return null;
  return totalClose / totalOpen;
}

export default function TrendMonitor({ repo, onRepoChange, onRepoPinned }) {
  const [repoInput, setRepoInput] = useState(repo || '');
  const [timeRange, setTimeRange] = useState(30);
  const [activeTab, setActiveTab] = useState('overview');
  const [series, setSeries] = useState([]);
  const [derived, setDerived] = useState({});
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setRepoInput(repo || '');
  }, [repo]);

  const dateRange = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - timeRange * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().split('T')[0];
    return { start: fmt(start), end: fmt(end) };
  }, [timeRange]);

  const seriesMap = useMemo(() => {
    const map = {};
    series.forEach((row) => {
      METRIC_KEYS.forEach((key) => {
        if (row[key] === null || row[key] === undefined) return;
        if (!map[key]) map[key] = [];
        map[key].push({ dt: row.dt, value: typeof row[key] === 'number' ? row[key] : Number(row[key]) });
      });
    });
    return map;
  }, [series]);

  const latestValue = useCallback((key) => {
    const arr = seriesMap[key] || [];
    if (!arr.length) return null;
    return arr[arr.length - 1].value;
  }, [seriesMap]);

  const delta = useCallback((key) => {
    const arr = seriesMap[key] || [];
    if (arr.length < 2) return null;
    return arr[arr.length - 1].value - arr[0].value;
  }, [seriesMap]);

  const issueClosureRatio = useMemo(() => computeRatio(seriesMap, 'metric_issues_new', 'metric_issues_closed'), [seriesMap]);
  const prClosureRatio = useMemo(() => computeRatio(seriesMap, 'metric_prs_new', 'metric_change_requests_accepted'), [seriesMap]);

  const load = useCallback(async () => {
    if (!repoInput) {
      setError('请输入仓库');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = { repo: repoInput, metrics: METRIC_KEYS, start: dateRange.start, end: dateRange.end };
      const [seriesRes, derivedRes, reportRes] = await Promise.all([
        fetchTrendSeries(payload),
        fetchTrendDerived({ ...payload, slope_window: Math.min(14, timeRange) }),
        postTrendReport({ repo: repoInput, time_window: timeRange }),
      ]);
      setSeries(seriesRes.series || seriesRes.data?.series || []);
      setDerived(derivedRes.derived || derivedRes.data?.derived || {});
      setReport(reportRes.report ? reportRes : reportRes.data || reportRes);
    } catch (err) {
      setError(err?.message || '加载失败，请稍后再试');
      setSeries([]);
      setDerived({});
    } finally {
      setLoading(false);
    }
  }, [repoInput, dateRange.start, dateRange.end, timeRange]);

  useEffect(() => {
    load();
  }, [load]);

  const renderStatsRow = (items) => (
    <div className="trend-stat-row">
      {items.map((item) => {
        const val = latestValue(item.key);
        const diff = delta(item.key);
        return (
          <div key={item.key} className="trend-stat-card">
            <div className="stat-label">{item.title}</div>
            <div className="stat-value">{formatNumber(val, item.unit)}</div>
            <div className={`stat-delta ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`}>
              {diff === null ? '—' : `${diff > 0 ? '+' : ''}${formatNumber(diff, item.unit)}`}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderChartGrid = (items, accent = '#2563eb') => (
    <div className="trend-chart-grid">
      {items.map((item) => (
        <div key={item.key} className="chart-card">
          <div className="chart-head">
            <div>
              <div className="eyebrow">{CHAOSS_LABELS[item.key] || 'CHAOSS'}</div>
              <h3>{item.title}</h3>
            </div>
            <div className="chart-meta">最新 {formatNumber(latestValue(item.key), item.unit)}</div>
          </div>
          <ReactECharts
            option={buildLineOption(item.key, seriesMap[item.key] || [], derived[item.key], accent, item.unit)}
            style={{ height: 260 }}
            opts={{ useResizeObserver: false }}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="trend-shell">
      <div className="trend-hero">
        <div>
          <div className="eyebrow">Trends · CHAOSS</div>
          <h1>趋势监控 & AI 解读</h1>
          <p>按仓库拉通活跃、响应、风险三大趋势，附带可解释指标与行动提示。</p>
        </div>
        <div className="hero-actions">
          <div className="repo-input-group">
            <label>仓库</label>
            <input value={repoInput} onChange={(e) => setRepoInput(e.target.value)} placeholder="owner/repo" />
            <button
              className="primary-btn"
              onClick={() => {
                if (onRepoChange) onRepoChange(repoInput);
                if (onRepoPinned) onRepoPinned(repoInput);
                load();
              }}
              disabled={loading}
            >
              应用
            </button>
          </div>
          <div className="pill-group">
            {[7, 30, 90].map((d) => (
              <button key={d} className={`pill ${timeRange === d ? 'active' : ''}`} onClick={() => setTimeRange(d)}>
                {d}天
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="trend-tabs">
        {[
          { key: 'overview', label: 'Overview 总览' },
          { key: 'responsiveness', label: 'Responsiveness 响应性' },
          { key: 'activity', label: 'Activity & Growth' },
          { key: 'risk', label: 'Risk & Viability' },
        ].map((tab) => (
          <button key={tab.key} className={`trend-tab ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="error-row">{error}</div>}
      {loading && <div className="loading-text">加载中...</div>}

      {!loading && activeTab === 'overview' && (
        <>
          <div className="trend-cards">
            {OVERVIEW_CARDS.map((card, idx) => {
              const val = latestValue(card.key);
              const diff = delta(card.key);
              return (
                <div key={card.key} className="trend-card">
                  <div className="trend-card-header">
                    <div className="eyebrow">{CHAOSS_LABELS[card.key] || 'CHAOSS 指标'}</div>
                    <h3>{card.title}</h3>
                    <p>{card.desc}</p>
                  </div>
                  <div className="trend-card-body">
                    <div className="trend-value">{formatNumber(val)}</div>
                    <div className={`trend-change ${diff > 0 ? 'trend-up' : diff < 0 ? 'trend-down' : ''}`}>
                      {diff === null ? '—' : `${diff > 0 ? '↑' : diff < 0 ? '↓' : '→'} ${formatNumber(Math.abs(diff))}`}
                    </div>
                  </div>
                  <ReactECharts
                    option={buildLineOption(card.key, seriesMap[card.key] || [], derived[card.key], idx === 1 ? '#f97316' : idx === 2 ? '#22c55e' : '#2563eb')}
                    style={{ height: 180 }}
                    opts={{ useResizeObserver: false }}
                  />
                </div>
              );
            })}
          </div>

          <div className="ai-report-card">
            <div className="analysis-head">
              <div>
                <div className="eyebrow">AI 趋势解读</div>
                <h2>Identify → Diagnosis → Improve → Monitor</h2>
              </div>
              <div className="chip">时间窗：{timeRange} 天</div>
            </div>
            {report ? (
              <div className="report-grid">
                <div>
                  <h4>Identify</h4>
                  <p>{report.report?.identify || '—'}</p>
                </div>
                <div>
                  <h4>Diagnosis</h4>
                  <ul>
                    {(report.report?.diagnosis || []).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>Need Data?</h4>
                  <ul>
                    {(report.report?.need_data || []).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>Improvements</h4>
                  <ul>
                    {(report.report?.improvements || []).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>Monitor</h4>
                  <div className="pill-group inline">
                    {(report.report?.monitor || []).map((m) => (
                      <span key={m} className="pill ghost">{CHAOSS_LABELS[m] || m}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4>Closure / Merge Ratio</h4>
                  <p>Issues: {formatNumber(issueClosureRatio, '')} · PR: {formatNumber(prClosureRatio, '')}</p>
                </div>
              </div>
            ) : (
              <div className="loading-text">报告生成中...</div>
            )}
          </div>
        </>
      )}

      {!loading && activeTab === 'responsiveness' && (
        <>
          {renderStatsRow(RESPONSIVENESS_METRICS.slice(0, 2))}
          {renderStatsRow(RESPONSIVENESS_METRICS.slice(2))}
          <div className="trend-meta-row">
            <div className="stat-chip">48h 内响应占比：{formatNumber(derived?.metric_pr_response_time_h?.response_ratio_48h, '')}</div>
            <div className="stat-chip">Issue 48h 占比：{formatNumber(derived?.metric_issue_response_time_h?.response_ratio_48h, '')}</div>
          </div>
          {renderChartGrid(RESPONSIVENESS_METRICS, '#f97316')}
        </>
      )}

      {!loading && activeTab === 'activity' && (
        <>
          {renderStatsRow(ACTIVITY_METRICS.slice(0, 3))}
          {renderStatsRow(ACTIVITY_METRICS.slice(3))}
          {renderChartGrid(ACTIVITY_METRICS, '#2563eb')}
        </>
      )}

      {!loading && activeTab === 'risk' && (
        <>
          {renderStatsRow(RISK_METRICS)}
          {renderChartGrid(RISK_METRICS, '#22c55e')}
        </>
      )}
    </div>
  );
}
