/* ============================================================
   全球科学发展可视化 - 主应用 (app.js)
   整合成员2/3/4的可视化模块
   ============================================================ */

// ===== 全局命名空间 =====
const App = {
    dataReady: false,
    sharedData: null
};

// ===== 锚点导航平滑滚动 =====
(function() {
    document.querySelectorAll('.section-nav a[href^="#"]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    // IntersectionObserver 高亮当前section
    const navLinks = document.querySelectorAll('.section-nav a');
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                navLinks.forEach(a => a.classList.remove('active'));
                const link = document.querySelector(`.section-nav a[href="#${entry.target.id}"]`);
                if (link) link.classList.add('active');
            }
        });
    }, { threshold: 0.3 });

    document.querySelectorAll('.narrative-section[id]').forEach(s => observer.observe(s));
})();

// ===== 共享数据加载 =====
const DATA_DIR = './data/';
const TIME_INTERVALS = [
    '1973-1977', '1978-1982', '1983-1987', '1988-1992',
    '1993-1997', '1998-2002', '2003-2007', '2008-2012', '2013-2017'
];
const DISCIPLINES = [
    'Arts', 'Biology', 'Biomedical Research', 'Chemistry', 'Clinical Medicine',
    'Earth and Space', 'Engineering and Technology', 'Health', 'Humanities',
    'Mathematics', 'Physics', 'Professional Fields', 'Psychology', 'Social Sciences'
];
const CLUSTERS = {
    'Natural': ['Biology', 'Biomedical Research', 'Clinical Medicine', 'Earth and Space', 'Health', 'Social Sciences'],
    'Physical': ['Chemistry', 'Engineering and Technology', 'Mathematics', 'Physics'],
    'Societal': ['Arts', 'Humanities', 'Professional Fields', 'Psychology']
};
const CLUSTER_COLORS = { Natural: '#2c7a4e', Physical: '#2166ac', Societal: '#b2182b' };
const CLUSTER_COLORS_BRIGHT = { Natural: '#2c7a4e', Physical: '#4393c3', Societal: '#d6604d' };

const COUNTRY_NAME_MAP = {
    'United States': 'USA', 'United Kingdom': 'UK', 'South Korea': 'Korea',
    'Russian Federation': 'Russia', 'Venezuela, RB': 'Venezuela', 'Iran, Islamic Rep.': 'Iran',
    'Syrian Arab Republic': 'Syria', 'Egypt, Arab Rep.': 'Egypt', 'Yemen, Rep.': 'Yemen',
    'Congo, Dem. Rep.': 'DRC', 'Congo, Rep.': 'Congo', "Cote d'Ivoire": 'Ivory Coast',
    'Tanzania': 'United Republic of Tanzania', 'Bahamas, The': 'Bahamas', 'Gambia, The': 'Gambia',
    'Micronesia, Fed. Sts.': 'Micronesia', 'Lao PDR': 'Laos', 'Kyrgyz Republic': 'Kyrgyzstan',
    'St. Kitts and Nevis': 'Saint Kitts and Nevis', 'St. Lucia': 'Saint Lucia',
    'St. Vincent and the Grenadines': 'Saint Vincent and the Grenadines', 'Slovak Republic': 'Slovakia'
};

function normalizeCountryName(name) {
    let n = name.replace(/\s*\(.*\)\s*/g, '').replace(/&/g, 'and').trim();
    for (const [k, v] of Object.entries(COUNTRY_NAME_MAP)) {
        if (n.includes(v) || n.includes(k)) return k;
    }
    return n;
}

function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toFixed(1);
}

function formatGDP(num) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return (num / 1e9).toFixed(1) + 'B';
}

