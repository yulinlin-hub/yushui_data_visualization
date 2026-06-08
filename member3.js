/* ============================================================
   成员3 可视化模块 — 学科结构 · 邻近网络与三大集群
   依赖: app.js (App.sharedData, 全局常量)
          d3.v7.min.js
   ============================================================ */

// ============================================================
//  模块2: 学科结构 (适配自 member3)
// ============================================================
App.disciplineNetwork = (function() {
    let state, tooltip;
    const DATA_BASE = 'data/member3';

    function init() {
        state = {
            selectedDiscipline: null,
            thresholdPercentile: 35,
            currentSvg: null,
            currentGraph: null,
            nodes: [],
            links: [],
            meta: null,
            trendByDiscipline: new Map(),
            zoomActive: false
        };

        tooltip = d3.select('body').append('div').attr('class', 'tooltip').style('opacity', 0);

        buildControls();
        buildLegend();
        wireExport();
        wireDetailPanel();

        // 点击图表外部时关闭滚轮缩放
        document.addEventListener('click', () => {
            if (state.zoomActive) {
                state.zoomActive = false;
                const svg = document.querySelector('#m3-network-root svg');
                if (svg) svg.style.cursor = '';
            }
        });

        loadMember3Data().then(() => {
            state.selectedDiscipline = state.nodes[0] ? state.nodes[0].id : null;
            render();
            window.addEventListener('resize', debounce(() => render(), 160));
        }).catch((err) => {
            console.error(err);
        });
    }

    async function loadMember3Data() {
        const [nodes, links, meta, trends] = await Promise.all([
            d3.json(`${DATA_BASE}/nodes.json`),
            d3.json(`${DATA_BASE}/links.json`),
            d3.json(`${DATA_BASE}/discipline_meta.json`),
            d3.csv(`${DATA_BASE}/discipline_trends.csv`, d3.autoType)
        ]);

        state.nodes = nodes;
        state.links = links;
        state.meta = meta;

        state.trendByDiscipline = new Map();
        trends.forEach((row) => {
            const discipline = String(row.discipline || '').trim();
            const interval = String(row.Time_Interval || '').trim();
            if (!discipline || !interval) return;
            if (!state.trendByDiscipline.has(discipline)) {
                state.trendByDiscipline.set(discipline, new Map(TIME_INTERVALS.map((t) => [t, 0])));
            }
            state.trendByDiscipline.get(discipline).set(interval, Number(row.Papers) || 0);
        });
    }

    function buildControls() {
        const thr = document.getElementById('m3-edge-threshold');
        document.getElementById('m3-edge-threshold-label').textContent = `保留高于 ${state.thresholdPercentile}% 分位的边`;
        thr.addEventListener('input', e => { state.thresholdPercentile = +e.target.value; render(); });
    }

    function buildLegend() {
        const legend = d3.select('#m3-legend');
        const items = [
            { c: 'Natural', l: 'Natural 自然' },
            { c: 'Physical', l: 'Physical 物理' },
            { c: 'Societal', l: 'Societal 社会' }
        ];
        legend.selectAll('div').data(items).join('div').attr('class', 'legend-item')
            .html(d => `<span class="legend-chip" style="background:${CLUSTER_COLORS[d.c]}"></span>${d.l}`);
    }

    function wireDetailPanel() {
        document.getElementById('m3-closeDetail').addEventListener('click', closeDetail);
    }

    function showDetail() {
        const panel = document.getElementById('m3-disciplinePanel');
        panel.classList.remove('hidden');
        panel.classList.add('visible');
    }

    function closeDetail() {
        const panel = document.getElementById('m3-disciplinePanel');
        panel.classList.remove('visible');
        panel.classList.add('hidden');
        state.selectedDiscipline = null;
    }

    function wireExport() {
        document.getElementById('m3-export-svg').addEventListener('click', () => {
            if (!state.currentSvg) return;
            downloadSvg(state.currentSvg.node(), `discipline-network.svg`);
        });
        document.getElementById('m3-export-png').addEventListener('click', async () => {
            if (!state.currentSvg) return;
            await downloadPng(state.currentSvg.node(), `discipline-network.png`);
        });
    }

    function render() {
        const graph = buildGraph(state.thresholdPercentile);
        document.getElementById('m3-edge-threshold-label').textContent = `保留高于 ${state.thresholdPercentile}% 分位的边`;
        state.currentGraph = graph;

        renderClusterSummary(graph);
        renderNetwork(graph);
    }

    function renderClusterSummary(graph) {
        const counts = { Natural: 0, Physical: 0, Societal: 0 };
        graph.nodes.forEach(n => { counts[n.cluster] = (counts[n.cluster] || 0) + 1; });
        document.getElementById('m3-cluster-summary').innerHTML = `
            <span class="cluster-pill"><strong>集群解释</strong>：颜色表示学科所属的大结构</span>
            <span class="cluster-pill">自然集群 ${counts.Natural} 个学科</span>
            <span class="cluster-pill">物理集群 ${counts.Physical} 个学科</span>
            <span class="cluster-pill">社会集群 ${counts.Societal} 个学科</span>`;
    }

    function renderNetwork(graph) {
        const root = document.getElementById('m3-network-root');
        const width = root.clientWidth || 700, height = root.clientHeight || 600;

        d3.select(root).selectAll('svg').remove();
        const svgEl = d3.select(root).append('svg').attr('width', width).attr('height', height).attr('viewBox', [0, 0, width, height]);
        state.currentSvg = svgEl;

        const g = svgEl.append('g');
        g.append('rect').attr('width', width).attr('height', height).attr('fill', '#fdfdfb');

        const zoomBehavior = d3.zoom()
            .scaleExtent([0.15, 4])
            .filter(event => {
                // 滚轮缩放仅在图表被点击激活后生效
                if (event.type === 'wheel') return state.zoomActive;
                return true;
            })
            .on('zoom', e => { g.attr('transform', e.transform); });
        svgEl.call(zoomBehavior);

        // 点击图表激活滚轮缩放（阻止事件冒泡，避免被 document 监听器立即关闭）
        svgEl.on('click', (event) => {
            event.stopPropagation();
            state.zoomActive = true;
            svgEl.style('cursor', 'move');
        });

        // 鼠标离开图表时取消激活状态
        svgEl.on('mouseleave', () => {
            if (state.zoomActive) {
                state.zoomActive = false;
                svgEl.style('cursor', null);
            }
        });

        function fitToView() {
            const connectedIds = new Set();
            linksCopy.forEach(l => {
                const s = l.source.id || l.source;
                const t = l.target.id || l.target;
                connectedIds.add(s);
                connectedIds.add(t);
            });
            const connected = nodesCopy.filter(d => connectedIds.has(d.id));
            if (!connected.length) return;
            const pad = 30;
            const bx0 = Math.min(...connected.map(d => d.x)) - pad;
            const bx1 = Math.max(...connected.map(d => d.x)) + pad;
            const by0 = Math.min(...connected.map(d => d.y)) - pad;
            const by1 = Math.max(...connected.map(d => d.y)) + pad;
            const bw = bx1 - bx0 || 1, bh = by1 - by0 || 1;
            const sc = Math.min(width / bw, height / bh);
            const tx = (width - bw * sc) / 2 - bx0 * sc;
            const ty = (height - bh * sc) / 2 - by0 * sc;
            svgEl.call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(sc));
        }

        const nodesCopy = graph.nodes.map(d => ({...d}));
        const linksCopy = graph.links.map(d => ({...d}));

        const xs = nodesCopy.map(d => d.x);
        const ys = nodesCopy.map(d => d.y);
        const xMin = Math.min(...xs), xMax = Math.max(...xs);
        const yMin = Math.min(...ys), yMax = Math.max(...ys);
        const gw = xMax - xMin || 1, gh = yMax - yMin || 1;
        const s = Math.min((width - 100) / gw, (height - 100) / gh);
        const ox = (width - gw * s) / 2 - xMin * s;
        const oy = (height - gh * s) / 2 - yMin * s;
        nodesCopy.forEach(d => { d.x = d.x * s + ox; d.y = d.y * s + oy; });

        const sizeScale = d3.scaleSqrt().domain(d3.extent(nodesCopy, d => d.papers)).range([5, 20]);
        const hasWeight = linksCopy.some(d => d.weight > 0);
        const linkExtent = d3.extent(linksCopy.filter(d => d.weight > 0), d => d.weight);
        const linkWidth = hasWeight ? d3.scaleLinear().domain(linkExtent).range([0.5, 2.8]) : () => 1;
        const linkOpacity = hasWeight ? d3.scaleLinear().domain(linkExtent).range([0.18, 0.55]) : () => 0.4;

        const simulation = d3.forceSimulation(nodesCopy)
            .force('link', d3.forceLink(linksCopy).id(d => d.id).distance(80).strength(0.3))
            .force('charge', d3.forceManyBody().strength(-120))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide().radius(d => sizeScale(d.papers) + 6))
            .alphaDecay(0.05);

        const link = g.append('g').selectAll('line').data(linksCopy).join('line')
            .attr('stroke', '#60707a')
            .attr('stroke-opacity', d => linkOpacity(d.weight))
            .attr('stroke-width', d => d.weight > 0 ? linkWidth(d.weight) : 0.5)
            .on('mousemove', (e, d) => showTooltip(e, `<div><strong>${d.source.id || d.source}</strong> - <strong>${d.target.id || d.target}</strong></div><div>邻近度: ${d.weight.toFixed(4)}</div>`))
            .on('mouseleave', () => tooltip.style('opacity', 0));

        const node = g.append('g').selectAll('circle').data(nodesCopy).join('circle')
            .attr('r', d => sizeScale(d.papers))
            .attr('fill', d => CLUSTER_COLORS[d.cluster] || '#777')
            .attr('stroke', '#fff').attr('stroke-width', 1.2).style('cursor', 'pointer')
            .on('mousemove', (e, d) => showTooltip(e, `<div><strong>${d.id}</strong></div><div>集群: ${d.cluster}</div><div>发文量: ${Math.round(d.papers).toLocaleString()}</div>`))
            .on('mouseleave', () => tooltip.style('opacity', 0))
            .on('mouseover', (_, d) => highlightNeighbors(d.id, {nodes: nodesCopy, links: linksCopy}, node, link))
            .on('mouseout', () => clearHighlight(node, link))
            .on('click', (_, d) => { state.selectedDiscipline = d.id; showDetail(); renderDetail({nodes: nodesCopy, links: linksCopy}, d.id); renderTrend(d.id); })
            .call(d3.drag()
                .on('start', (e, d) => { d.fx = d.x; d.fy = d.y; })
                .on('drag', (e, d) => { if (!e.active) simulation.alphaTarget(0.2).restart(); d.fx = e.x; d.fy = e.y; })
                .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

        const labels = g.append('g').selectAll('text').data(nodesCopy).join('text')
            .text(d => d.id).attr('font-size', 8).attr('fill', '#222')
            .attr('dx', d => sizeScale(d.papers) + 3).attr('dy', 3)
            .style('pointer-events', 'none').attr('opacity', 0.78);

        simulation.on('tick', () => {
            link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
            node.attr('cx', d => d.x).attr('cy', d => d.y);
            labels.attr('x', d => d.x).attr('y', d => d.y);
        });

        simulation.on('end', function handler() {
            fitToView();
            simulation.on('end', null); // 仅在初始布局时自适应，后续拖拽不重置缩放
        });
    }

    function highlightNeighbors(targetId, graph, nodeSel, linkSel) {
        const neighbors = new Set([targetId]);
        graph.links.forEach(e => {
            const s = getLinkId(e.source), t = getLinkId(e.target);
            if (s === targetId) neighbors.add(t);
            if (t === targetId) neighbors.add(s);
        });
        nodeSel.classed('dim', d => !neighbors.has(d.id));
        linkSel.classed('dim', d => { const s = getLinkId(d.source), t = getLinkId(d.target); return !(s === targetId || t === targetId); });
    }

    function clearHighlight(nodeSel, linkSel) {
        nodeSel.classed('dim', false);
        linkSel.classed('dim', false);
    }

    function getLinkId(d) { return d.id || d; }

    function renderDetail(graph, discipline) {
        const CLUSTER_DESC = { Natural: '自然集群：资源、生态与健康相关学科', Physical: '物理集群：物理/化学/工程导向学科', Societal: '社会集群：人文、社会与职业导向学科' };
        if (!discipline) return;
        const node = graph.nodes.find(n => n.id === discipline);
        if (!node) return;

        document.getElementById('m3-disciplineName').textContent = node.id;
        const badge = document.getElementById('m3-disciplineCluster');
        badge.textContent = node.cluster;
        badge.style.background = CLUSTER_COLORS[node.cluster] || '#777';
        badge.style.color = '#fff';
        badge.style.padding = '2px 10px';
        badge.style.borderRadius = '12px';
        badge.style.fontSize = '0.72rem';
        badge.style.fontWeight = '600';
        document.getElementById('m3-detailCluster').textContent = node.cluster;
        document.getElementById('m3-detailClusterDesc').textContent = CLUSTER_DESC[node.cluster] || 'N/A';
        document.getElementById('m3-detailPapers').textContent = Math.round(node.papers).toLocaleString();

        const related = graph.links.filter(l => {
            const s = getLinkId(l.source), t = getLinkId(l.target);
            return s === discipline || t === discipline;
        }).map(l => ({
            name: getLinkId(l.source) === discipline ? getLinkId(l.target) : getLinkId(l.source),
            weight: l.weight
        }))
            .sort((a, b) => b.weight - a.weight).slice(0, 5);

        document.getElementById('m3-detailTopLink').textContent = related.length ? related[0].name : '-';

        const relatedEl = document.getElementById('m3-discipline-related');
        if (related.length) {
            relatedEl.innerHTML = '<ol style="margin:0;padding-left:1.2rem;font-size:0.78rem;line-height:1.7;">' +
                related.map(r => `<li>${r.name} <span style="color:#888">(邻近度 ${r.weight.toFixed(4)})</span></li>`).join('') + '</ol>';
        } else {
            relatedEl.innerHTML = '<p style="color:#888;font-size:0.78rem;">无可见连接</p>';
        }
    }

    function renderTrend(discipline) {
        const root = document.getElementById('m3-trend-chart');
        d3.select(root).selectAll('svg').remove();
        if (!discipline) return;

        const trendMap = state.trendByDiscipline.get(discipline);
        if (!trendMap) return;

        const data = TIME_INTERVALS.map(t => ({ interval: t, value: trendMap.get(t) || 0 }));
        const width = root.clientWidth || 360, height = 220;
        const margin = { top: 10, right: 10, bottom: 40, left: 52 };

        const svgEl = d3.select(root).append('svg').attr('width', width).attr('height', height).attr('viewBox', [0, 0, width, height]);
        const x = d3.scalePoint().domain(data.map(d => d.interval)).range([margin.left, width - margin.right]);
        const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value) || 1]).nice().range([height - margin.bottom, margin.top]);
        const line = d3.line().x(d => x(d.interval)).y(d => y(d.value));

        svgEl.append('path').datum(data).attr('fill', 'none').attr('stroke', '#2166ac').attr('stroke-width', 2.2).attr('d', line);
        svgEl.append('g').selectAll('circle').data(data).join('circle')
            .attr('cx', d => x(d.interval)).attr('cy', d => y(d.value)).attr('r', 3.4).attr('fill', '#b2182b')
            .on('mousemove', (e, d) => showTooltip(e, `<div><strong>${discipline}</strong></div><div>区间: ${d.interval}</div><div>发文量: ${Math.round(d.value).toLocaleString()}</div>`))
            .on('mouseleave', () => tooltip.style('opacity', 0));

        svgEl.append('g').attr('transform', `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).tickValues(['1973-1977', '1993-1997', '2013-2017']).tickSizeOuter(0))
            .call(g => g.selectAll('text').attr('font-size', 11).style('fill', '#888'));
        svgEl.append('g').attr('transform', `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).ticks(5).tickSizeOuter(0))
            .call(g => g.selectAll('text').attr('font-size', 11).style('fill', '#888'));

        svgEl.append('text').attr('x', margin.left).attr('y', height - 8).attr('fill', '#888').attr('font-size', 12)
            .text(`发文趋势 - ${discipline}`);
    }

    function buildGraph(percentile) {
        const graphLinks = state.links || [];
        const graphNodes = state.nodes;
        const rawWeights = graphLinks.map((d) => d.weight).filter((d) => Number.isFinite(d));
        rawWeights.sort((a, b) => a - b);
        const threshold = d3.quantile(rawWeights, percentile / 100) || 0;
        const links = graphLinks.filter((edge) => edge.weight >= threshold);
        return { nodes: graphNodes, links, threshold };
    }

    function showTooltip(event, html) {
        tooltip.style('opacity', 1).html(html);
        const pad = 12;
        let x = event.clientX + pad, y = event.clientY + pad;
        const box = tooltip.node().getBoundingClientRect();
        if (x + box.width + pad > window.innerWidth) x = event.clientX - box.width - pad;
        if (y + box.height + pad > window.innerHeight) y = event.clientY - box.height - pad;
        tooltip.style('left', `${Math.max(pad, x)}px`).style('top', `${Math.max(pad, y)}px`);
    }

    function downloadSvg(svgNode, filename) {
        const src = new XMLSerializer().serializeToString(svgNode);
        const blob = new Blob([src], { type: 'image/svg+xml;charset=utf-8' });
        triggerDownload(URL.createObjectURL(blob), filename);
    }

    async function downloadPng(svgNode, filename) {
        const src = new XMLSerializer().serializeToString(svgNode);
        const blob = new Blob([src], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
        const canvas = document.createElement('canvas');
        canvas.width = svgNode.viewBox.baseVal.width || svgNode.clientWidth;
        canvas.height = svgNode.viewBox.baseVal.height || svgNode.clientHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fdfdfb';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        triggerDownload(canvas.toDataURL('image/png'), filename);
        URL.revokeObjectURL(url);
    }

    function triggerDownload(url, filename) {
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function debounce(fn, delay) {
        let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
    }

    return { init, render };
})();
