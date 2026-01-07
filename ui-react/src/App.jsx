import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { marked } from 'marked';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';
import TrendMonitor from './pages/TrendMonitor';
import {
  postAgentRun,
  refreshTodayHealth,
  refreshHealth,
  fetchLatestHealthOverview,
  fetchDataEaseDashboardUrl,
  fetchTrend,
  bootstrapHealth,
  postNewcomerPlan,
} from './service/api';

const navItems = [
  { key: 'ai', label: 'AI 聊天', note: '主界面' },
  { key: 'health', label: '健康体检', note: '健康分与雷达' },
  { key: 'benchmark', label: '开源新人', note: '贡献导航' },
  { key: 'trend', label: '趋势监控', note: '趋势解读' },
  { key: 'actions', label: '行动中心', note: '治理清单' },
  { key: 'alerts', label: '风险预警', note: '实时提示' },
];

const conversations = [
  { id: 'conv-1', repo: 'microsoft/vscode', tag: '默认' },
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
  const [domain, setDomain] = useState('Web前端');
  const [stack, setStack] = useState('JavaScript/TypeScript');
  const [timePerWeek, setTimePerWeek] = useState('1-2小时/周');
  const [keywords, setKeywords] = useState('');
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');
  const [activeTaskTab, setActiveTaskTab] = useState('good_first_issue');
  const [planModalOpen, setPlanModalOpen] = useState(false);
  
  // 添加调试信息，监听selectedRepo变化
  useEffect(() => {
    console.log('selectedRepo变化:', selectedRepo);
  }, [selectedRepo]);
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
  const [repoSearch, setRepoSearch] = useState('');
  const [repoActionMsg, setRepoActionMsg] = useState('');
  const [etlLoading, setEtlLoading] = useState(false);
  const [refreshOneLoading, setRefreshOneLoading] = useState(false);
  const [showTrendModal, setShowTrendModal] = useState(false);
  const [activeMetric, setActiveMetric] = useState(null);
  const [trendSeries, setTrendSeries] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState('');
  const [historyRepos, setHistoryRepos] = useState([{ id: 'hist-1', repo: 'microsoft/vscode', tag: '历史' }]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const listEndRef = useRef(null);
  const trendChartRef = useRef(null);
  const chatContainerRef = useRef(null);

  const attachParams = useMemo(() => (selectedRepo ? buildAttachParams(selectedRepo) : ''), [selectedRepo]);

  const filteredRepos = useMemo(() => {
    const term = repoSearch.trim().toLowerCase();
    let allRepos = [...historyRepos];
    if (!term) return allRepos;
    return allRepos.filter((c) => c.repo.toLowerCase().includes(term) || (c.tag || '').toLowerCase().includes(term));
  }, [repoSearch, historyRepos]);

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

    // 添加调试信息，确保selectedRepo被正确设置
    console.log('发送消息，当前仓库:', selectedRepo);

    const userMessage = { id: `${Date.now()}-u`, role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const res = await postAgentRun({
        query: trimmed,
        selected_repo: selectedRepo,
        // 传递完整的历史消息，确保上下文正确
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.text
        })),
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

  const addToHistory = (repo) => {
    if (!repo) return;
    setHistoryRepos(prev => {
      // 检查是否已存在，避免重复
      if (prev.some(item => item.repo === repo)) {
        // 如果已存在，移到最前面
        return [{ id: `hist-${Date.now()}`, repo, tag: '历史' }, ...prev.filter(item => item.repo !== repo)];
      }
      // 否则添加到最前面，最多保留10条
      return [{ id: `hist-${Date.now()}`, repo, tag: '历史' }, ...prev.slice(0, 9)];
    });
  };

  const handleSelectConversation = (repo) => {
    setSelectedRepo(repo);
    addToHistory(repo);
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

  const currentRepoInput = useMemo(() => repoSearch.trim() || selectedRepo, [repoSearch, selectedRepo]);

  const handleEtlRepo = useCallback(async () => {
    const repo = currentRepoInput;
    if (!repo) {
      setRepoActionMsg('请输入或选择仓库');
      return;
    }
    setEtlLoading(true);
    setRepoActionMsg('');
    try {
      const res = await bootstrapHealth(repo);
      setRepoActionMsg(`已拉取历史指标：${res?.data?.repo || repo}`);
      setSelectedRepo(repo);
    } catch (err) {
      setRepoActionMsg(err?.message || '拉取失败');
    } finally {
      setEtlLoading(false);
    }
  }, [currentRepoInput]);

  const handleRefreshRepo = useCallback(async () => {
    const repo = currentRepoInput;
    if (!repo) {
      setRepoActionMsg('请输入或选择仓库');
      return;
    }
    setRefreshOneLoading(true);
    setRepoActionMsg('');
    try {
      const res = await refreshHealth(repo);
      const dtValue = res?.data?.dt || res?.data?.date || 'today';
      setRepoActionMsg(`已刷新 ${repo} - ${dtValue}`);
      setSelectedRepo(repo);
    } catch (err) {
      setRepoActionMsg(err?.message || '刷新失败');
    } finally {
      setRefreshOneLoading(false);
    }
  }, [currentRepoInput]);

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

  const handleGeneratePlan = useCallback(async () => {
    setPlanLoading(true);
    setPlanError('');
    try {
      const res = await postNewcomerPlan({
        domain,
        stack,
        time_per_week: timePerWeek,
        keywords,
      });
      setPlan(res);
      setActiveTaskTab('good_first_issue');
      setPlanModalOpen(true);
      return res;
    } catch (err) {
      setPlan(null);
      setPlanError(err?.message || '生成失败，请稍后再试');
      return null;
    } finally {
      setPlanLoading(false);
    }
  }, [domain, stack, timePerWeek, keywords]);

  const handleShowRoute = useCallback(async () => {
    if (!plan) {
      const res = await handleGeneratePlan();
      if (!res) return;
    }
    setPlanModalOpen(true);
  }, [handleGeneratePlan, plan]);

  const handleClaimFirstTask = useCallback(async () => {
    const currentPlan = plan || (await handleGeneratePlan());
    const list = currentPlan?.tasks?.[activeTaskTab] || [];
    if (!list.length) {
      setPlanError('暂无可领取的任务');
      return;
    }
    const first = list[0];
    if (first?.url) {
      window.open(first.url, '_blank', 'noopener');
    }
  }, [activeTaskTab, handleGeneratePlan, plan]);

  const handleCopyPlanSteps = useCallback(async () => {
    const currentPlan = plan || (await handleGeneratePlan());
    const markdown = currentPlan?.default_steps?.copy_markdown;
    if (!markdown) {
      setPlanError('暂无可复制的步骤');
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
    } catch (err) {
      setPlanError(err?.message || '复制失败');
    }
  }, [handleGeneratePlan, plan]);

  const planSummary = useMemo(() => {
    if (!plan?.repos?.length) return '';
    const top = plan.repos[0];
    const reasons = top.reasons || [];
    const ds = plan.default_steps || {};
    const pr = ds.pr_steps && ds.pr_steps.length ? ds.pr_steps : ['按 Fork→Clone→Build→PR→Review→Merge 路径执行'];
    const trend = typeof top.trend_30d_percent === 'number' ? `${top.trend_30d_percent >= 0 ? '+' : ''}${top.trend_30d_percent}%` : '';
    const health = top.scores?.health !== undefined ? Math.round(top.scores.health) : undefined;
    const resp = top.scores?.resp !== undefined ? Math.round(top.scores.resp) : undefined;
    const domain = top.domain || top.tech_family || top.primary_language || '目标领域';
    const pain = reasons[0] || '典型业务痛点';
    const tech = top.primary_language || top.language || '核心技术栈';

    return [
      '## 推荐仓库',
      `- 仓库：${top.repo_full_name || top.name || ''}`,
      `- 匹配度：${top.match_percent ?? '--'}%` + (health !== undefined ? ` ｜ 健康度：${health}分` : '') + (trend ? ` ｜ 近30天活跃：${trend}` : ''),
      resp !== undefined ? `- 维护者响应：${resp}分` : null,
      '',
      '## 推荐理由',
      `- 💡 项目定位：这个项目在 ${domain} 中处于活跃地位，主要解决了 ${pain}，用于快速落地与实践。`,
      `- 🎯 推荐逻辑：基于你的技能匹配度（${top.match_percent ?? '--'}%）与技术栈 ${tech}，这个项目能让你在 ${domain} 方向获得实战。`,
      `- 📈 成长阶梯：1) 熟悉工程规范；2) 掌握 ${tech} 核心技术；3) 建立 ${domain} 社区联系。`,
      '',
      '## PR Checklist',
      ...pr.map((s) => `- ${s}`),
      ds.notes ? `
> ${ds.notes}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }, [plan]);

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

  // 全屏切换函数
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
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
                    <ReactECharts option={healthGaugeOption} opts={{ useResizeObserver: false }} style={{ height: 260, width: '100%' }} />
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
                      <ReactECharts option={healthRadarOption} opts={{ useResizeObserver: false }} style={{ height: 360 }} />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="export-hero-card">

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
                  <ReactECharts ref={trendChartRef} option={trendOption} opts={{ useResizeObserver: false }} style={{ height: 360 }} />
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
      const interestAreas = ['Web前端', '后端/企业应用', '移动开发', '云原生/基础设施', 'AI/深度学习', '安全/合规', '开源生态分析', '文档', '翻译'];
      const skillStacks = ['JavaScript/TypeScript', 'Python', 'Go', 'Java', 'Rust'];
      const timeCommits = ['1-2小时/周', '3-5小时/周', '5-10小时/周', '10+小时/周'];

      const fallbackProjects = [
        { repo_full_name: 'microsoft/vscode', match_percent: 95, difficulty: 'Easy', activity_percent: 98, maintainer_response_percent: 92, trend_30d_percent: 12, description: 'Visual Studio Code - 开源代码编辑器' },
        { repo_full_name: 'facebook/react', match_percent: 92, difficulty: 'Medium', activity_percent: 99, maintainer_response_percent: 89, trend_30d_percent: 8, description: 'React - JavaScript 库，用于构建用户界面' },
        { repo_full_name: 'vuejs/core', match_percent: 90, difficulty: 'Easy', activity_percent: 97, maintainer_response_percent: 94, trend_30d_percent: 15, description: 'Vue.js - 渐进式 JavaScript 框架' },
        { repo_full_name: 'python/cpython', match_percent: 88, difficulty: 'Medium', activity_percent: 96, maintainer_response_percent: 85, trend_30d_percent: 5, description: 'Python 解释器' },
      ];

      const cards = (plan?.repos?.length ? plan.repos : fallbackProjects).map((item, idx) => ({
        id: idx,
        name: item.repo_full_name,
        url: item.url,
        match: item.match_percent,
        difficulty: item.difficulty,
        activity: item.activity_percent,
        response: item.maintainer_response_percent,
        trend: `${item.trend_30d_percent >= 0 ? '+' : ''}${item.trend_30d_percent}%`,
        description: item.description || '点击查看仓库详情',
        reasons: item.reasons || [],
      }));

      const fallbackTasks = {
        good_first_issue: [
          { title: '修复文档中的拼写错误', repo_full_name: 'microsoft/vscode', difficulty: 'Easy', url: '#' },
        ],
        help_wanted: [
          { title: '添加新的测试用例', repo_full_name: 'facebook/react', difficulty: 'Medium', url: '#' },
        ],
        docs: [
          { title: '更新中文文档', repo_full_name: 'vuejs/core', difficulty: 'Easy', url: '#' },
        ],
        translation: [
          { title: '翻译 README 到日语', repo_full_name: 'python/cpython', difficulty: 'Easy', url: '#' },
        ],
      };

      const tasksSource = plan?.tasks || fallbackTasks;
      const taskTabs = [
        { key: 'good_first_issue', label: 'Good First Issue' },
        { key: 'help_wanted', label: 'Help Wanted' },
        { key: 'docs', label: '文档类任务' },
        { key: 'translation', label: '翻译类任务' },
      ];

      const defaultSteps = plan?.default_steps;

      return (
        <div className="newcomer-wrapper">
          {/* 入门向导 Hero */}
          <section className="newcomer-hero">
            <div className="newcomer-hero-content">
              <h1>启航入门 · 贡献导航</h1>
              <p>从“我是谁/我会什么/我想参与什么”出发，给新人一条可执行的贡献路径。</p>
            </div>
            
            {/* 三步入门向导 */}
            <div className="onboarding-steps">
              <div className="step-card">
                <div className="step-number">1</div>
                <div className="step-title">选择兴趣领域</div>
                <select
                  className="step-select"
                  value={domain}
                  onChange={(e) => {
                    setDomain(e.target.value);
                    setPlan(null);
                    setPlanModalOpen(false);
                  }}
                >
                  {interestAreas.map((area) => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
              </div>
              
              <div className="step-card">
                <div className="step-number">2</div>
                <div className="step-title">选择技能栈</div>
                <select
                  className="step-select"
                  value={stack}
                  onChange={(e) => {
                    setStack(e.target.value);
                    setPlan(null);
                    setPlanModalOpen(false);
                  }}
                >
                  {skillStacks.map((skill) => (
                    <option key={skill} value={skill}>{skill}</option>
                  ))}
                </select>
              </div>
              
              <div className="step-card">
                <div className="step-number">3</div>
                <div className="step-title">每周可投入时间</div>
                <select
                  className="step-select"
                  value={timePerWeek}
                  onChange={(e) => {
                    setTimePerWeek(e.target.value);
                    setPlan(null);
                    setPlanModalOpen(false);
                  }}
                >
                  {timeCommits.map((time) => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 关键 CTA */}
            <div className="hero-cta-group">
              <button className="primary-btn large" onClick={handleShowRoute} disabled={planLoading}>
                {planLoading ? '生成中...' : plan ? '查看项目路线' : '生成项目路线'}
              </button>
            </div>
            {planError && <div className="error-row compact">{planError}</div>}
          </section>
          
          {/* 项目推荐卡片区 */}
          <section className="newcomer-section">
            <div className="section-head">
              <h2>项目推荐</h2>
              <p>根据你的选择，为你推荐匹配度最高的开源项目</p>
            </div>
            
            <div className="project-cards">
              {cards.map((project) => (
                <div key={project.id} className="project-card">
                  <div className="project-header">
                    <div className="project-title">{project.name}</div>
                    <div className="match-badge">匹配度 {project.match}%</div>
                  </div>
                  <div className="project-description">{project.description}</div>
                  <div className="project-metrics">
                    <div className="metric-item">
                      <span className="metric-label">上手难度</span>
                      <span className={`metric-value ${project.difficulty.toLowerCase()}`}>{project.difficulty}</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">活跃度</span>
                      <span className="metric-value">{project.activity}%</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">维护者响应</span>
                      <span className="metric-value">{project.response}%</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">近 30 天趋势</span>
                      <span className="metric-value positive">{project.trend}</span>
                    </div>
                  </div>
                  <div className="project-cta">
                    <button className="project-btn" onClick={() => project.url && window.open(project.url, '_blank', 'noopener')}>
                      查看项目
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          
          {/* 新手任务看板 */}
          <section className="newcomer-section">
            <div className="section-head">
              <h2>新手任务看板</h2>
              <p>从简单任务开始，迈出你的开源贡献第一步</p>
            </div>
            
            <div className="task-board">
              <div className="task-tabs">
                {taskTabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`task-tab ${activeTaskTab === tab.key ? 'active' : ''}`}
                    onClick={() => setActiveTaskTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              
              <div className="task-list">
                {(tasksSource[activeTaskTab] || []).map((task, idx) => (
                  <div key={`${task.title}-${idx}`} className="task-item">
                    <div className="task-type-badge">{task.repo_full_name}</div>
                    <div className="task-content">
                      <div className="task-title">{task.title}</div>
                      <div className="task-repo">{task.repo_full_name}</div>
                      <div className="task-meta">
                        <span className={`difficulty ${(task.difficulty || 'Medium').toLowerCase()}`}>{task.difficulty || 'Medium'}</span>
                      </div>
                    </div>
                    <div className="task-actions">
                      <button className="task-btn" onClick={() => task.url && window.open(task.url, '_blank', 'noopener')}>
                        领取任务
                      </button>
                    </div>
                  </div>
                ))}
                {!planLoading && !(tasksSource[activeTaskTab] || []).length && (
                  <div className="loading-text">暂无任务</div>
                )}
                {planLoading && <div className="loading-text">任务加载中...</div>}
              </div>
            </div>
          </section>
          
          {/* 贡献路径 Timeline */}
          <section className="newcomer-section">
            <div className="section-head">
              <h2>贡献路径 Timeline</h2>
              <p>从 0 到 1，完整的贡献流程</p>
            </div>
            <div className="contribution-timeline">
              <div className="timeline-column">
                <div className="timeline-title">PR Checklist</div>
                <div className="timeline-list">
                  {(defaultSteps?.pr_steps || ['提交 PR，等待 Review']).map((step, idx) => (
                    <div key={`pr-${idx}`} className="timeline-row">{step}</div>
                  ))}
                </div>
              </div>
            </div>
          </section>
          
          {/* AI 指导侧栏 */}
          <section className="ai-guide-section">
            <div className="ai-guide-card">
              <div className="ai-guide-header">
                <h3>「我该怎么做」AI 指导</h3>
                <div className="ai-icon">🤖</div>
              </div>
              
              <div className="ai-input-group">
                <textarea 
                  placeholder="输入一句话，例如：'我会 Python，想做文档贡献'"
                  className="ai-input"
                ></textarea>
                <button className="ai-submit-btn">生成指导</button>
              </div>
              
              <div className="ai-result-preview">
                <div className="ai-result-title">操作清单 + 指令</div>
                <div className="ai-result-content">
                  <p>根据你的输入，AI 将为你生成详细的操作步骤和指令...</p>
                </div>
              </div>
            </div>
          </section>

          {planModalOpen && (
            <div className="trend-modal-overlay" onClick={() => setPlanModalOpen(false)}>
              <div className="trend-modal" onClick={(e) => e.stopPropagation()}>
                <div className="trend-modal-head">
                  <div>
                    <div className="eyebrow">项目路线</div>
                    <h3>推荐原因 & 行动步骤</h3>
                  </div>
                  <button className="ghost-btn" onClick={() => setPlanModalOpen(false)}>关闭</button>
                </div>
                {planSummary ? (
                  <div className="plan-modal-body markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {planSummary}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="loading-text">暂无路线，请先生成。</div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activeNav === 'trend') {
      return (
        <TrendMonitor
          repo={selectedRepo}
          onRepoChange={(next) => {
            setSelectedRepo(next);
            setRepoSearch(next);
            addToHistory(next);
          }}
          onRepoPinned={addToHistory}
        />
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
        <aside className="nav-rail repo-rail">
          <div className="nav-rail-header">
            <div className="nav-rail-title">仓库栏</div>
            <div className="nav-rail-sub">搜索、拉取历史、刷新当日</div>
          </div>

          <div className="repo-search">
            <label>仓库</label>
            <input
              value={repoSearch}
              onChange={(e) => setRepoSearch(e.target.value)}
              placeholder="owner/repo"
            />
            <button className="repo-use-btn" onClick={() => {
              const repo = repoSearch || selectedRepo;
              setSelectedRepo(repo);
              addToHistory(repo);
            }}>
              设为当前
            </button>
          </div>

          <div className="repo-actions">
            <button className="mini-btn" onClick={handleEtlRepo} disabled={etlLoading}>
              {etlLoading ? '拉取中…' : 'ETL 历史'}
            </button>
            <button className="mini-btn" onClick={handleRefreshRepo} disabled={refreshOneLoading}>
              {refreshOneLoading ? '刷新中…' : '刷新当日'}
            </button>
          </div>
          {repoActionMsg && <div className="repo-hint">{repoActionMsg}</div>}

          <div className="nav-rail-group repo-list">
            {filteredRepos.map((c) => (
              <button
                key={c.id}
                className={`nav-conv ${selectedRepo === c.repo ? 'active' : ''}`}
                onClick={() => {
                  // 直接更新selectedRepo，确保仓库被正确选中
                  setSelectedRepo(c.repo);
                  setRepoSearch(c.repo);
                  addToHistory(c.repo);
                }}
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
              {/* 聊天主区域 - 限制宽度 + 居中 */}
              <div ref={chatContainerRef} className={`chat-container ${isFullscreen ? 'fullscreen' : ''}`}>
                {/* 顶部标题栏 - 始终显示 */}
                <div className="chat-hero-modern">
                  <div className="chat-hero-header">
                    <div className="chat-hero-content">
                      <div className="eyebrow">AI Chat · 主工作区</div>
                      <h1>用对话完成体检、对标、治理和预警</h1>
                      <p>输入问题或选择提示，Agent 会调用后端 /agent/run 读取真实数据再生成报告。</p>
                    </div>
                    {/* 右上角当前仓库和全屏按钮 */}
                    <div className="hero-actions">
                      {/* 当前仓库 */}
                      <div className="current-repo-badge">
                        <span className="repo-label">当前仓库:</span>
                        <span className="repo-value">{selectedRepo}</span>
                      </div>
                      {/* 全屏切换按钮 */}
                      <button 
                        className="fullscreen-toggle-btn"
                        onClick={toggleFullscreen}
                        title={isFullscreen ? '退出全屏' : '全屏'}
                      >
                        {isFullscreen ? '⬜' : '⛶'}
                      </button>
                    </div>
                  </div>
                  {/* 快捷提示词 */}
                  <div className="quick-prompts-inline">
                    {quickPrompts.map((p) => (
                      <button key={p} className="prompt-chip-modern" onClick={() => handlePromptClick(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 消息列表 */}
                <div className="chat-window-modern">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`message-bubble ${msg.role === 'user' ? 'message-user' : 'message-assistant'}`}>
                      {/* 头像 */}
                      <div className={`message-avatar ${msg.role === 'user' ? 'avatar-user' : 'avatar-assistant'}`}>
                        {msg.role === 'assistant' ? '🤖' : '👤'}
                      </div>
                      
                      {/* 消息内容 */}
                      <div className="message-content-wrapper">
                        <div className="message-role-label">{msg.role === 'assistant' ? 'OpenRank Agent' : '你'}</div>
                        <div className={`message-content ${msg.role === 'assistant' ? 'content-assistant' : 'content-user'}`}>
                          {msg.role === 'assistant' ? (
                            <div className="markdown-content">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.text}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <div className="text-content">{msg.text}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="message-bubble message-assistant">
                      <div className="message-avatar avatar-assistant">🤖</div>
                      <div className="message-content-wrapper">
                        <div className="message-role-label">OpenRank Agent</div>
                        <div className="message-content content-assistant">
                          <div className="typing-indicator">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={listEndRef} />
                </div>

                {/* 底部输入区 - 自适应高度 */}
                <div className="composer-modern">
                  <div className="composer-wrapper">
                    <textarea
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        // 自动调整高度，限制最大高度
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="问我：体检一下仓库、给出治理建议或生成风险预警..."
                      className="composer-input"
                      rows={1}
                    />
                    <button 
                      className="composer-send-btn" 
                      onClick={handleSend} 
                      disabled={sending || !input.trim()}
                      title="发送 (Enter)"
                    >
                      {sending ? (
                        <span className="sending-spinner">⏳</span>
                      ) : (
                        <span>➤</span>
                      )}
                    </button>
                  </div>
                  <div className="composer-footer">
                    <span className="composer-hint">支持 Markdown 输入 · 按 Enter 发送，Shift+Enter 换行</span>
                  </div>
                </div>
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
