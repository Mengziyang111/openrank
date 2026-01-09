import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchTrendDerived, fetchTrendSeries, postTrendReport, fetchCompositeTrends, fetchRiskViability } from '../service/api';

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

const TIME_PRESETS = [
  { value: 180, label: '180天' },
  { value: 365, label: '365天' },
  { value: 'all', label: '全量' },
];

export default function TrendMonitor({ repo, onRepoChange, onRepoPinned }) {
  const [repoInput, setRepoInput] = useState(repo || '');
  const [timeRange, setTimeRange] = useState(180);
  const [activeTab, setActiveTab] = useState('overview');
  const [series, setSeries] = useState([]);
  const [derived, setDerived] = useState({});
  const [report, setReport] = useState(null);
  const [composite, setComposite] = useState({ series: null, kpis: null, explain: null });
  const [riskViability, setRiskViability] = useState({ kpis: null, series: null, explain: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    setRepoInput(repo || '');
  }, [repo]);

  const dateRange = useMemo(() => {
    if (timeRange === 'all') {
      return { start: undefined, end: undefined };
    }
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
      const payload = { repo: repoInput, metrics: METRIC_KEYS };
      if (dateRange.start) payload.start = dateRange.start;
      if (dateRange.end) payload.end = dateRange.end;
      const windowDays = timeRange === 'all' ? 180 : Math.max(30, Math.min(180, Number(timeRange) || 180));
      const [seriesRes, derivedRes, reportRes, compositeRes, riskRes] = await Promise.all([
        fetchTrendSeries(payload),
        fetchTrendDerived({ ...payload, slope_window: timeRange === 'all' ? 30 : Math.min(14, timeRange) }),
        postTrendReport({ repo: repoInput, time_window: timeRange === 'all' ? undefined : timeRange }),
        fetchCompositeTrends({ repo: repoInput, start: dateRange.start, end: dateRange.end, window_days: windowDays }),
        fetchRiskViability(repoInput, dateRange.start, dateRange.end)
      ]);
      setSeries(seriesRes.series || seriesRes.data?.series || []);
      setDerived(derivedRes.derived || derivedRes.data?.derived || {});
      setReport(reportRes.report ? reportRes : reportRes.data || reportRes);
      setComposite({
        series: compositeRes.series || compositeRes.data?.series,
        kpis: compositeRes.kpis || compositeRes.data?.kpis,
        explain: compositeRes.explain || compositeRes.data?.explain,
      });
      setRiskViability({
        kpis: riskRes.kpis || riskRes.data?.kpis,
        series: riskRes.series || riskRes.data?.series,
        explain: riskRes.explain || riskRes.data?.explain,
      });
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

  const reportMarkdown = useMemo(() => {
    if (!report?.report) return '';
    const r = report.report;
    const lines = [];
    lines.push('## Identify');
    if (r.identify) lines.push(r.identify, '');

    lines.push('## Diagnosis');
    (r.diagnosis || []).forEach((d) => lines.push(`- ${d}`));
    lines.push('');

    lines.push('## Need Data?');
    (r.need_data || []).forEach((d) => lines.push(`- ${d}`));
    lines.push('');

    lines.push('## Improvements');
    (r.improvements || []).forEach((d) => lines.push(`- ${d}`));
    lines.push('');

    lines.push('## Monitor');
    (r.monitor || []).forEach((m) => {
      const label = CHAOSS_LABELS[m] || m;
      lines.push(`- ${label}`);
    });
    lines.push('');

    lines.push('## Closure / Merge Ratio');
    lines.push(`- Issues: ${formatNumber(issueClosureRatio, '')}`);
    lines.push(`- PR: ${formatNumber(prClosureRatio, '')}`);
    return lines.join('\n');
  }, [report, issueClosureRatio, prClosureRatio]);

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
            {TIME_PRESETS.map((p) => (
              <button key={p.value} className={`pill ${timeRange === p.value ? 'active' : ''}`} onClick={() => setTimeRange(p.value)}>
                {p.label}
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
          {/* Composite overview cards */}
          {composite.series && (
            <div className="trend-cards">
              {[{ key: 'vitality', title: '活跃度综合分', accent: '#2563eb', seriesKey: 'vitality_composite' },
                { key: 'responsiveness', title: '响应性综合分', accent: '#f97316', seriesKey: 'responsiveness_composite' },
                { key: 'resilience', title: '稳健度综合分', accent: '#22c55e', seriesKey: 'resilience_composite' }].map((card) => {
                  const s = composite.series[card.seriesKey] || [];
                  const kpi = composite.kpis?.[card.key] || { value: null, delta: null };
                  return (
                    <div key={card.key} className="trend-card">
                      <div className="trend-card-header">
                        <div className="eyebrow">Composite</div>
                        <h3>{card.title}</h3>
                        <p>滚动窗口归一化 + 加权求和（0~100）</p>
                      </div>
                      <div className="trend-card-body">
                        <div className="trend-value">{formatNumber(kpi.value, '')}</div>
                        <div className={`trend-change ${kpi.delta > 0 ? 'trend-up' : kpi.delta < 0 ? 'trend-down' : ''}`}>
                          {kpi.delta === null ? '—' : `${kpi.delta > 0 ? '↑' : kpi.delta < 0 ? '↓' : '→'} ${formatNumber(Math.abs(kpi.delta), '')}`}
                        </div>
                      </div>
                      <ReactECharts
                        option={buildLineOption(card.seriesKey, s, null, card.accent, '')}
                        style={{ height: 180 }}
                        opts={{ useResizeObserver: false }}
                      />
                    </div>
                  );
                })}
            </div>
          )}
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

          <section className="analysis-card markdown-card">
            <div className="analysis-head">
              <div>
                <div className="eyebrow">AI 趋势解读</div>
                <h2>Markdown 格式洞察</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="chip">时间窗：{timeRange} 天</div>
                <button className="ghost-btn" onClick={() => setZoomOpen(true)} title="放大查看">⤢</button>
              </div>
            </div>
            {report ? (
              reportMarkdown ? (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportMarkdown}</ReactMarkdown>
                </div>
              ) : (
                <div className="loading-text">暂无报告内容</div>
              )
            ) : (
              <div className="loading-text">报告生成中...</div>
            )}
          </section>

          {zoomOpen && (
            <div className="trend-modal-overlay" onClick={() => setZoomOpen(false)}>
              <div className="trend-modal" onClick={(e) => e.stopPropagation()}>
                <div className="trend-modal-head">
                  <div>
                    <div className="eyebrow">AI 趋势解读</div>
                    <h3>报告放大查看</h3>
                  </div>
                  <button className="ghost-btn" onClick={() => setZoomOpen(false)}>关闭</button>
                </div>
                {reportMarkdown ? (
                  <div className="plan-modal-body markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportMarkdown}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="loading-text">暂无报告内容</div>
                )}
              </div>
            </div>
          )}
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
          {riskViability.kpis && (
            <div className="trend-stat-row">
              {[
                { key: 'bus_factor', title: 'Bus Factor' },
                { key: 'resilience', title: 'Resilience Index' },
                { key: 'top1_share', title: 'Top1 Share' },
                { key: 'retention_proxy', title: 'Retention Rate (Proxy)' },
                { key: 'scorecard', title: 'Scorecard Score' }
              ].map((item) => {
                const kpi = riskViability.kpis[item.key] || { value: null, delta: null };
                return (
                  <div key={item.key} className="trend-stat-card">
                    <div className="stat-label">{item.title}</div>
                    <div className="stat-value">{formatNumber(kpi.value)}</div>
                    <div className={`stat-delta ${kpi.delta > 0 ? 'up' : kpi.delta < 0 ? 'down' : ''}`}>
                      {kpi.delta === null ? '—' : `${kpi.delta > 0 ? '+' : ''}${formatNumber(kpi.delta)}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {riskViability.series && (
            <div className="trend-chart-grid">
              {[
                { key: 'bus_factor', title: 'Bus Factor' },
                { key: 'resilience', title: 'Resilience Index' },
                { key: 'top1_share', title: 'Top1 Share' },
                { key: 'retention_proxy', title: 'Retention Rate (Proxy)' },
                { key: 'scorecard', title: 'Scorecard Score' }
              ].map((item) => {
                const data = riskViability.series[item.key] || [];
                const latestValue = data.length > 0 ? data[data.length - 1].value : null;
                return (
                  <div key={item.key} className="chart-card">
                    <div className="chart-head">
                      <div>
                        <div className="eyebrow">CHAOSS</div>
                        <h3>{item.title}</h3>
                      </div>
                      <div className="chart-meta">最新 {formatNumber(latestValue)}</div>
                    </div>
                    <ReactECharts
                      option={buildLineOption(item.key, data, null, '#22c55e')}
                      style={{ height: 260 }}
                      opts={{ useResizeObserver: false }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
