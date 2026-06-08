/**
 * 成员五：演化趋势与关联分析 — 前端可视化脚本
 * 复现 Nature Human Behaviour 论文 Figure 4b, 4d 与 Figure 5a–e
 * 适配滚动叙事 journal-style 浅色主题
 */

// ========== 全局配置 ==========
const CONFIG = {
    dataBase: './data',
    intervals: [
        '1973-1977', '1978-1982', '1983-1987', '1988-1992',
        '1993-1997', '1998-2002', '2003-2007', '2008-2012', '2013-2017'
    ],
    colors: {
        nestedness: '#2166ac',
        rowNested: '#92c5de',
        colNested: '#d1e5f0',
        modularity: '#b2182b',
        diversity: '#2c7a4e',
        publications: '#d95f02',
        gdp: '#4dac26',
        eci: '#7b3294',
        scatter: '#4393c3',
        income: {
            'Low': '#d7191c',
            'Lower middle': '#fdae61',
            'Upper middle': '#abd9e9',
            'High': '#2c7a4e'
        }
    },
    baseLayout: {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0.02)',
        font: { color: '#555', size: 11, family: 'Georgia, Times New Roman, serif' },
        margin: { l: 62, r: 28, t: 18, b: 58 },
        legend: {
            font: { color: '#555', size: 10 },
            bgcolor: 'rgba(255,255,255,0.92)',
            bordercolor: '#e5e5e0',
            borderwidth: 1,
            itemclick: 'toggleothers',
            itemdoubleclick: 'toggle'
        },
        hovermode: 'closest',
        dragmode: 'zoom',
        autosize: true,
        xaxis: {
            gridcolor: '#e5e5e0',
            zerolinecolor: '#d4d4cc',
            tickfont: { color: '#888', size: 10 },
            title: { font: { color: '#555', size: 12 } }
        },
        yaxis: {
            gridcolor: '#e5e5e0',
            zerolinecolor: '#d4d4cc',
            tickfont: { color: '#888', size: 10 },
            title: { font: { color: '#555', size: 12 } }
        }
    }
};

// ========== 数据加载 ==========
async function loadCSV(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`无法加载 ${path}: ${res.status}`);
    const text = await res.text();
    return Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
}

async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`无法加载 ${path}: ${res.status}`);
    return res.json();
}

// ========== 工具函数 ==========
function zScore(values) {
    const finite = values.map(Number).filter(v => Number.isFinite(v));
    if (finite.length === 0) return values.map(() => null);
    const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
    const variance = finite.reduce((s, v) => s + (v - mean) ** 2, 0) / finite.length;
    const std = Math.sqrt(variance);
    if (std === 0) return values.map(() => 0);
    return values.map(v => Number.isFinite(Number(v)) ? (Number(v) - mean) / std : null);
}

const LOG_SCALE_FIELDS = new Set(['Publications', 'GDP']);

function toLog10(val) {
    const num = Number(val);
    return (Number.isFinite(num) && num > 0) ? Math.log10(num) : null;
}

function linearRegression(xs, ys) {
    const n = xs.length;
    if (n < 2) return { slope: 0, intercept: 0, r: 0, r2: 0, sortedXs: [], preds: [] };
    const xm = xs.reduce((a, b) => a + b, 0) / n;
    const ym = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - xm, dy = ys[i] - ym;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }
    const slope = denX === 0 ? 0 : num / denX;
    const intercept = ym - slope * xm;
    const r = (denX === 0 || denY === 0) ? 0 : num / Math.sqrt(denX * denY);
    const sortedXs = [...xs].sort((a, b) => a - b);
    const preds = sortedXs.map(x => slope * x + intercept);
    return { slope, intercept, r, r2: r * r, sortedXs, preds };
}

function lightLayout(overrides = {}) {
    const base = CONFIG.baseLayout;
    return {
        ...base,
        ...overrides,
        xaxis: { ...base.xaxis, ...(overrides.xaxis || {}) },
        yaxis: { ...base.yaxis, ...(overrides.yaxis || {}) }
    };
}

// Plotly 图表缩放激活管理：默认滚轮浏览网页，点击图表后才启用滚轮缩放
let zoomActiveChart = null;

function setupChartZoom(divId) {
    const el = document.getElementById(divId);
    if (!el) return;

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (zoomActiveChart && zoomActiveChart !== el) {
            zoomActiveChart._context.scrollZoom = false;
            zoomActiveChart.style.cursor = '';
        }
        zoomActiveChart = el;
        el._context.scrollZoom = true;
        el.style.cursor = 'move';
    });

    el.addEventListener('mouseleave', () => {
        if (zoomActiveChart === el) {
            el._context.scrollZoom = false;
            zoomActiveChart = null;
            el.style.cursor = '';
        }
    });
}

document.addEventListener('click', () => {
    if (zoomActiveChart) {
        zoomActiveChart._context.scrollZoom = false;
        zoomActiveChart.style.cursor = '';
        zoomActiveChart = null;
    }
});

function createPlot(divId, traces, layout, config = {}) {
    const finalConfig = Object.assign({ scrollZoom: false }, config);
    const promise = Plotly.newPlot(divId, traces, layout, finalConfig);
    promise.then(() => setupChartZoom(divId));
    return promise;
}

function clearLoading(divId) {
    const el = document.getElementById(divId);
    if (el) el.innerHTML = '';
}

