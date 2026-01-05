import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { marked } from 'marked';
import './App.css';
import {
  postAgentRun,
  refreshTodayHealth,
  fetchLatestHealthOverview,
  fetchDataEaseDashboardUrl,
  fetchTrend,
} from './service/api';

const navItems = [
  { key: 'ai', label: 'AI 聊天', note: '主界面' },
  { key: 'health', label: '健康体检', note: '健康分与雷达' },
  { key: 'benchmark', label: '对标分析', note: '同类分位' },
  { key: 'trend', label: '趋势预测', note: '趋势预估' },
  { key: 'actions', label: '行动中心', note: '治理清单' },
  { key: 'alerts', label: '风险预警', note: '实时提示' },
];

const conversations = [
  { id: 'conv-1', repo: 'microsoft/vscode', tag: '默认' },
  { id: 'conv-2', repo: 'facebook/react', tag: '示例' },
  { id: 'conv-3', repo: 'vuejs/core', tag: '示例' },
];

const quickPrompts = [
  '给我最新的健康总分摘要',
  '为什么响应度下降？',
  '帮我写三条治理建议',
  '和 microsoft/vscode 做对标',
  '生成本周行动闭环',
];

const healthSnapshot = {
  score: 82,
  radar: [
    { label: '活跃', value: 78 },
    { label: '响应', value: 64 },
    { label: '韧性', value: 72 },
    { label: '治理', value: 88 },
    { label: '风险', value: 81 },
  ],
  takeaways: [
    '活跃度稳定，但响应维度偏弱，主要是 issue 首响偏慢。',
    '治理分高，社区规约齐全，Scorecard 得分 8.1。',
    '风险集中在 backlog age 和 bus factor，需要关注核心贡献者占比。',
  ],
};

const benchmarkCards = [
  { title: '健康分分位', detail: '第 65 分位 · 响应度拖后腿' },
  { title: '关键差距', detail: '首响中位数 28h · backlog age 32 天' },
  { title: '对标仓库', detail: 'facebook/react · vuejs/core · angular/angular' },
];

const actionTasks = [
  { title: 'Triage 本周新增 issue，设定首响负责人', impact: '响应度 ↑', effort: 'S' },
  { title: '清理 age>30 天 backlog，先处理 top10', impact: '韧性 ↑', effort: 'M' },
  { title: '发布 contributor guide 与模板，降低新人门槛', impact: '治理 ↑', effort: 'M' },
  { title: '轮值值班表，确保 24h 首响', impact: '响应度 ↑', effort: 'S' },
];

const alertList = [
  { title: '响应度预警：首响中位数 > 24h', time: '今天 09:12', level: 'high' },
  { title: 'Backlog age > 30 天的 issue 12 个', time: '昨天 18:20', level: 'medium' },
  { title: 'Bus factor 风险：top1 占比 46%', time: '本周', level: 'medium' },
  { title: '活跃度周环比 -12%', time: '本周', level: 'low' },
];

const initialMessages = [
  {
    id: 'm-1',
    role: 'assistant',
    text: '你好，我是 OpenRank Agent。告诉我你的仓库和需求，我会给出健康体检、对标、治理建议或风险预警。',
  },
];

function formatAssistantReply(payload) {
  if (!payload) return '已处理，稍后再试试。';
  const parts = [];
  if (payload.summary?.headline) parts.push(payload.summary.headline);
  if (payload.summary?.key_points?.length) {
    parts.push(payload.summary.key_points.map((p) => `- ${p}`).join('\n'));
  }
  if (payload.actions?.length) {
    parts.push('行动建议：\n' + payload.actions.map((a) => `- [${a.priority || 'P1'}] ${a.action}`).join('\n'));
  }
  if (payload.links?.length) {
    parts.push('相关链接：\n' + payload.links.map((l) => `- ${l}`).join('\n'));
  }
  return parts.filter(Boolean).join('\n\n');
}

function pickMarkdown(payload) {
  const candidates = [
    payload?.analysis_markdown,
    payload?.report_markdown,
    payload?.analysis_md,
    payload?.analysis,
    payload?.report_text,
    payload?.raw_payloads?.analysis_markdown,
  ];
  return candidates.find((t) => typeof t === 'string' && t.trim()) || '';
}