async function loadSharedData() {
    App.sharedData = {
        rca: {}, binary: {}, papers: {}, diversity: {}, integrated: {},
        disciplineClusters: {}, proximityByInterval: new Map(),
        trendByDiscipline: new Map(), totalsByInterval: new Map(),
        worldData: null
    };

    // 加载学科集群
    const clusterRows = await d3.csv(DATA_DIR + 'discipline_clusters.csv');
    clusterRows.forEach(d => {
        const disc = d.discipline || d[''];
        if (disc) App.sharedData.disciplineClusters[disc] = d.Cluster;
    });

    // 加载论文数据
    const paperRows = await d3.csv(DATA_DIR + 'cleaned_country_discipline_papers.csv', d3.autoType);
    paperRows.forEach(row => {
        const disc = String(row.discipline).trim();
        const interval = String(row.Time_Interval).trim();
        const papers = Number(row.Papers) || 0;

        if (!App.sharedData.totalsByInterval.has(interval)) {
            App.sharedData.totalsByInterval.set(interval, new Map());
        }
        if (!App.sharedData.trendByDiscipline.has(disc)) {
            App.sharedData.trendByDiscipline.set(disc, new Map(TIME_INTERVALS.map(t => [t, 0])));
        }
        App.sharedData.totalsByInterval.get(interval).set(disc,
            (App.sharedData.totalsByInterval.get(interval).get(disc) || 0) + papers);
        App.sharedData.trendByDiscipline.get(disc).set(interval,
            (App.sharedData.trendByDiscipline.get(disc).get(interval) || 0) + papers);
    });

    // 加载每个时间段的数据
    const loadPromises = TIME_INTERVALS.map(async interval => {
        const [rcaRows, binaryRows, proxRows] = await Promise.all([
            d3.csv(DATA_DIR + `rca_${interval}.csv`),
            d3.csv(DATA_DIR + `binary_rca_${interval}.csv`),
            d3.csv(DATA_DIR + `proximity_${interval}.csv`, d3.autoType)
        ]);
        return { interval, rcaRows, binaryRows, proxRows };
    });

    const diversityRows = await d3.csv(DATA_DIR + 'scientific_diversity_by_interval.csv');
    const integratedRows = await d3.csv(DATA_DIR + 'integrated_data_for_correlation.csv');

    for (const item of await Promise.all(loadPromises)) {
        const { interval, rcaRows, binaryRows, proxRows } = item;

        App.sharedData.rca[interval] = {};
        rcaRows.forEach(d => { App.sharedData.rca[interval][normalizeCountryName(d.Country)] = d; });

        App.sharedData.binary[interval] = {};
        binaryRows.forEach(d => { App.sharedData.binary[interval][normalizeCountryName(d.Country)] = d; });

        App.sharedData.papers[interval] = {};
        paperRows.filter(d => d.Time_Interval === interval).forEach(d => {
            const c = normalizeCountryName(d.Country);
            if (!App.sharedData.papers[interval][c]) App.sharedData.papers[interval][c] = {};
            App.sharedData.papers[interval][c][d.discipline] = +d.Papers;
        });

        App.sharedData.diversity[interval] = {};
        diversityRows.forEach(d => { App.sharedData.diversity[interval][normalizeCountryName(d.Country)] = +d[interval] || 0; });

        App.sharedData.integrated[interval] = {};
        integratedRows.filter(d => d.Time_Interval === interval).forEach(d => {
            App.sharedData.integrated[interval][normalizeCountryName(d.Country)] = {
                totalPapers: +d.Total_Papers, diversity: +d.Diversity,
                eci: d.ECI ? +d.ECI : null, gdp: d.GDP ? +d.GDP : null
            };
        });

        App.sharedData.proximityByInterval.set(interval, proxRows);
    }

    // 加载世界地图
    try {
        const world = await d3.json('https://unpkg.com/world-atlas@2.0.2/countries-110m.json');
        App.sharedData.worldData = topojson.feature(world, world.objects.countries);
    } catch (e) {
        console.warn('世界地图加载失败:', e);
    }

    App.dataReady = true;
}


// ============================================================
//  应用启动
// ============================================================
async function boot() {
    // 显示加载状态
    const mapDiv = document.getElementById('m2-worldMap');
    if (mapDiv) mapDiv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:16px">正在加载数据，请稍候...</div>';

    await loadSharedData();

    // 初始化所有模块（滚动布局中全部模块同时可见）
    App.countryMap.init();
    App.disciplineNetwork.init();
    App.developmentPath.init();
    // 成员五：Plotly 图表模块（独立初始化，不依赖 sharedData）
    if (typeof initMember5 === 'function') initMember5();

    // 触发resize让所有模块的SVG获取正确尺寸
    setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
}

document.addEventListener('DOMContentLoaded', boot);