// ========== 全局状态 ==========
let store = {
    summary: null,
    nested: null,
    modular: null,
    merged: null,
    correlations: null,
    incomeGroups: null,
    intervals: []
};

// ========== 主数据加载 ==========
async function loadAllMember5Data() {
    const base = CONFIG.dataBase;
    const [summary, nested, modular, merged, correlations, incomeGroups, zscoreData] = await Promise.all([
        loadCSV(base + '/summary_statistics_by_interval.csv'),
        loadCSV(base + '/nestedness_nodf.csv'),
        loadCSV(base + '/bipartite_modularity_by_interval.csv'),
        loadCSV(base + '/merged_timeseries.csv'),
        loadJSON(base + '/correlations_by_interval.json'),
        loadCSV(base + '/income_group_timeseries.csv').catch(() => null),
        loadCSV(base + '/zscore_null_model.csv').catch(() => null)
    ]);

    store.summary = summary.filter(r => r.Time_Interval);
    store.nested = nested.filter(r => r.Time_Interval);
    store.modular = modular.filter(r => r.Time_Interval);
    store.merged = merged.filter(r => r.Time_Interval && r.Country);
    store.correlations = correlations;
    store.incomeGroups = incomeGroups ? incomeGroups.filter(r => r.Time_Interval) : null;
    store.zscores = zscoreData ? zscoreData.filter(r => r.Time_Interval) : null;
    store.intervals = store.summary.map(r => r.Time_Interval).sort();
}

