/* ============================================================
   成员2 可视化模块 — 世界地图 · 国家科学能力地理分布
   依赖: app.js (App.sharedData, 全局常量)
          d3.v7.min.js, topojson-client (CDN)
   ============================================================ */

// ============================================================
//  模块1: 国家概况 (适配自 member2)
// ============================================================
App.countryMap = (function() {
    let state, rcaColorScale, svg, g, projection, path, rcaPercentiles;

    function buildRCAPercentiles() {
        // 构建两种百分位查找表：
        // 1) rcaGlobalPct[interval] — 所有单个 RCA 值的百分位（用于单一学科模式）
        // 2) rcaAvgPct[interval][cluster] — 国家均值 RCA 的百分位（用于全部学科模式）
        rcaPercentiles = { global: {}, avg: {} };
        TIME_INTERVALS.forEach(ti => {
            const rca = App.sharedData.rca[ti];
            if (!rca) return;

            // 全局单值百分位
            const globalVals = [];
            // 每国均值（全部学科）
            const avgAll = [];
            // 每国均值（按集群）
            const avgCluster = { all: avgAll, Natural: [], Physical: [], Societal: [] };

            Object.values(rca).forEach(crca => {
                let sumAll = 0, cAll = 0;
                const sums = { Natural: 0, Physical: 0, Societal: 0 };
                const cnts = { Natural: 0, Physical: 0, Societal: 0 };

                DISCIPLINES.forEach(d => {
                    const v = parseFloat(crca[d]);
                    if (isNaN(v)) return;
                    globalVals.push(v);
                    sumAll += v; cAll++;
                    const cl = App.sharedData.disciplineClusters[d];
                    if (cl && sums[cl] !== undefined) { sums[cl] += v; cnts[cl]++; }
                });

                if (cAll > 0) avgAll.push(sumAll / cAll);
                for (const cl of ['Natural', 'Physical', 'Societal']) {
                    if (cnts[cl] > 0) avgCluster[cl].push(sums[cl] / cnts[cl]);
                }
            });

            globalVals.sort((a, b) => a - b);
            rcaPercentiles.global[ti] = globalVals;

            rcaPercentiles.avg[ti] = {};
            for (const cl of ['all', 'Natural', 'Physical', 'Societal']) {
                avgCluster[cl].sort((a, b) => a - b);
                rcaPercentiles.avg[ti][cl] = avgCluster[cl];
            }
        });
    }

    function rcaToPercentile(v, sortedArr) {
        if (!sortedArr || sortedArr.length === 0) return 0;
        let lo = 0, hi = sortedArr.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (sortedArr[mid] < v) lo = mid + 1;
            else hi = mid;
        }
        return lo / sortedArr.length;
    }

    function init() {
        state = {
            currentTimeInterval: '2013-2017',
            currentCluster: 'all', currentDiscipline: 'all', currentMode: 'rca',
            isPlaying: false, playbackInterval: null, selectedCountry: null,
            zoomActive: false
        };

        rcaColorScale = d3.scaleSequential().domain([0, 1]).interpolator(
            d3.interpolateRgbBasis(['#2166ac', '#92c5de', '#f5f0eb', '#f4a582', '#b2182b'])
        );

        buildRCAPercentiles();

        // 初始化学科下拉
        const sel = document.getElementById('m2-disciplineSelect');
        DISCIPLINES.forEach(d => { const o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o); });

        // 事件绑定
        document.getElementById('m2-timeInterval').addEventListener('change', e => {
            state.currentTimeInterval = e.target.value;
            document.getElementById('m2-timeline').value = TIME_INTERVALS.indexOf(e.target.value);
            updateAll();
        });
        document.getElementById('m2-timeline').addEventListener('input', e => {
            state.currentTimeInterval = TIME_INTERVALS[+e.target.value];
            document.getElementById('m2-timeInterval').value = state.currentTimeInterval;
            updateAll();
        });
        document.querySelectorAll('#section-worldmap .ctrl-btn[data-cluster]').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('#section-worldmap .ctrl-btn[data-cluster]').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                state.currentCluster = b.dataset.cluster;
                updateAll();
            });
        });
        document.getElementById('m2-disciplineSelect').addEventListener('change', e => {
            state.currentDiscipline = e.target.value; updateAll();
        });
        document.querySelectorAll('#section-worldmap .ctrl-btn[data-mode]').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('#section-worldmap .ctrl-btn[data-mode]').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                state.currentMode = b.dataset.mode;
                updateAll();
            });
        });
        document.getElementById('m2-playBtn').addEventListener('click', togglePlayback);
        document.getElementById('m2-closeDetail').addEventListener('click', closeDetail);
        document.querySelectorAll('#section-worldmap .rank-btn').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('#section-worldmap .rank-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                updateRankingTable(b.dataset.sort);
            });
        });

        // 点击地图外部时取消滚轮缩放激活
        document.addEventListener('click', () => {
            if (state.zoomActive) {
                state.zoomActive = false;
                if (svg) svg.style('cursor', null);
            }
        });

        renderMap();
        updateAll();
    }

    // 最小论文数阈值：过滤样本过小的国家/地区，避免极端RCA值
    var MIN_PAPERS_THRESHOLD = 100;

    function getCountryColor(properties) {
        const cName = normalizeCountryName(properties.NAME || properties.name);
        const sd = App.sharedData;
        const interval = state.currentTimeInterval;

        // 检查论文总量是否达到最低阈值
        var totalPapers = 0;
        var integData = sd.integrated[interval];
        if (integData && integData[cName]) {
            totalPapers = integData[cName].totalPapers || 0;
        }
        if (totalPapers < MIN_PAPERS_THRESHOLD) return '#e5e5e0';

        switch (state.currentMode) {
            case 'rca': {
                const rca = sd.rca[interval];
                if (!rca || !rca[cName]) return '#e5e5e0';
                const crca = rca[cName];
                if (state.currentDiscipline === 'all') {
                    let sum = 0, count = 0;
                    DISCIPLINES.forEach(d => {
                        const cl = CLUSTERS[state.currentCluster];
                        if (state.currentCluster === 'all' || cl.includes(d)) {
                            const v = parseFloat(crca[d]); if (!isNaN(v)) { sum += v; count++; }
                        }
                    });
                    const avg = count > 0 ? sum / count : 0;
                    const lookup = rcaPercentiles.avg[interval]?.[state.currentCluster];
                    return rcaColorScale(rcaToPercentile(avg, lookup));
                } else {
                    const v = parseFloat(crca[state.currentDiscipline]);
                    if (isNaN(v)) return '#e5e5e0';
                    return rcaColorScale(rcaToPercentile(v, rcaPercentiles.global[interval]));
                }
            }
            case 'binary': {
                const bin = sd.binary[interval];
                if (!bin || !bin[cName]) return '#e8e8e0';
                const cb = bin[cName];
                if (state.currentDiscipline === 'all') {
                    const has = DISCIPLINES.some(d => {
                        const cl = CLUSTERS[state.currentCluster];
                        return (state.currentCluster === 'all' || cl.includes(d)) && parseFloat(cb[d]) > 0;
                    });
                    return has ? '#2c7a4e' : '#e8e8e0';
                }
                return parseFloat(cb[state.currentDiscipline]) > 0 ? '#2c7a4e' : '#e8e8e0';
            }
            case 'papers': {
                const integ = sd.integrated[interval];
                if (!integ || !integ[cName]) return '#e5e5e0';
                return d3.interpolateTurbo(Math.min(Math.log10((integ[cName].totalPapers || 0) + 1) / 6, 1));
            }
            case 'diversity': {
                const div = sd.diversity[interval];
                if (!div || div[cName] === undefined) return '#e5e5e0';
                return d3.interpolatePlasma(div[cName]);
            }
        }
        return '#e5e5e0';
    }

    function renderMap() {
        const container = document.getElementById('m2-worldMap');
        container.innerHTML = '';
        if (!App.sharedData.worldData) {
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888">世界地图数据未加载</div>';
            return;
        }

        const width = container.clientWidth || 800;
        const height = container.clientHeight || 500;

        svg = d3.select('#m2-worldMap').append('svg').attr('width', width).attr('height', height);
        svg.append('rect').attr('width', width).attr('height', height).attr('fill', '#edf0f4');

        projection = d3.geoNaturalEarth1().scale(width / 5.2).translate([width / 2, height / 2]);
        path = d3.geoPath().projection(projection);

        g = svg.append('g');

        const graticule = d3.geoGraticule();
        g.append('path').datum(graticule).attr('d', path).attr('fill', 'none')
            .attr('stroke', '#d4d4cc').attr('stroke-width', 0.5).attr('opacity', 0.5);

        const zoom = d3.zoom()
            .scaleExtent([1, 8])
            .filter((event) => {
                if (event.type === 'wheel') return state.zoomActive;
                return true;
            })
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });
        svg.call(zoom);

        // 点击地图激活滚轮缩放
        svg.on('click', (event) => {
            event.stopPropagation();
            state.zoomActive = true;
            svg.style('cursor', 'move');
        });

        // 鼠标离开地图时取消激活
        svg.on('mouseleave', () => {
            if (state.zoomActive) {
                state.zoomActive = false;
                svg.style('cursor', null);
            }
        });

        const tooltipEl = d3.select('#m2-countryTooltip');

        g.selectAll('path.country').data(App.sharedData.worldData.features.filter(function(f) {
            var name = (f.properties.NAME || f.properties.name || '');
            return name !== 'Antarctica' && name !== 'Fr. S. Antarctic Lands';
        })).enter()
            .append('path').attr('class', 'country').attr('d', path)
            .attr('fill', d => getCountryColor(d.properties))
            .on('mouseover', function(event, d) {
                tooltipEl.text(d.properties.NAME || d.properties.name).style('opacity', 1)
                    .style('left', event.pageX + 'px').style('top', (event.pageY - 15) + 'px');
                d3.select(this).transition().duration(200).attr('stroke', '#2166ac').attr('stroke-width', 1.5);
            })
            .on('mousemove', function(event) {
                tooltipEl.style('left', event.pageX + 'px').style('top', (event.pageY - 15) + 'px');
            })
            .on('mouseout', function() {
                tooltipEl.style('opacity', 0);
                d3.select(this).transition().duration(200).attr('stroke', '#fff').attr('stroke-width', 0.5);
            })
            .on('click', function(event, d) { showCountryDetail(d.properties); });
    }

    function updateMapColors() {
        if (!svg) return;
        svg.selectAll('.country').transition().duration(700).attr('fill', d => getCountryColor(d.properties));
    }

    function updateAll() {
        updateMapColors();
        document.getElementById('m2-currentInterval').textContent = `时间区间: ${state.currentTimeInterval}`;
        const data = App.sharedData.integrated[state.currentTimeInterval];
        const validCount = data ? Object.values(data).filter(function(v) { return (v.totalPapers || 0) >= MIN_PAPERS_THRESHOLD; }).length : 0;
        document.getElementById('m2-countryCount').textContent = `国家数: ${validCount}`;
        updateMapTitle();
        updateLegend();
        updateRankingTable();
        if (state.selectedCountry) showCountryDetail(state.selectedCountry);
    }

    function updateMapTitle() {
        const titles = { rca: '全球RCA分布地图', binary: '全球优势分布地图', papers: '全球出版物分布地图', diversity: '全球科学多样性分布地图' };
        document.getElementById('m2-mapTitle').textContent = titles[state.currentMode] || titles.rca;
    }

    function updateLegend() {
        const el = document.getElementById('m2-legendContent');
        let html = '';
        switch (state.currentMode) {
            case 'rca':
                html = `<div class="legend-gradient-container"><div class="legend-gradient" style="background:linear-gradient(to right,#2166ac,#92c5de,#f5f0eb,#f4a582,#b2182b)"></div><div class="legend-labels"><span>低 (P<sub>0</sub>)</span><span>中位 (P<sub>50</sub>)</span><span>高 (P<sub>100</sub>)</span></div></div>`; break;
            case 'binary':
                html = `<div class="legend-item"><div class="legend-color" style="background:#2c7a4e"></div><span>有优势 (RCA > 1)</span></div><div class="legend-item"><div class="legend-color" style="background:#e8e8e0"></div><span>无优势 / 无数据</span></div>`; break;
            case 'papers':
                html = `<div class="legend-gradient-container"><div class="legend-gradient" style="background:linear-gradient(to right,#3b1382,#6a00ff,#00d4aa,#ffff00,#ff0000)"></div><div class="legend-labels"><span>&lt;1K</span><span>10K</span><span>100K</span><span>&gt;1M</span></div></div>`; break;
            case 'diversity':
                html = `<div class="legend-gradient-container"><div class="legend-gradient" style="background:linear-gradient(to right,#0d0887,#6a00a8,#b12a90,#e16462,#fca636,#f0f921)"></div><div class="legend-labels"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div></div>`; break;
        }
        el.innerHTML = html;
    }

    function showCountryDetail(properties) {
        const name = properties.NAME || properties.name;
        const nn = normalizeCountryName(name);
        const interval = state.currentTimeInterval;
        state.selectedCountry = properties;

        d3.selectAll('.country').classed('active', d => (d.properties.NAME || d.properties.name) === name);
        const panel = document.getElementById('m2-countryDetail');
        panel.classList.remove('hidden'); panel.classList.add('visible');

        document.getElementById('m2-countryName').textContent = name;
        const integ = App.sharedData.integrated[interval]?.[nn];
        var papersBelow = !integ || (integ.totalPapers || 0) < MIN_PAPERS_THRESHOLD;
        if (integ && !papersBelow) {
            document.getElementById('m2-countryGDP').textContent = formatGDP(integ.gdp);
            document.getElementById('m2-countryPapers').textContent = formatNumber(integ.totalPapers);
            document.getElementById('m2-countryDiversity').textContent = (integ.diversity * 100).toFixed(1) + '%';
            document.getElementById('m2-countryECI').textContent = integ.eci ? integ.eci.toFixed(3) : '-';
        } else {
            ['m2-countryGDP', 'm2-countryPapers', 'm2-countryDiversity', 'm2-countryECI'].forEach(function(id) { document.getElementById(id).textContent = '-'; });
        }
        if (papersBelow) {
            document.getElementById('m2-countryPapers').textContent = '论文不足' + MIN_PAPERS_THRESHOLD + '篇，数据分析不可靠';
        }
        renderRCAChart(nn); renderRadarChart(nn); renderTrendChart(nn);
    }

    function closeDetail() {
        document.getElementById('m2-countryDetail').classList.remove('visible');
        document.getElementById('m2-countryDetail').classList.add('hidden');
        state.selectedCountry = null;
        d3.selectAll('.country').classed('active', false);
    }

    function renderRCAChart(countryName) {
        const container = document.getElementById('m2-rcaChart'); container.innerHTML = '';
        var integ = App.sharedData.integrated[state.currentTimeInterval];
        if (integ && integ[countryName] && (integ[countryName].totalPapers || 0) < MIN_PAPERS_THRESHOLD) {
            container.innerHTML = '<p style=\"text-align:center;color:#888;padding:1rem;\">样本不足（<' + MIN_PAPERS_THRESHOLD + '篇论文），数据不可靠</p>'; return;
        }
        const rca = App.sharedData.rca[state.currentTimeInterval]?.[countryName];
        if (!rca) { container.innerHTML = '<p style="text-align:center;color:#888;padding:1rem;">无数据</p>'; return; }

        const data = DISCIPLINES.map(d => ({ discipline: d, value: parseFloat(rca[d]) || 0, cluster: App.sharedData.disciplineClusters[d] }))
            .filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);

        if (!data.length) { container.innerHTML = '<p style="text-align:center;color:#888;padding:1rem;">无RCA优势学科</p>'; return; }

        const margin = { top: 10, right: 20, bottom: 60, left: 50 };
        const w = container.clientWidth - margin.left - margin.right;
        const h = 230 - margin.top - margin.bottom;
        const svgEl = d3.select('#m2-rcaChart').append('svg').attr('width', w + margin.left + margin.right).attr('height', h + margin.top + margin.bottom).append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        const x = d3.scaleBand().domain(data.map(d => d.discipline)).range([0, w]).padding(0.3);
        const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value) * 1.1]).range([h, 0]);

        svgEl.selectAll('rect').data(data).enter().append('rect')
            .attr('x', d => x(d.discipline)).attr('width', x.bandwidth())
            .attr('y', h).attr('height', 0)
            .attr('fill', d => CLUSTER_COLORS_BRIGHT[d.cluster] || '#666').attr('rx', 3)
            .transition().duration(600).delay((d, i) => i * 50)
            .attr('y', d => y(d.value)).attr('height', d => h - y(d.value));

        svgEl.selectAll('text.label').data(data).enter().append('text')
            .attr('x', d => x(d.discipline) + x.bandwidth() / 2).attr('y', d => y(d.value) - 5)
            .attr('text-anchor', 'middle').style('fill', '#333').style('font-size', '10px')
            .text(d => d.value.toFixed(2));

        svgEl.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x))
            .selectAll('text').attr('transform', 'rotate(-45)').style('text-anchor', 'end').style('fill', '#888');
        svgEl.append('g').call(d3.axisLeft(y).ticks(5)).selectAll('text').style('fill', '#888');
    }

    function renderRadarChart(countryName) {
        const container = document.getElementById('m2-radarChart'); container.innerHTML = '';
        const rca = App.sharedData.rca[state.currentTimeInterval]?.[countryName];
        if (!rca) { container.innerHTML = '<p style="text-align:center;color:#888;padding:1rem;">无数据</p>'; return; }

        const clusterNames = ['Natural', 'Physical', 'Societal'];
        const data = clusterNames.map(c => {
            let sum = 0, count = 0;
            CLUSTERS[c].forEach(d => { const v = parseFloat(rca[d]); if (!isNaN(v) && v > 0) { sum += v; count++; } });
            return { cluster: c, value: count > 0 ? sum / count : 0 };
        });

        const w = 240, h = 240, r = Math.min(w, h) / 2 - 40, cx = w / 2, cy = h / 2;
        const svgEl = d3.select('#m2-radarChart').append('svg').attr('width', w).attr('height', h);
        const aSlice = Math.PI * 2 / 3;

        for (let i = 1; i <= 4; i++) {
            svgEl.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r * i / 4)
                .attr('fill', 'none').attr('stroke', '#ddd').attr('stroke-dasharray', '3,3').attr('opacity', 0.5);
        }

        clusterNames.forEach((c, i) => {
            const a = aSlice * i - Math.PI / 2;
            const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
            svgEl.append('line').attr('x1', cx).attr('y1', cy).attr('x2', x).attr('y2', y).attr('stroke', '#ddd').attr('opacity', 0.5);
            svgEl.append('text').attr('x', cx + (r + 22) * Math.cos(a)).attr('y', cy + (r + 22) * Math.sin(a))
                .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
                .style('fill', CLUSTER_COLORS_BRIGHT[c]).style('font-size', '11px').style('font-weight', '500').text(c);
        });

        const maxV = d3.max(data, d => d.value) || 1;
        const pts = data.map((d, i) => {
            const a = aSlice * i - Math.PI / 2;
            return { x: cx + (d.value / maxV) * r * Math.cos(a), y: cy + (d.value / maxV) * r * Math.sin(a) };
        });

        svgEl.append('polygon').attr('points', pts.map(d => `${d.x},${d.y}`).join(' '))
            .attr('fill', 'rgba(33,102,172,0.18)').attr('stroke', '#2166ac').attr('stroke-width', 2);
        pts.forEach(p => svgEl.append('circle').attr('cx', p.x).attr('cy', p.y).attr('r', 5).attr('fill', '#2166ac').attr('stroke', '#fff').attr('stroke-width', 2));
    }

    function renderTrendChart(countryName) {
        const container = document.getElementById('m2-trendChart'); container.innerHTML = '';
        var integ = App.sharedData.integrated[state.currentTimeInterval];
        if (integ && integ[countryName] && (integ[countryName].totalPapers || 0) < MIN_PAPERS_THRESHOLD) {
            container.innerHTML = '<p style=\"text-align:center;color:#888;padding:1rem;\">样本不足（<' + MIN_PAPERS_THRESHOLD + '篇论文），数据不可靠</p>'; return;
        }
        const data = TIME_INTERVALS.map(t => ({ interval: t, value: App.sharedData.diversity[t]?.[countryName] || 0 })).filter(d => d.value > 0);
        if (!data.length) { container.innerHTML = '<p style="text-align:center;color:#888;padding:1rem;">无数据</p>'; return; }

        const margin = { top: 20, right: 20, bottom: 40, left: 40 };
        const w = container.clientWidth - margin.left - margin.right;
        const h = 230 - margin.top - margin.bottom;
        const svgEl = d3.select('#m2-trendChart').append('svg').attr('width', w + margin.left + margin.right).attr('height', h + margin.top + margin.bottom).append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        const x = d3.scalePoint().domain(data.map(d => d.interval)).range([0, w]);
        const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value) * 1.1]).range([h, 0]);

        svgEl.selectAll('line.grid').data(y.ticks(5)).enter().append('line').attr('x1', 0).attr('x2', w)
            .attr('y1', d => y(d)).attr('y2', d => y(d)).attr('stroke', '#ddd').attr('stroke-dasharray', '2,2');

        const line = d3.line().x(d => x(d.interval)).y(d => y(d.value)).curve(d3.curveMonotoneX);
        svgEl.append('path').datum(data).attr('fill', 'none').attr('stroke', '#4393c3').attr('stroke-width', 2).attr('d', line);
        svgEl.selectAll('circle.dot').data(data).enter().append('circle')
            .attr('cx', d => x(d.interval)).attr('cy', d => y(d.value)).attr('r', 4).attr('fill', '#4393c3').attr('stroke', '#fff').attr('stroke-width', 2);

        svgEl.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x)).selectAll('text')
            .attr('transform', 'rotate(-45)').style('text-anchor', 'end').style('fill', '#888');
        svgEl.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => (d * 100).toFixed(0) + '%')).selectAll('text').style('fill', '#888');
    }

    function updateRankingTable(sortBy = 'papers') {
        const tbody = document.getElementById('m2-rankingTable'); tbody.innerHTML = '';
        const interval = state.currentTimeInterval;
        const data = [];
        Object.entries(App.sharedData.integrated[interval] || {}).forEach(([c, v]) => {
            if ((v.totalPapers || 0) >= MIN_PAPERS_THRESHOLD) {
                data.push({ country: c, papers: v.totalPapers || 0, diversity: v.diversity || 0, gdp: v.gdp || 0, eci: v.eci || -999 });
            }
        });
        data.sort((a, b) => b[sortBy] - a[sortBy]);
        data.slice(0, 20).forEach((d, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${i + 1}</td><td>${d.country}</td><td>${formatNumber(d.papers)}</td><td>${(d.diversity * 100).toFixed(1)}%</td><td>${formatGDP(d.gdp)}</td><td>${d.eci > -999 ? d.eci.toFixed(3) : '-'}</td>`;
            tr.addEventListener('click', () => {
                if (App.sharedData.worldData) {
                    const feat = App.sharedData.worldData.features.find(f => normalizeCountryName(f.properties.NAME || f.properties.name) === d.country);
                    if (feat) showCountryDetail(feat.properties);
                }
            });
            tbody.appendChild(tr);
        });
    }

    function togglePlayback() {
        const btn = document.getElementById('m2-playBtn');
        if (state.isPlaying) {
            clearInterval(state.playbackInterval); state.isPlaying = false;
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 16 16"><polygon points="2,0 2,16 14,8" fill="currentColor"/></svg>';
        } else {
            state.isPlaying = true;
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 16 16"><rect x="2" y="2" width="4" height="12" fill="currentColor"/><rect x="9" y="2" width="4" height="12" fill="currentColor"/></svg>';
            let idx = TIME_INTERVALS.indexOf(state.currentTimeInterval);
            state.playbackInterval = setInterval(() => {
                idx = (idx + 1) % TIME_INTERVALS.length;
                state.currentTimeInterval = TIME_INTERVALS[idx];
                document.getElementById('m2-timeInterval').value = state.currentTimeInterval;
                document.getElementById('m2-timeline').value = idx;
                updateAll();
            }, 2200);
        }
    }

    return { init, updateAll };
})();