function extractTop5Share(payload) {
  const candidates = [
    payload?.metric_top5_share,
    payload?.metric_top5_contrib,
    payload?.metric_top5_contribution,
    payload?.top5_share,
    payload?.raw_payloads?.top5_share,
    payload?.raw_payloads?.metrics?.['Top5贡献占比'],
    payload?.raw_payloads?.top_contributors?.top5_share,
  ];

  for (const value of candidates) {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const numeric = parseFloat(value.replace('%', ''));
      if (!Number.isNaN(numeric)) return numeric;
    }
  }
  return null;
}

function buildAttachParams(repoFullName) {
  const payload = { repo_full_name: repoFullName };
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json)));
}

function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState('microsoft/vscode');
  const [activeNav, setActiveNav] = useState('ai');
  const [healthOverview, setHealthOverview] = useState(null);
  const [healthMarkdown, setHealthMarkdown] = useState('');
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState('');
  const [riskLabel, setRiskLabel] = useState(null);
  const [dataEaseLink, setDataEaseLink] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [copyTip, setCopyTip] = useState('');
  const [showTrendModal, setShowTrendModal] = useState(false);
  const [activeMetric, setActiveMetric] = useState(null);
  const [trendSeries, setTrendSeries] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState('');
  const listEndRef = useRef(null);
  const trendChartRef = useRef(null);

  const attachParams = useMemo(() => (selectedRepo ? buildAttachParams(selectedRepo) : ''), [selectedRepo]);

  const currentScore = useMemo(() => {
    const raw = healthOverview?.score_health ?? healthSnapshot.score;
    if (typeof raw === 'number' && !Number.isNaN(raw)) return Math.round(raw);
    return healthSnapshot.score;
  }, [healthOverview]);

  const themeColor = useMemo(() => {
    if (currentScore < 70) return '#ef4444';
    if (currentScore < 85) return '#f59e0b';
    return '#22c55e';
  }, [currentScore]);

  const healthRadarOption = useMemo(() => {
    const indicator = [
      { name: '活跃度', max: 100 },
      { name: '响应度', max: 100 },
      { name: '抗风险', max: 100 },
      { name: '治理', max: 100 },
      { name: '安全', max: 100 },
    ];

    const values = [
      healthOverview?.score_vitality,
      healthOverview?.score_responsiveness,
      healthOverview?.score_resilience,
      healthOverview?.score_governance,
      healthOverview?.score_security,
    ].map((v, idx) => {
      if (typeof v === 'number' && !Number.isNaN(v)) return Math.round(v);
      return healthSnapshot.radar[idx].value;
    });

    return {
      tooltip: { trigger: 'item' },
      radar: {
        indicator,
        splitNumber: 4,
        radius: '70%',
        axisName: { color: '#0f172a', fontWeight: 600 },
        splitArea: {
          areaStyle: {
            color: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1'],
          },
        },
        splitLine: { lineStyle: { color: '#94a3b8' } },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: values,
              name: '健康体检',
              areaStyle: { color: `${themeColor}33` },
              lineStyle: { color: themeColor, width: 2 },
              symbol: 'circle',
              symbolSize: 6,
              itemStyle: { color: themeColor, borderColor: '#ffffff', borderWidth: 2 },
            },
          ],
        },
      ],
    };
  }, [healthOverview, themeColor]);

  const coreMetrics = useMemo(
    () => [
      { key: 'openrank', label: 'OpenRank', value: healthOverview?.metric_openrank },
      { key: 'activity', label: 'Activity', value: healthOverview?.metric_activity },
      { key: 'attention', label: 'Attention', value: healthOverview?.metric_attention },
    ].map((m) => ({
      ...m,
      value: typeof m.value === 'number' && !Number.isNaN(m.value) ? Number(m.value.toFixed(2)) : null,
    })),
    [healthOverview],
  );

  const scoreToColor = useCallback((value) => {
    if (value < 70) return '#ef4444';
    if (value < 85) return '#f59e0b';
    return '#16a34a';
  }, []);

  const loadHealthOverview = useCallback(async () => {
    if (!selectedRepo) return;
    setHealthLoading(true);
    setHealthError('');
    setRiskLabel(null);
    try {
      const res = await fetchLatestHealthOverview(selectedRepo);
      const payload = res?.data || res;
      setHealthOverview(payload);
      setHealthMarkdown(pickMarkdown(payload));
      const top5 = extractTop5Share(payload);
      if (top5 !== null && top5 > 80) {
        setRiskLabel(`风险预警：Top5 贡献占比 ${top5.toFixed(1)}%`);
      }
    } catch (err) {
      setHealthError(err?.message || '加载健康数据失败');
      setHealthOverview(null);
      setHealthMarkdown('');
    } finally {
      setHealthLoading(false);
    }
  }, [selectedRepo]);

  const handleGenerateLink = useCallback(async () => {
    setLinkLoading(true);
    setCopyTip('');
    if (!selectedRepo) {
      setLinkError('请选择仓库');
      setLinkLoading(false);
      return;
    }
    setLinkError('');

    const baseFromEnv = (import.meta.env.VITE_DATAEASE_BASE || '').replace(/\/$/, '');
    const screenFromEnv = import.meta.env.VITE_DATAEASE_SCREEN_ID;
    if (baseFromEnv && screenFromEnv) {
      setDataEaseLink(`${baseFromEnv}/#/de-link/${screenFromEnv}?attachParams=${attachParams}`);
      setLinkLoading(false);
      return;
    }

    try {
      const res = await fetchDataEaseDashboardUrl(selectedRepo);
      const url = res?.dashboard_url || res?.data?.dashboard_url;
      if (!url) {
        throw new Error('未返回 DataEase 链接');
      }
      setDataEaseLink(url);
    } catch (err) {
      setLinkError(err?.message || '生成链接失败');
      setDataEaseLink('');
    } finally {
      setLinkLoading(false);
    }
  }, [attachParams, selectedRepo]);

  const dimensionSegments = useMemo(
    () => [
      { name: '活跃度', value: healthOverview?.score_vitality ?? healthSnapshot.radar[0].value, weight: 30 },
      { name: '响应度', value: healthOverview?.score_responsiveness ?? healthSnapshot.radar[1].value, weight: 25 },
      { name: '抗风险', value: healthOverview?.score_resilience ?? healthSnapshot.radar[2].value, weight: 20 },
      { name: '治理', value: healthOverview?.score_governance ?? healthSnapshot.radar[3].value, weight: 15 },
      { name: '安全', value: healthOverview?.score_security ?? healthSnapshot.radar[4].value, weight: 10 },
    ],
    [healthOverview],
  );

  const handleEnterFullscreen = useCallback(() => {
    const dom = trendChartRef.current?.ele || trendChartRef.current?.getEchartsInstance?.()?.getDom?.();
    if (dom?.requestFullscreen) {
      dom.requestFullscreen();
    }
  }, []);

  const healthGaugeOption = useMemo(() => {
    const clamped = Math.min(100, Math.max(0, currentScore));
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params) => {
          const score = params.data?.score ?? '-';
          return `${params.name}<br/>得分：${score} 分<br/>权重：${params.percent}%`;
        },
      },
      series: [
        {
          type: 'pie',
          radius: ['60%', '85%'],
          center: ['50%', '50%'],
          silent: false,
          startAngle: 90,
          label: {
            show: true,
            formatter: (p) => `${p.name}\n${p.data?.score ?? '-'}分 | ${p.percent}%`,
            fontSize: 11,
            color: '#0f172a',
          },
          labelLine: { show: true, length: 8, length2: 6 },
          data: dimensionSegments.map((d) => ({
            name: d.name,
            value: d.weight,
            score: Math.max(0, Math.round(d.value || 0)),
            itemStyle: {
              color: scoreToColor(Math.max(0, Math.round(d.value || 0))),
              borderRadius: 6,
              borderColor: '#fff',
              borderWidth: 2,
            },
          })),
        },
      ],
      graphic: [
        {
          type: 'group',
          left: 'center',
          top: 'center',
          children: [
            {
              type: 'text',
              style: {
                text: `${clamped}`,
                fontSize: 42,
                fontWeight: 800,
                fill: scoreToColor(clamped),
                textAlign: 'center',
              },
              left: 'center',
              top: -10,
            },
            {
              type: 'text',
              style: {
                text: '综合健康度',
                fontSize: 14,
                fill: '#64748b',
                textAlign: 'center',
              },
              left: 'center',
              top: 30,
            },
          ],
        },
      ],
    };
  }, [currentScore, dimensionSegments, scoreToColor]);

  const trendOption = useMemo(() => {
    const dates = trendSeries.map((item) => item.dt);
    const values = trendSeries.map((item) => item.value);

    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 50, right: 24, top: 32, bottom: 70 },
      toolbox: {
        feature: {
          dataZoom: { yAxisIndex: 'none' },
          restore: {},
          saveAsImage: {},
          myFullscreen: {
            show: true,
            title: '全屏查看',
            icon: 'path://M4 4h8v2H6v6H4V4zm16 0h-8v2h6v6h2V4zm0 16h-8v-2h6v-6h2v8zM4 20h8v-2H6v-6H4v8z',
            onclick: handleEnterFullscreen,
          },
        },
      },
      dataZoom: [
        { type: 'slider', start: 0, end: 100, height: 14, bottom: 24 },
        { type: 'inside' },
      ],
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLabel: { rotate: 0 },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v) => v.toFixed ? v.toFixed(1) : v },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        {
          type: 'line',
          data: values,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#2563eb', width: 3 },
          areaStyle: { color: 'rgba(37, 99, 235, 0.1)' },
        },
      ],
    };
  }, [trendSeries, handleEnterFullscreen]);

  const renderedMarkdown = useMemo(() => {
    if (!healthMarkdown) return '';
    return marked.parse(healthMarkdown, { breaks: true, gfm: true });
  }, [healthMarkdown]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeNav === 'health') {
      loadHealthOverview();
    }
  }, [activeNav, loadHealthOverview]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const userMessage = { id: `${Date.now()}-u`, role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const res = await postAgentRun({
        query: trimmed,
        selected_repo: selectedRepo || null,
        messages: [],
      });

      const reply =
        res?.report?.text ||
        formatAssistantReply(res?.tool_results?.length ? res : null) ||
        '已处理，稍后再试试。';

      setMessages((prev) => [...prev, { id: `${Date.now()}-a`, role: 'assistant', text: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-e`, role: 'assistant', text: `调用失败：${err?.message || '请稍后再试'}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handlePromptClick = (prompt) => {
    setInput(prompt);
  };

  const handleSelectConversation = (repo) => {
    setSelectedRepo(repo);
  };

  const handleNavClick = (key) => {
    setActiveNav(key);
  };

  const handleRefreshData = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshTodayHealth();
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-sys`, role: 'assistant', text: '已触发数据更新，稍后可再次查询最新健康度。' },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-err`, role: 'assistant', text: `更新失败：${err?.message || '请稍后再试'}` },
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const loadTrend = useCallback(
    async (metric) => {
      if (!selectedRepo || !metric) return;
      setTrendLoading(true);
      setTrendError('');
      setTrendSeries([]);
      try {
        const res = await fetchTrend(selectedRepo, metric.key);
        const rawList = res?.points || res?.data || res?.items || res || [];
        const list = Array.isArray(rawList) ? rawList : [];

        const normalized = list
          .filter((item) => item && item.dt !== undefined && item.value !== undefined)
          .map((item) => ({
            dt: item.dt,
            value: (() => {
              const raw = typeof item.value === 'number' ? item.value : parseFloat(item.value);
              if (Number.isNaN(raw)) return raw;
              return Number(raw.toFixed(2));
            })(),
          }))
          .filter((item) => !Number.isNaN(item.value));

        const sorted = normalized.sort((a, b) => new Date(a.dt).getTime() - new Date(b.dt).getTime());
        setTrendSeries(sorted);
      } catch (err) {
        setTrendError(err?.message || '趋势数据获取失败');
      } finally {
        setTrendLoading(false);
      }
    },
    [selectedRepo],
  );

  const handleMetricClick = (metric) => {
    setActiveMetric(metric);
    setShowTrendModal(true);
    loadTrend(metric);
  };

  const handleCopyLink = async () => {
    if (!dataEaseLink) return;
    try {
      await navigator.clipboard.writeText(dataEaseLink);
      setCopyTip('参数已复制');
    } catch (err) {
      setLinkError(err?.message || '复制失败');
    }
  };

  const handleCloseTrend = () => {
    setShowTrendModal(false);
    setTrendError('');
  };

  const renderPageContent = () => {
    if (activeNav === 'ai') return null;

    if (activeNav === 'health') {
      const renderRiskBanner = () => {
        if (!riskLabel) return null;
        return <div className="risk-banner">{riskLabel}</div>;
      };

      return (
        <div className="analysis-wrapper">
          {renderRiskBanner()}
          <section className="analysis-card">
            <div className="health-hero" style={{ '--theme-color': themeColor }}>
              <div className="health-head-row">
                <div className="health-head-info">
                  <div className="eyebrow">健康体检</div>
                  <div className="health-head-title">数据总览</div>
                </div>
              </div>
              <div className="health-hero-grid two-columns">
                <div className="gauge-panel">
                  <div className="chart-title">健康总分</div>
                  <div className="gauge-box">
                    <ReactECharts option={healthGaugeOption} style={{ height: 260, width: '100%' }} />
                  </div>
                  <div className="legend-row legend-compact">
                    <span className="legend-dot green" /> 绿 ≥85
                    <span className="legend-dot yellow" /> 黄 70-85
                    <span className="legend-dot red" /> 红 &lt;70
                  </div>
                </div>

                <div className="radar-panel">
                  <div className="chart-title">五维雷达图</div>
                  <div className="radar-card">
                    {healthLoading ? (
                      <div className="loading-text">雷达图加载中...</div>
                    ) : (
                      <ReactECharts option={healthRadarOption} style={{ height: 360 }} />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="export-hero-card">
              <div className="export-hero-text">已根据当前仓库配置动态生成 attachParams 参数</div>
              {!dataEaseLink ? (
                <button
                  className={`export-main-btn ${linkLoading ? 'loading' : ''}`}
                  onClick={handleGenerateLink}
                  disabled={linkLoading}
                >
                  <span className="export-icon">✨</span>
                  {linkLoading ? '正在联通 DataEase 引擎...' : '开启 DataEase 实时大屏分析'}
                  <span className="export-shine" />
                  {linkLoading && <span className="export-progress" />}
                </button>
              ) : (
                <div className="export-ready-row">
                  <a className="export-enter-btn" href={dataEaseLink} target="_blank" rel="noreferrer">
                    进入实时看板
                  </a>
                  <button className="export-copy-btn" onClick={handleCopyLink} title="复制参数">📋</button>
                  {copyTip && <span className="copy-tip">{copyTip}</span>}
                </div>
              )}
              {linkError && <div className="error-row compact">{linkError}</div>}
            </div>

            <div className="core-metric-panel">
              <div className="chart-title">核心指标</div>
              <div className="core-metric-grid">
                {coreMetrics.map((item) => (
                  <button
                    key={item.key}
                    className="core-metric-card"
                    onClick={() => handleMetricClick(item)}
                    disabled={healthLoading}
                  >
                    <div className="metric-card-top">
                      <span className="metric-name">{item.label}</span>
                      <span className="metric-trend-icon" aria-label="查看趋势">⤢</span>
                    </div>
                    <div className="metric-value-large">{item.value ?? '--'}</div>
                    <div className="metric-sub">查看趋势</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="analysis-card markdown-card">
            <div className="analysis-head">
              <div>
                <div className="eyebrow">分析报告</div>
                <h2>Markdown 格式洞察</h2>
              </div>
            </div>
            {healthLoading ? (
              <div className="loading-text">报告加载中...</div>
            ) : renderedMarkdown ? (
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />
            ) : (
              <div className="mini-list">
                {healthSnapshot.takeaways.map((text, idx) => (
                  <div key={idx} className="list-row">• {text}</div>
                ))}
              </div>
            )}
          </section>

          {showTrendModal && (
            <div className="trend-modal-overlay" onClick={handleCloseTrend}>
              <div className="trend-modal" onClick={(e) => e.stopPropagation()}>
                <div className="trend-modal-head">
                  <div>
                    <div className="eyebrow">趋势</div>
                    <h3>{activeMetric?.label || '指标趋势'}</h3>
                  </div>
                  <button className="ghost-btn" onClick={handleCloseTrend}>
                    关闭
                  </button>
                </div>

                {trendLoading ? (
                  <div className="loading-text">趋势加载中...</div>
                ) : trendError ? (
                  <div className="error-row">{trendError}</div>
                ) : trendSeries.length ? (
                  <ReactECharts ref={trendChartRef} option={trendOption} style={{ height: 360 }} />
                ) : (
                  <div className="loading-text">暂无趋势数据</div>
                )}

                <div className="modal-footnote">支持区域缩放，工具栏可保存图片或全屏查看。</div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activeNav === 'benchmark') {
      return (
        <div className="analysis-wrapper">
          <section className="analysis-card">
            <div className="analysis-head">
              <div>
                <div className="eyebrow">对标分析</div>
                <h2>同类分位与差距归因</h2>
              </div>
            </div>
            <div className="mini-grid">
              {benchmarkCards.map((c) => (
                <div key={c.title} className="mini-card">
                  <div className="mini-card-title">{c.title}</div>
                  <div className="mini-card-detail">{c.detail}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      );
    }

    if (activeNav === 'trend') {
      return (
        <div className="analysis-wrapper">
          <section className="analysis-card">
            <div className="analysis-head">
              <div>
                <div className="eyebrow">趋势预测</div>
                <h2>未来 4 周走势预估</h2>
              </div>
              <div className="pill">基于历史指标拟合</div>
            </div>
            <div className="trend-placeholder">趋势预测模块待接入模型输出，可在此展示预测曲线与置信区间。</div>
          </section>
        </div>
      );
    }

    if (activeNav === 'actions') {
      return (
        <div className="analysis-wrapper">
          <section className="analysis-card">
            <div className="analysis-head">
              <div>
                <div className="eyebrow">行动中心</div>
                <h2>治理清单</h2>
              </div>
            </div>
            <div className="mini-list">
              {actionTasks.map((a) => (
                <div key={a.title} className="list-row">
                  <div className="list-row-title">{a.title}</div>
                  <div className="list-row-meta">{a.impact} · 难度 {a.effort}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      );
    }

    if (activeNav === 'alerts') {
      return (
        <div className="analysis-wrapper">
          <section className="analysis-card">
            <div className="analysis-head">
              <div>
                <div className="eyebrow">风险预警</div>
                <h2>近期预警</h2>
              </div>
            </div>
            <div className="mini-list">
              {alertList.map((a) => (
                <div key={a.title} className={`alert-item ${a.level}`}>
                  <div>{a.title}</div>
                  <div className="alert-time">{a.time}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">OpenRank Agent</div>
        <div className="top-nav-links">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`top-nav-btn ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => handleNavClick(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="topbar-actions">
          <button className="ghost-btn" onClick={handleRefreshData} disabled={refreshing}>
            {refreshing ? '更新中…' : '更新数据'}
          </button>
          <div className="status-dot" title="在线" />
        </div>
      </header>

      <div className="content-grid">
        <aside className="nav-rail">
          <div className="nav-rail-header">
            <div className="nav-rail-title">OpenRank Agent</div>
            <div className="nav-rail-sub">开源智能治理台</div>
          </div>

          <button className="nav-new-btn">+ 新对话</button>

          <div className="nav-rail-group">
            {conversations.map((c) => (
              <button
                key={c.id}
                className={`nav-conv ${selectedRepo === c.repo ? 'active' : ''}`}
                onClick={() => handleSelectConversation(c.repo)}
              >
                <div className="nav-conv-title">{c.repo}</div>
                <div className="nav-conv-note">{c.tag}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="chat-column">
          {activeNav === 'ai' ? (
            <>
              <div className="chat-hero">
                <div>
                  <div className="eyebrow">AI Chat · 主工作区</div>
                  <h1>用对话完成体检、对标、治理和预警</h1>
                  <p>输入问题或选择提示，Agent 会调用后端 /agent/run 读取真实数据再生成报告。</p>
                </div>
                <div className="repo-input-group">
                  <label>仓库</label>
                  <input value={selectedRepo} onChange={(e) => setSelectedRepo(e.target.value)} />
                </div>
              </div>

              <div className="quick-prompts">
                {quickPrompts.map((p) => (
                  <button key={p} className="prompt-chip" onClick={() => handlePromptClick(p)}>
                    {p}
                  </button>
                ))}
              </div>

              <div className="chat-window">
                {messages.map((msg) => (
                  <div key={msg.id} className={`message ${msg.role}`}>
                    <div className="message-role">{msg.role === 'assistant' ? 'Agent' : '你'}</div>
                    <div className="message-body">{msg.text}</div>
                  </div>
                ))}
                <div ref={listEndRef} />
              </div>

              <div className="composer">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="问我：体检一下仓库、给出治理建议或生成风险预警"
                  rows={3}
                />
                <button className="primary-btn" onClick={handleSend} disabled={sending || !input.trim()}>
                  {sending ? '发送中…' : '发送'}
                </button>
              </div>
            </>
          ) : (
            renderPageContent()
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