// ================================================================
//  Figure 4b: 嵌套性 NODF z-score 时间演化
// ================================================================
function createFig4b() {
    clearLoading('fig4bChart');
    const intervals = store.summary.map(r => r.Time_Interval);
    const nodfTotalRaw = store.summary.map(r => Number(r.Nestedness_NODF));
    const nodfRowRaw = store.nested.map(r => Number(r.row_nestedness));
    const nodfColRaw = store.nested.map(r => Number(r.col_nestedness));

    let nodfTotal, nodfRow, nodfCol, zLabel, zSource;
    if (store.zscores && store.zscores.length > 0) {
        const zMap = {};
        store.zscores.forEach(r => { zMap[r.Time_Interval] = Number(r.NODF_zscore); });
        nodfTotal = intervals.map(iv => zMap[iv] !== undefined ? zMap[iv] : null);
        nodfRow = zScore(nodfRowRaw);
        nodfCol = zScore(nodfColRaw);
        zLabel = '嵌套性 z-score (fixed-fixed null model)';
        zSource = 'null';
    } else {
        nodfTotal = zScore(nodfTotalRaw);
        nodfRow = zScore(nodfRowRaw);
        nodfCol = zScore(nodfColRaw);
        zLabel = '嵌套性 z-score (标准化)';
        zSource = 'std';
    }

    const rawMean = nodfTotalRaw.filter(v => Number.isFinite(v)).reduce((a, b) => a + b, 0) /
        nodfTotalRaw.filter(v => Number.isFinite(v)).length;
    const rawStd = Math.sqrt(nodfTotalRaw.filter(v => Number.isFinite(v))
        .reduce((s, v) => s + (v - rawMean) ** 2, 0) / nodfTotalRaw.filter(v => Number.isFinite(v)).length);

    const xsIdx = intervals.map((_, i) => i);
    const nodfFinite = nodfTotal.filter(v => v !== null);
    const xsFinite = xsIdx.filter((_, i) => nodfTotal[i] !== null);
    const trend = linearRegression(xsFinite, nodfFinite);

    const traces = [
        {
            x: intervals, y: nodfTotal,
            name: zLabel,
            mode: 'lines+markers',
            line: { color: CONFIG.colors.nestedness, width: 2.8 },
            marker: { size: 9, color: CONFIG.colors.nestedness,
                      line: { color: '#fff', width: 0.8 } },
            hovertemplate: '<b>NODF z-score</b>: %{y:.2f}<br>' +
                (zSource === 'null' ? '<i>fixed-fixed null model</i>' :
                 '<i>μ=' + rawMean.toFixed(4) + ', σ=' + rawStd.toFixed(4) + '</i>') +
                '<extra></extra>'
        },
        {
            x: intervals, y: nodfRow,
            name: '行嵌套性 z-score (国家)',
            mode: 'lines+markers',
            line: { color: CONFIG.colors.rowNested, width: 1.6, dash: 'dash' },
            marker: { size: 6, color: CONFIG.colors.rowNested },
            hovertemplate: '<b>Row z-score</b>: %{y:.2f}<extra></extra>'
        },
        {
            x: intervals, y: nodfCol,
            name: '列嵌套性 z-score (学科)',
            mode: 'lines+markers',
            line: { color: CONFIG.colors.colNested, width: 1.6, dash: 'dot' },
            marker: { size: 6, color: CONFIG.colors.colNested },
            hovertemplate: '<b>Column z-score</b>: %{y:.2f}<extra></extra>'
        }
    ];

    traces.push({
        x: [intervals[0], intervals[intervals.length - 1]],
        y: [0, 0],
        name: 'z = 0 (null 期望)',
        mode: 'lines',
        line: { color: '#bbb', width: 1, dash: 'dot' },
        hoverinfo: 'skip'
    });

    if (trend.preds && trend.preds.length >= 2) {
        const trendY = intervals.map((_, i) => trend.slope * i + trend.intercept);
        traces.push({
            x: intervals, y: trendY,
            name: `线性趋势 (R²=${trend.r2.toFixed(3)})`,
            mode: 'lines',
            line: { color: 'rgba(0,0,0,0.3)', width: 1.2, dash: 'longdash' },
            hoverinfo: 'skip'
        });
    }

    createPlot('fig4bChart', traces, lightLayout({
        xaxis: { title: { text: '时间区间' }, tickangle: -30 },
        yaxis: { title: { text: zLabel }, zeroline: true,
                 zerolinecolor: '#d4d4cc', zerolinewidth: 1.5 },
        legend: { x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top' },
        hovermode: 'x unified'
    }), { responsive: true, displaylogo: false });
}

// ================================================================
//  Figure 4d: 模块性 Q z-score 时间演化
// ================================================================
function createFig4d() {
    clearLoading('fig4dChart');
    const intervals = store.modular.map(r => r.Time_Interval);
    const qRaw = store.modular.map(r => Number(r.Modularity_Q));

    let qValues, zLabel, zSource;
    if (store.zscores && store.zscores.length > 0) {
        const zMap = {};
        store.zscores.forEach(r => { zMap[r.Time_Interval] = Number(r.Q_zscore); });
        qValues = intervals.map(iv => zMap[iv] !== undefined ? zMap[iv] : null);
        zLabel = '模块性 z-score (fixed-fixed null model)';
        zSource = 'null';
    } else {
        qValues = zScore(qRaw);
        zLabel = '模块性 z-score (标准化)';
        zSource = 'std';
    }

    const rawMean = qRaw.filter(v => Number.isFinite(v)).reduce((a, b) => a + b, 0) /
        qRaw.filter(v => Number.isFinite(v)).length;
    const rawStd = Math.sqrt(qRaw.filter(v => Number.isFinite(v))
        .reduce((s, v) => s + (v - rawMean) ** 2, 0) / qRaw.filter(v => Number.isFinite(v)).length);

    const idx2002 = intervals.findIndex(iv => iv === '1998-2002');
    let earlyTrend = null;
    if (idx2002 >= 0) {
        const earlyQ = qValues.slice(0, idx2002 + 1).filter(v => v !== null);
        if (earlyQ.length >= 2) {
            earlyTrend = linearRegression(earlyQ.map((_, i) => i), earlyQ);
        }
    }

    const lateQ = qValues.slice(idx2002 >= 0 ? idx2002 : 0).filter(v => v !== null);
    const plateauMean = lateQ.length > 0 ? lateQ.reduce((a, b) => a + b, 0) / lateQ.length : 0;

    const traces = [
        {
            x: intervals, y: qValues,
            name: zLabel,
            mode: 'lines+markers',
            line: { color: CONFIG.colors.modularity, width: 2.8 },
            marker: { size: 10, color: CONFIG.colors.modularity,
                      line: { color: '#fff', width: 0.8 } },
            hovertemplate: '<b>Q z-score</b>: %{y:.2f}<br>' +
                (zSource === 'null' ? '<i>fixed-fixed null model</i>' :
                 '<i>μ=' + rawMean.toFixed(4) + ', σ=' + rawStd.toFixed(4) + '</i>') +
                '<extra></extra>'
        },
        {
            x: [intervals[0], intervals[intervals.length - 1]],
            y: [0, 0],
            name: 'z = 0 (null 期望)',
            mode: 'lines',
            line: { color: '#bbb', width: 1, dash: 'dot' },
            hoverinfo: 'skip'
        }
    ];

    if (earlyTrend && earlyTrend.preds && earlyTrend.preds.length >= 2) {
        const earlyIntervals = intervals.slice(0, idx2002 + 1);
        traces.push({
            x: earlyIntervals, y: earlyTrend.preds,
            name: '早期上升趋势',
            mode: 'lines',
            line: { color: 'rgba(178,24,43,0.35)', width: 1.2, dash: 'dash' },
            hoverinfo: 'skip'
        });
    }

    if (lateQ.length >= 2) {
        const lateIntervals = intervals.slice(idx2002 >= 0 ? idx2002 : 0);
        traces.push({
            x: lateIntervals, y: Array(lateIntervals.length).fill(plateauMean),
            name: `后期均值 z≈${plateauMean.toFixed(1)}`,
            mode: 'lines',
            line: { color: 'rgba(0,0,0,0.25)', width: 1, dash: 'dashdot' },
            hoverinfo: 'skip'
        });
    }

    createPlot('fig4dChart', traces, lightLayout({
        xaxis: { title: { text: '时间区间' }, tickangle: -30 },
        yaxis: { title: { text: zLabel }, zeroline: true,
                 zerolinecolor: '#d4d4cc', zerolinewidth: 1.5 },
        legend: { x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top' },
        hovermode: 'x unified'
    }), { responsive: true, displaylogo: false });
}

// ================================================================
//  Figure 5a–c: 出版物 vs 多样性/GDP/ECI 散点图
// ================================================================
function createFig5Scatters(interval) {
    const rows = store.merged.filter(r =>
        r.Time_Interval === interval &&
        r.Publications != null && Number.isFinite(Number(r.Publications)) &&
        Number(r.Publications) > 0 &&
        r.Diversity != null && Number.isFinite(Number(r.Diversity))
    );

    if (rows.length === 0) {
        ['fig5aChart', 'fig5bChart', 'fig5cChart'].forEach(id => {
            document.getElementById(id).innerHTML =
                `<div class="m5-no-data">该时间区间无足够数据</div>`;
        });
        return;
    }

    createSingleScatter('fig5aChart',
        rows.map(r => toLog10(r.Publications)),
        rows.map(r => Number(r.Diversity)),
        rows.map(r => r.Country),
        'log₁₀(出版物数量)', '科学多样性',
        CONFIG.colors.diversity, 'pub_diversity', interval, 'fig5aCaption');

    const rowsG = store.merged.filter(r =>
        r.Time_Interval === interval &&
        r.Publications != null && Number.isFinite(Number(r.Publications)) && Number(r.Publications) > 0 &&
        r.GDP != null && Number.isFinite(Number(r.GDP)) && Number(r.GDP) > 0
    );
    if (rowsG.length >= 3) {
        createSingleScatter('fig5bChart',
            rowsG.map(r => toLog10(r.Publications)),
            rowsG.map(r => toLog10(r.GDP)),
            rowsG.map(r => r.Country),
            'log₁₀(出版物数量)', 'log₁₀(GDP)',
            CONFIG.colors.gdp, 'pub_gdp', interval, 'fig5bCaption');
    } else {
        document.getElementById('fig5bChart').innerHTML = '<div class="m5-no-data">该时间区间无足够 GDP 数据</div>';
    }

    const rowsE = store.merged.filter(r =>
        r.Time_Interval === interval &&
        r.Publications != null && Number.isFinite(Number(r.Publications)) && Number(r.Publications) > 0 &&
        r.ECI != null && Number.isFinite(Number(r.ECI))
    );
    if (rowsE.length >= 3) {
        createSingleScatter('fig5cChart',
            rowsE.map(r => toLog10(r.Publications)),
            rowsE.map(r => Number(r.ECI)),
            rowsE.map(r => r.Country),
            'log₁₀(出版物数量)', 'ECI (经济复杂性指数)',
            CONFIG.colors.eci, 'pub_eci', interval, 'fig5cCaption');
    } else {
        document.getElementById('fig5cChart').innerHTML = '<div class="m5-no-data">该时间区间无足够 ECI 数据</div>';
    }

    updateCustomScatter(interval);
}

function createSingleScatter(divId, xVals, yVals, countries, xLabel, yLabel, color, corrKey, interval, captionId) {
    clearLoading(divId);
    const lr = linearRegression(xVals, yVals);
    const corrInfo = store.correlations[interval] && store.correlations[interval][corrKey];

    const nBoot = 200;
    const n = xVals.length;
    const xGrid = lr.sortedXs && lr.sortedXs.length > 2 ? lr.sortedXs : [...xVals].sort((a, b) => a - b);
    const bootPreds = xGrid.map(() => []);

    for (let b = 0; b < nBoot; b++) {
        const bx = [], by = [];
        for (let i = 0; i < n; i++) {
            const idx = Math.floor(Math.random() * n);
            bx.push(xVals[idx]);
            by.push(yVals[idx]);
        }
        const blr = linearRegression(bx, by);
        if (blr.preds && blr.preds.length >= 2) {
            for (let j = 0; j < xGrid.length; j++) {
                bootPreds[j].push(blr.slope * xGrid[j] + blr.intercept);
            }
        }
    }

    const ciLow = [], ciUp = [];
    for (let j = 0; j < xGrid.length; j++) {
        const preds = bootPreds[j].sort((a, b) => a - b);
        if (preds.length >= 10) {
            ciLow.push(preds[Math.floor(preds.length * 0.025)]);
            ciUp.push(preds[Math.floor(preds.length * 0.975)]);
        } else {
            ciLow.push(null);
            ciUp.push(null);
        }
    }

    const traces = [{
        x: xVals, y: yVals, text: countries,
        mode: 'markers', type: 'scatter', name: '国家',
        marker: {
            size: 7, color: color, opacity: 0.55,
            line: { color: 'rgba(0,0,0,0.1)', width: 0.4 }
        },
        hovertemplate: `<b>%{text}</b><br>${xLabel}: %{x:.2f}<br>${yLabel}: %{y:.2f}<extra></extra>`
    }];

    const validCI = ciLow.filter(v => v !== null);
    if (validCI.length >= 2) {
        const xCI = xGrid.filter((_, j) => ciLow[j] !== null);
        const ciLowClean = ciLow.filter(v => v !== null);
        const ciUpClean = ciUp.filter(v => v !== null);
        const xBand = [...xCI, ...xCI.slice().reverse()];
        const yBand = [...ciLowClean, ...ciUpClean.slice().reverse()];
        traces.push({
            x: xBand, y: yBand,
            mode: 'lines', name: '95% CI (Bootstrap)',
            fill: 'toself',
            fillcolor: 'rgba(0,0,0,0.06)',
            line: { color: 'rgba(0,0,0,0)', width: 0 },
            hoverinfo: 'skip',
            showlegend: true
        });
    }

    if (lr.sortedXs && lr.sortedXs.length >= 2) {
        traces.push({
            x: lr.sortedXs, y: lr.preds,
            mode: 'lines', name: `OLS (r=${lr.r.toFixed(3)})`,
            line: { color: 'rgba(0,0,0,0.45)', width: 1.5, dash: 'dash' },
            hoverinfo: 'skip'
        });
    }

    createPlot(divId, traces, lightLayout({
        xaxis: { title: { text: xLabel } },
        yaxis: { title: { text: yLabel } },
        legend: { x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top' }
    }), { responsive: true, displaylogo: false });

    const captionEl = document.getElementById(captionId);
    if (captionEl) {
        let parts = [`n = ${xVals.length} 个国家`];
        if (corrInfo && corrInfo.pearson_r != null) {
            parts.push(`PCC r = ${corrInfo.pearson_r.toFixed(3)}`);
            if (corrInfo.spearman_r != null) parts.push(`Spearman ρ = ${corrInfo.spearman_r.toFixed(3)}`);
            if (corrInfo.r2 != null) parts.push(`R² = ${corrInfo.r2.toFixed(3)}`);
        }
        parts.push(`OLS r = ${lr.r.toFixed(3)}`);
        parts.push(`95% CI bootstrap (${nBoot} iter)`);
        captionEl.textContent = parts.join(' · ');
    }
}

function updateCustomScatter(interval) {
    const xKey = document.getElementById('scatterXSelect').value;
    const yKey = document.getElementById('scatterYSelect').value;
    clearLoading('customScatterChart');

    const rows = store.merged.filter(r => {
        if (r.Time_Interval !== interval) return false;
        const xRaw = Number(r[xKey]), yRaw = Number(r[yKey]);
        const xOk = LOG_SCALE_FIELDS.has(xKey) ? (Number.isFinite(xRaw) && xRaw > 0) : Number.isFinite(xRaw);
        const yOk = LOG_SCALE_FIELDS.has(yKey) ? (Number.isFinite(yRaw) && yRaw > 0) : Number.isFinite(yRaw);
        return xOk && yOk;
    });

    const labelMap = {
        Publications: 'log₁₀(出版物数量)', Diversity: '科学多样性',
        GDP: 'log₁₀(GDP)', ECI: 'ECI'
    };
    const rawLabelMap = {
        Publications: '出版物数量', Diversity: '科学多样性',
        GDP: 'GDP (美元)', ECI: 'ECI'
    };
    const colorMap = {
        Publications: CONFIG.colors.publications, Diversity: CONFIG.colors.diversity,
        GDP: CONFIG.colors.gdp, ECI: CONFIG.colors.eci
    };

    if (rows.length < 3) {
        document.getElementById('customScatterChart').innerHTML =
            `<div class="m5-no-data">数据不足 (n=${rows.length})，请尝试其他指标组合</div>`;
        document.getElementById('customScatterCaption').textContent = '';
        return;
    }

    const xVals = rows.map(r => LOG_SCALE_FIELDS.has(xKey) ? toLog10(r[xKey]) : Number(r[xKey]));
    const yVals = rows.map(r => LOG_SCALE_FIELDS.has(yKey) ? toLog10(r[yKey]) : Number(r[yKey]));
    const lr = linearRegression(xVals, yVals);

    const traces = [{
        x: xVals, y: yVals, text: rows.map(r => r.Country),
        mode: 'markers', type: 'scatter', name: '国家',
        marker: { size: 8, color: colorMap[yKey] || CONFIG.colors.scatter, opacity: 0.55,
                  line: { color: 'rgba(0,0,0,0.1)', width: 0.4 } },
        hovertemplate: `<b>%{text}</b><br>${rawLabelMap[xKey]}: %{customdata[0]:.4s}<br>${rawLabelMap[yKey]}: %{customdata[1]:.4s}<extra></extra>`,
        customdata: rows.map(r => [Number(r[xKey]), Number(r[yKey])])
    }];

    if (lr.sortedXs && lr.sortedXs.length >= 2) {
        traces.push({
            x: lr.sortedXs, y: lr.preds,
            mode: 'lines', name: `OLS (r=${lr.r.toFixed(3)}, R²=${lr.r2.toFixed(3)})`,
            line: { color: 'rgba(0,0,0,0.45)', width: 1.4, dash: 'dash' },
            hoverinfo: 'skip'
        });
    }

    createPlot('customScatterChart', traces, lightLayout({
        xaxis: { title: { text: labelMap[xKey] || xKey } },
        yaxis: { title: { text: labelMap[yKey] || yKey } },
        legend: { x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top' }
    }), { responsive: true, displaylogo: false });

    document.getElementById('customScatterCaption').textContent =
        `${rawLabelMap[xKey]} vs ${rawLabelMap[yKey]} · n = ${xVals.length} · ` +
        `r = ${lr.r.toFixed(3)} · R² = ${lr.r2.toFixed(3)}` +
        (lr.slope !== 0 ? ` · slope = ${lr.slope.toExponential(3)}` : '');
}

// ================================================================
//  Figure 5d, 5e: 收入分组时间演化（水平点图）
// ================================================================
const TIME_COLORS = [
    '#d6e4f0', '#bdd3e8', '#9cc2e0', '#7aafd8', '#5b9cd0',
    '#3d88c8', '#2171b5', '#1a5da0', '#08488c'
];

function createIncomeGroupCharts() {
    clearLoading('fig5dChart');
    clearLoading('fig5eChart');

    if (store.incomeGroups && store.incomeGroups.length > 0) {
        createIncomeChartsFromWB();
    } else {
        createIncomeChartsFromGDP();
    }
}

function createIncomeChartsFromWB() {
    const incomeOrder = ['Low', 'Lower middle', 'Upper middle', 'High'];
    const intervals = CONFIG.intervals;
    const midIdx = (intervals.length - 1) / 2;
    const dodgeSpan = 0.7;

    for (const metric of ['Publications', 'Diversity']) {
        const divId = metric === 'Publications' ? 'fig5dChart' : 'fig5eChart';
        const isLog = metric === 'Publications';
        const traces = [];

        intervals.forEach((interval, idx) => {
            const rows = store.incomeGroups.filter(r =>
                r.Time_Interval === interval && r.Metric === metric);
            if (rows.length === 0) return;

            const dodgeY = (idx - midIdx) * (dodgeSpan / (intervals.length - 1));
            const yPositions = [], xValues = [], xErrPlus = [], xErrMinus = [], hoverData = [];

            rows.forEach(r => {
                const ig = r.Income_Group;
                const yIdx = incomeOrder.indexOf(ig);
                if (yIdx < 0) return;
                const meanVal = Number(r.Mean);
                const xVal = isLog ? toLog10(meanVal) : meanVal;
                if (xVal === null) return;
                const ciL = isLog ? toLog10(r.CI_Lower) : Number(r.CI_Lower);
                const ciU = isLog ? toLog10(r.CI_Upper) : Number(r.CI_Upper);

                yPositions.push(yIdx + dodgeY);
                xValues.push(xVal);
                xErrPlus.push(ciU !== null ? ciU - xVal : 0);
                xErrMinus.push(ciL !== null ? xVal - ciL : 0);
                hoverData.push({ ig, meanVal, n: r.N_Countries });
            });

            if (xValues.length === 0) return;

            traces.push({
                y: yPositions, x: xValues, name: interval,
                mode: 'markers', type: 'scatter',
                marker: { size: 8, color: TIME_COLORS[idx],
                          line: { color: 'rgba(0,0,0,0.15)', width: 0.8 } },
                error_x: { type: 'data', symmetric: false, array: xErrPlus, arrayminus: xErrMinus,
                           color: TIME_COLORS[idx], thickness: 1.5, width: 6 },
                hovertemplate: `<b>${interval}</b><br>均值: %{customdata[0]:.4s}<br>95% CI<br>n=%{customdata[1]}<extra></extra>`,
                customdata: hoverData.map(d => [d.meanVal, d.n])
            });
        });

        const xTitle = isLog ? 'log₁₀(出版物数量)' : '科学多样性';
        createPlot(divId, traces, lightLayout({
            xaxis: { title: { text: xTitle } },
            yaxis: { title: { text: '' }, tickmode: 'array', tickvals: [0, 1, 2, 3],
                     ticktext: ['Low', 'Lower<br>middle', 'Upper<br>middle', 'High'], tickfont: { size: 11 } },
            legend: { title: { text: '时间区间', font: { color: '#555', size: 10 } },
                      x: 1.02, y: 0.5, xanchor: 'left', yanchor: 'middle',
                      font: { size: 9.5 }, bgcolor: 'rgba(255,255,255,0.95)',
                      traceorder: 'reversed' },
            margin: { l: 100, r: 140, t: 18, b: 58 },
            hovermode: 'closest'
        }), { responsive: true, displaylogo: false });
    }

}

function createIncomeChartsFromGDP() {
    const incomeOrder = ['low', 'low-middle', 'upper-middle', 'high'];

    function bootstrapMeanCI(values, iters = 1000) {
        const nums = values.map(Number).filter(v => Number.isFinite(v));
        if (nums.length < 2) return nums.length === 1 ? { mean: nums[0], ciLower: nums[0], ciUpper: nums[0], n: 1 } : null;
        const means = [];
        for (let i = 0; i < iters; i++) {
            let s = 0;
            for (let j = 0; j < nums.length; j++) s += nums[Math.floor(Math.random() * nums.length)];
            means.push(s / nums.length);
        }
        means.sort((a, b) => a - b);
        return {
            mean: nums.reduce((a, b) => a + b, 0) / nums.length,
            ciLower: means[Math.floor(iters * 0.025)],
            ciUpper: means[Math.floor(iters * 0.975)],
            n: nums.length
        };
    }

    for (const metric of ['Publications', 'Diversity']) {
        const divId = metric === 'Publications' ? 'fig5dChart' : 'fig5eChart';
        const isLog = metric === 'Publications';
        const traces = [];

        CONFIG.intervals.forEach((interval, idx) => {
            const intRows = store.merged.filter(r => r.Time_Interval === interval);
            const gdps = intRows.map(r => Number(r.GDP)).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
            if (gdps.length < 4) return;
            const q1 = gdps[Math.floor(gdps.length * 0.25)];
            const q2 = gdps[Math.floor(gdps.length * 0.5)];
            const q3 = gdps[Math.floor(gdps.length * 0.75)];

            const yPositions = [], xValues = [], xErrPlus = [], xErrMinus = [], hoverData = [];

            incomeOrder.forEach((ig, yIdx) => {
                let groupRows;
                if (ig === 'low') groupRows = intRows.filter(r => Number(r.GDP) <= q1);
                else if (ig === 'low-middle') groupRows = intRows.filter(r => Number(r.GDP) > q1 && Number(r.GDP) <= q2);
                else if (ig === 'upper-middle') groupRows = intRows.filter(r => Number(r.GDP) > q2 && Number(r.GDP) <= q3);
                else groupRows = intRows.filter(r => Number(r.GDP) > q3);

                const vals = groupRows.map(r => Number(r[metric])).filter(v => Number.isFinite(v));
                const ci = bootstrapMeanCI(vals);
                if (!ci || ci.n < 2) return;

                const xVal = isLog ? toLog10(ci.mean) : ci.mean;
                const ciL = isLog ? toLog10(ci.ciLower) : ci.ciLower;
                const ciU = isLog ? toLog10(ci.ciUpper) : ci.ciUpper;

                if (xVal === null) return;
                yPositions.push(yIdx);
                xValues.push(xVal);
                xErrPlus.push(ciU !== null ? ciU - xVal : 0);
                xErrMinus.push(ciL !== null ? xVal - ciL : 0);
                hoverData.push({ meanVal: ci.mean, n: ci.n });
            });

            if (xValues.length === 0) return;

            traces.push({
                y: yPositions, x: xValues, name: interval,
                mode: 'markers', type: 'scatter',
                marker: { size: 12, color: TIME_COLORS[idx],
                          line: { color: 'rgba(0,0,0,0.15)', width: 0.8 } },
                error_x: { type: 'data', symmetric: false, array: xErrPlus, arrayminus: xErrMinus,
                           color: TIME_COLORS[idx], thickness: 1.5, width: 6 },
                hovertemplate: `<b>${interval}</b><br>均值: %{customdata[0]:.4s}<br>n=%{customdata[1]}<extra></extra>`,
                customdata: hoverData.map(d => [d.meanVal, d.n])
            });
        });

        const xTitle = isLog ? 'log₁₀(出版物数量)' : '科学多样性';
        createPlot(divId, traces, lightLayout({
            xaxis: { title: { text: xTitle } },
            yaxis: { title: { text: '' }, tickmode: 'array', tickvals: [0, 1, 2, 3],
                     ticktext: ['Low', 'Lower<br>middle', 'Upper<br>middle', 'High'], tickfont: { size: 11 } },
            legend: { title: { text: '时间区间', font: { color: '#555', size: 10 } },
                      x: 1.02, y: 0.5, xanchor: 'left', yanchor: 'middle',
                      font: { size: 9.5 }, bgcolor: 'rgba(255,255,255,0.95)', traceorder: 'reversed' },
            margin: { l: 100, r: 140, t: 18, b: 58 },
            hovermode: 'closest'
        }), { responsive: true, displaylogo: false });
    }

}

// ================================================================
//  多指标对比视图
// ================================================================
function createComparisonChart() {
    clearLoading('comparisonChart');
    const intervals = store.summary.map(r => r.Time_Interval);
    const chips = document.querySelectorAll('#indicatorSelector .indicator-chip.selected');
    const keys = Array.from(chips).map(c => c.dataset.key);

    if (keys.length === 0) {
        document.getElementById('comparisonChart').innerHTML =
            '<div class="m5-no-data">请至少选择一个指标</div>';
        return;
    }

    const labelMap = {
        Nestedness_NODF: '嵌套性 NODF',
        Modularity_Q: '模块性 Q',
        Avg_Diversity: '平均科学多样性',
        Avg_Advantages_per_Country: '平均比较优势数/国'
    };
    const colorMap = {
        Nestedness_NODF: CONFIG.colors.nestedness,
        Modularity_Q: CONFIG.colors.modularity,
        Avg_Diversity: CONFIG.colors.diversity,
        Avg_Advantages_per_Country: CONFIG.colors.publications
    };

    const traces = keys.map(key => {
        const raw = store.summary.map(r => Number(r[key]));
        const finite = raw.filter(v => Number.isFinite(v));
        const min = Math.min(...finite), max = Math.max(...finite);
        const normalized = raw.map(v => Number.isFinite(v) ? (v - min) / (max - min || 1) : null);
        const rawMean = finite.reduce((a, b) => a + b, 0) / finite.length;

        return {
            x: intervals, y: normalized,
            name: labelMap[key] || key,
            mode: 'lines+markers',
            line: { color: colorMap[key] || '#555', width: 2 },
            marker: { size: 7, color: colorMap[key] || '#555' },
            hovertemplate: `<b>${labelMap[key]}</b><br>%{x}<br>归一化: %{y:.3f}<br>原始均值: ${rawMean.toFixed(4)}<extra></extra>`
        };
    });

    createPlot('comparisonChart', traces, lightLayout({
        xaxis: { title: { text: '时间区间' }, tickangle: -30 },
        yaxis: { title: { text: 'Min-Max 归一化值' }, range: [-0.05, 1.08] },
        legend: { x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top' },
        hovermode: 'x unified'
    }), { responsive: true, displaylogo: false });
}

// ================================================================
//  相关性徽章
// ================================================================
function updateCorrBadges(interval) {
    const container = document.getElementById('corrBadges');
    const corr = store.correlations[interval];
    if (!corr) {
        container.innerHTML = '<span style="color:#888;font-size:0.75rem;">-</span>';
        return;
    }

    const items = [
        { key: 'pub_diversity', label: 'Pub–Div' },
        { key: 'pub_gdp', label: 'Pub–GDP' },
        { key: 'pub_eci', label: 'Pub–ECI' }
    ];

    container.innerHTML = items.map(item => {
        const d = corr[item.key];
        if (d && d.pearson_r != null) {
            const stars = d.pearson_p < 0.001 ? '***' : d.pearson_p < 0.01 ? '**' : d.pearson_p < 0.05 ? '*' : '';
            return `<span class="corr-badge">
                ${item.label} <span class="r-value">r=${d.pearson_r.toFixed(3)}${stars}</span>
                <small>n=${d.n}</small>
            </span>`;
        }
        return `<span class="corr-badge" style="opacity:0.35">${item.label} N/A</span>`;
    }).join('');
}

// ================================================================
//  初始化
// ================================================================
async function initMember5() {
    try {
        await loadAllMember5Data();
        const lastInterval = store.intervals[store.intervals.length - 1];

        // 填充时间区间选择器
        const sel = document.getElementById('intervalSelect');
        store.intervals.forEach(iv => {
            const opt = document.createElement('option');
            opt.value = iv;
            opt.textContent = iv;
            sel.appendChild(opt);
        });
        sel.value = lastInterval;

        // 创建所有图表
        createFig4b();
        createFig4d();
        createComparisonChart();
        createFig5Scatters(lastInterval);
        createIncomeGroupCharts();
        updateCustomScatter(lastInterval);
        updateCorrBadges(lastInterval);

        // ========== 视图切换 ==========
        const viewTabs = document.querySelectorAll('#viewTabs .view-tab');
        const paperView = document.getElementById('paperView');
        const customView = document.getElementById('customView');
        const customControls = document.getElementById('customControls');

        function switchView(viewName) {
            viewTabs.forEach(t => t.classList.remove('active'));
            const activeTab = document.querySelector(`#viewTabs .view-tab[data-view="${viewName}"]`);
            if (activeTab) activeTab.classList.add('active');

            if (viewName === 'paper') {
                paperView.style.display = '';
                customView.style.display = 'none';
                customControls.style.display = 'none';
                // paper-fig4 和 paper-fig5 始终可见，无需子标签切换
            } else {
                paperView.style.display = 'none';
                customView.style.display = '';
                customControls.style.display = '';
                document.getElementById('custom-compare').style.display = '';
                document.getElementById('custom-scatter').style.display = 'none';
                customView.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
                const def = customView.querySelector('.sub-tab[data-sub="custom-compare"]');
                if (def) def.classList.add('active');
                setTimeout(() => {
                    Plotly.Plots.resize('comparisonChart');
                    Plotly.Plots.resize('customScatterChart');
                }, 100);
            }

            setTimeout(() => {
                const visibleIds = (viewName === 'paper')
                    ? ['fig4bChart', 'fig4dChart', 'fig5aChart', 'fig5bChart', 'fig5cChart', 'fig5dChart', 'fig5eChart']
                    : ['comparisonChart', 'customScatterChart'];
                function resizeVisible() {
                    visibleIds.forEach(id => {
                        const el = document.getElementById(id);
                        if (el && el.querySelector('.js-plotly-plot')) Plotly.Plots.resize(id);
                    });
                }
                resizeVisible();
                setTimeout(resizeVisible, 300);
            }, 150);
        }

        viewTabs.forEach(tab => {
            tab.addEventListener('click', () => switchView(tab.dataset.view));
        });

        // ========== 二级标签切换 ==========
        function switchSubTab(parentId, subName) {
            const parent = document.getElementById(parentId);
            if (!parent) return;
            parent.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
            const active = parent.querySelector(`.sub-tab[data-sub="${subName}"]`);
            if (active) active.classList.add('active');
            const sections = parent.querySelectorAll('section.section');
            sections.forEach(sec => { sec.style.display = 'none'; });
            const target = document.getElementById(subName);
            if (target) target.style.display = '';
            // 先做一次快速 resize（让浏览器完成布局），再做一次确保准确
            function resizeCharts() {
                target.querySelectorAll('[id$="Chart"]').forEach(el => {
                    if (el.querySelector('.js-plotly-plot')) Plotly.Plots.resize(el.id);
                });
            }
            setTimeout(resizeCharts, 50);
            setTimeout(resizeCharts, 300);
        }

        // 仅 customView 保留子标签切换
        document.querySelectorAll('#customView .sub-tab').forEach(tab => {
            tab.addEventListener('click', () => switchSubTab('customView', tab.dataset.sub));
        });

        // ========== 事件监听 ==========
        sel.addEventListener('change', () => {
            const iv = sel.value;
            createFig5Scatters(iv);
            updateCustomScatter(iv);
            updateCorrBadges(iv);
        });

        document.getElementById('scatterXSelect').addEventListener('change', () => updateCustomScatter(sel.value));
        document.getElementById('scatterYSelect').addEventListener('change', () => updateCustomScatter(sel.value));

        document.querySelectorAll('#indicatorSelector .indicator-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                chip.classList.toggle('selected');
                createComparisonChart();
            });
        });

        // ========== 响应式重绘 ==========
        let resizeTimer;
        const chartIds = ['fig4bChart', 'fig4dChart', 'fig5aChart', 'fig5bChart',
            'fig5cChart', 'customScatterChart', 'fig5dChart', 'fig5eChart', 'comparisonChart'];
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => chartIds.forEach(id => {
                const el = document.getElementById(id);
                if (el && el.querySelector('.js-plotly-plot')) Plotly.Plots.resize(id);
            }), 200);
        });

        console.log('✅ 成员五：演化趋势与关联分析 — 全部图表就绪');
        console.log(`   ${store.intervals.length} 个时间区间 (${store.intervals[0]} ~ ${lastInterval})`);
        console.log(`   ${store.merged.length} 条国家记录`);
        console.log(`   ${Object.keys(store.correlations).length} 组相关性数据`);
        if (store.incomeGroups) console.log(`   ${store.incomeGroups.length} 条 WB 收入分组数据 ✅`);

    } catch (err) {
        console.error('成员五初始化失败:', err);
    }
}
