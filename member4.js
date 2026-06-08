/* ============================================================
   成员4 可视化模块 — 发展路径（升级版）
   整合自 member4_deliverable/web_project/assets/app.js
   适配 website 框架（使用 m4- 前缀 ID）
   依赖: app.js (App 命名空间), d3.v7.min.js,
         data/development_path_data.js, data/world_countries.js
   ============================================================ */

App.developmentPath = (function () {
  // ──────────────────────────────────────────────
  //  常量与状态
  // ──────────────────────────────────────────────
  const incomeOrder = ["Low income", "Lower middle income", "Upper middle income", "High income", "Unknown"];

  const clusterColors = {
    Natural: "#23845c",
    Physical: "#2563eb",
    Societal: "#c05a1a",
    Balanced: "#64748b"
  };

  const countryAliases = new Map(Object.entries({
    "United States of America": "United States",
    "Russian Federation": "Russia",
    "Republic of Korea": "South Korea",
    "Dem. Rep. Korea": "North Korea",
    "Viet Nam": "Vietnam",
    "Czechia": "Czech Republic",
    "Türkiye": "Turkey",
    "United Republic of Tanzania": "Tanzania",
    "Syrian Arab Republic": "Syria",
    "Lao PDR": "Laos",
    "Lao People's Democratic Republic": "Laos",
    "Cote d'Ivoire": "Cote d'Ivoire",
    "Ivory Coast": "Cote d'Ivoire",
    "Iran": "Iran",
    "Bolivia": "Bolivia",
    "Venezuela": "Venezuela",
    "Moldova": "Moldova",
    "Brunei Darussalam": "Brunei",
    "Slovakia": "Slovak Republic",
    "Kyrgyzstan": "Kyrgyz Republic",
    "Cape Verde": "Cabo Verde",
    "eSwatini": "Swaziland",
    "Eswatini": "Swaziland",
    "Antigua and Barbuda": "Antigua & Barbuda",
    "The Bahamas": "Bahamas",
    "Bosnia and Herzegovina": "Bosnia & Herzegovina",
    "Myanmar": "Burma",
    "Belarus": "Byelarus",
    "Republic of the Congo": "Congo",
    "French Polynesia": "French-Polynesia",
    "Macao S.A.R": "Macau",
    "New Caledonia": "New-Caledonia",
    "Kosovo": "Republic of Kosovo",
    "Saint Vincent and the Grenadines": "Saint-Vincent-et-les-Grenadines",
    "Saint Lucia": "St-Lucia",
    "São Tomé and Principe": "Sao Tome & Principe",
    "Sao Tome and Principe": "Sao Tome & Principe"
  }));

  let data, state;
  const fmtNumber = d3.format(",.2f");
  const fmtInteger = d3.format(",");
  const fmtPercent = d3.format(".0%");

  // ──────────────────────────────────────────────
  //  辅助函数
  // ──────────────────────────────────────────────
  function normalizeCountryName(name) {
    if (!name) return "";
    const cleaned = String(name).trim();
    return countryAliases.get(cleaned) || cleaned;
  }

  function currentInterval() {
    return data.intervals[state.intervalIndex];
  }

  function compactInterval(interval) {
    const [start, end] = interval.split("-");
    return `${start}-${end.slice(2)}`;
  }

  function cleanMetric(value, format = fmtNumber) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "缺失";
    return format(Number(value));
  }

  function dominantCluster(row) {
    const ordered = ["Natural", "Physical", "Societal"].sort((a, b) => row[b] - row[a]);
    if (row[ordered[0]] - row[ordered[1]] < 0.04) return "Balanced";
    return ordered[0];
  }

  function getChartGeometry(targetSvg) {
    const node = targetSvg.node();
    const width = Math.max(720, node.clientWidth || 920);
    const height = Math.max(640, node.clientHeight || 720);
    const margin = { top: 86, right: 96, bottom: 84, left: 96 };
    const triHeight = Math.sqrt(3) / 2;
    const availableWidth = width - margin.left - margin.right;
    const availableHeight = height - margin.top - margin.bottom;
    const side = Math.min(availableWidth, availableHeight / triHeight);
    const origin = {
      x: margin.left + (availableWidth - side) / 2,
      y: margin.top + (availableHeight + side * triHeight) / 2
    };
    return {
      width, height, side, triHeight, origin,
      sx: v => origin.x + v * side,
      sy: v => origin.y - v * side
    };
  }

  function pointPath(points, geo) {
    return points.map((p, i) => `${i ? "L" : "M"}${geo.sx(p.x)},${geo.sy(p.y)}`).join("");
  }

  // ──────────────────────────────────────────────
  //  模式切换
  // ──────────────────────────────────────────────
  function enterPathMode(country) {
    state.country = country || state.country;
    state.mode = "path";
    if (state.intervalIndex === data.intervals.length - 1) {
      state.intervalIndex = Math.max(0, data.intervals.length - 2);
    }
    d3.select("#m4-countrySelect").property("value", state.country);
    applyMode();
  }

  function applyMode() {
    const isGlobal = state.mode === "global";
    // 控制模式按钮激活状态
    d3.selectAll(".m4-mode-tab").classed("active", function () {
      return this.dataset.m4ModeTarget === state.mode;
    });
    // 显隐控制
    d3.selectAll(".m4-global-only").style("display", isGlobal ? null : "none");
    d3.selectAll(".m4-path-only").style("display", isGlobal ? "none" : null);
    d3.select("#m4-ternaryChart").style("display", isGlobal ? null : "none");
    d3.select("#m4-pathChartGrid").style("display", isGlobal ? "none" : null);
    d3.select("#m4-globalTimeRow").style("display", isGlobal ? null : "none");
    // 路径模式下隐藏全局标题栏（避免绝对定位叠压路径双图）
    d3.select(".m4-chart-topline").style("display", isGlobal ? null : "none");
    // 路径模式下切换外壳样式（取消固定高度限制，允许双图自由撑高）
    d3.select(".m4-chart-shell").classed("is-path-mode", !isGlobal);

    // 说明文字
    d3.select("#m4-chartHeading").text(isGlobal ? "全球三元分布" : `${state.country} 与全球发展流场`);
    d3.select("#m4-chartDescription").text(
      isGlobal ? "每个点代表当前时期的一个国家。" : "全球总体方向与单个国家轨迹分别展示，便于对照而不互相遮挡。"
    );
    d3.select("#m4-countryPathTitle").text(`${state.country} 的发展轨迹`);

    // 图例
    d3.select("#m4-legend").html(
      (isGlobal
        ? [
            ["Natural", clusterColors.Natural],
            ["Physical", clusterColors.Physical],
            ["Societal", clusterColors.Societal],
            ["收入组密度", "#ef4444"]
          ]
        : [
            ["全球真实平均移动", "#dc2626"],
            ["全球预测平均移动", "#64748b"],
            ["国家实际轨迹", "#0f766e"],
            ["国家模型预测", "#7c3aed"]
          ])
        .map(([label, color]) => `<span><i style="background:${color}"></i>${label}</span>`)
        .join("")
    );
  }

  // ──────────────────────────────────────────────
  //  控件初始化
  // ──────────────────────────────────────────────
  function setupControls() {
    // 状态条
    d3.select("#m4-countryTotal").text(fmtInteger(data.countries.length));
    d3.select("#m4-intervalTotal").text(fmtInteger(data.intervals.length));
    d3.select("#m4-trajectoryTotal").text(fmtInteger(data.trajectories.length));

    // 模式切换按钮
    d3.selectAll(".m4-mode-tab").on("click", function () {
      const target = this.dataset.m4ModeTarget;
      state.mode = target === "path" ? "path" : "global";
      applyMode();
      render();
    });

    // 国家选择
    d3.select("#m4-countrySelect")
      .selectAll("option")
      .data(data.countries)
      .join("option")
      .attr("value", d => d)
      .text(d => d);
    d3.select("#m4-countrySelect").property("value", state.country);
    d3.select("#m4-countrySelect").on("change", function () {
      state.country = this.value;
      applyMode();
      render();
    });

    // 时间滑块
    d3.select("#m4-intervalRange")
      .attr("max", data.intervals.length - 1)
      .property("value", state.intervalIndex)
      .on("input", function () {
        state.intervalIndex = Number(this.value);
        render();
      });

    // 收入组筛选
    const visibleGroups = incomeOrder.filter(g => data.income_groups.includes(g));
    d3.select("#m4-incomeFilters")
      .selectAll("label")
      .data(visibleGroups)
      .join("label")
      .html(g => `<input type="checkbox" value="${g}" ${state.incomeGroups.has(g) ? "checked" : ""}> ${g}`);
    d3.select("#m4-incomeFilters").selectAll("input").on("change", function () {
      if (this.checked) state.incomeGroups.add(this.value);
      else state.incomeGroups.delete(this.value);
      render();
    });

    // 图层开关
    d3.select("#m4-showActual").on("change", function () { state.showActual = this.checked; render(); });
    d3.select("#m4-showPredicted").on("change", function () { state.showPredicted = this.checked; render(); });
    d3.select("#m4-showDensity").on("change", function () { state.showDensity = this.checked; render(); });
    d3.select("#m4-showLabels").on("change", function () { state.showLabels = this.checked; render(); });

    // 地图图例
    d3.select("#m4-mapLegend").html([
      ["Natural", clusterColors.Natural],
      ["Physical", clusterColors.Physical],
      ["Societal", clusterColors.Societal],
      ["Balanced", clusterColors.Balanced],
      ["No data", "#e5eaf0"]
    ].map(([l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join(""));

    // 方法说明
    d3.select("#m4-methodNote").text("Simplex 坐标使用 C_i=n_i/N_i 归一化；预测轨迹使用 proximity density 的 entry/exit null model。");
  }

  // ──────────────────────────────────────────────
  //  地图
  // ──────────────────────────────────────────────
  function drawMap(intervalRows) {
    const mapSvg = d3.select("#m4-worldMap");
    if (!window.WORLD_COUNTRIES_GEOJSON || mapSvg.empty()) return;

    const node = mapSvg.node();
    const width = Math.max(720, node.clientWidth || 920);
    const height = Math.max(360, node.clientHeight || 450);
    mapSvg.attr("viewBox", `0 0 ${width} ${height}`);
    mapSvg.selectAll("*").remove();

    const byCountry = new Map(intervalRows.map(row => [normalizeCountryName(row.Country), row]));
    const mapFeatures = window.WORLD_COUNTRIES_GEOJSON.features.filter(f => {
      const name = f.properties.ADMIN || f.properties.NAME;
      return name !== "Antarctica";
    });
    const mapCollection = { type: "FeatureCollection", features: mapFeatures };
    const projection = d3.geoNaturalEarth1();
    const path = d3.geoPath(projection);
    projection.fitExtent([[24, 72], [width - 24, height - 18]], mapCollection);

    mapSvg.append("rect").attr("x", 0).attr("y", 0)
      .attr("width", width).attr("height", height).attr("fill", "#f8fbfd");
    mapSvg.append("path").datum(d3.geoGraticule10()).attr("d", path)
      .attr("fill", "none").attr("stroke", "#dce5ed").attr("stroke-width", 0.55);

    const mapTooltip = d3.select("#m4-mapTooltip");
    mapSvg.append("g")
      .selectAll("path")
      .data(mapFeatures)
      .join("path")
      .attr("class", f => {
        const row = byCountry.get(normalizeCountryName(f.properties.ADMIN || f.properties.NAME));
        const sel = row && row.Country === state.country ? " selected" : "";
        return `m4-country-shape${row ? "" : " no-data"}${sel}`;
      })
      .attr("d", path)
      .attr("fill", f => {
        const row = byCountry.get(normalizeCountryName(f.properties.ADMIN || f.properties.NAME));
        return row ? clusterColors[dominantCluster(row)] : "#e5eaf0";
      })
      .attr("opacity", f => {
        const row = byCountry.get(normalizeCountryName(f.properties.ADMIN || f.properties.NAME));
        return row ? 0.84 : 1;
      })
      .on("mouseenter mousemove", function (event, f) {
        const row = byCountry.get(normalizeCountryName(f.properties.ADMIN || f.properties.NAME));
        const name = normalizeCountryName(f.properties.ADMIN || f.properties.NAME);
        const body = row
          ? `<strong>${row.Country}</strong><br>${row.Time_Interval}<br>Natural ${fmtPercent(row.Natural)} · Physical ${fmtPercent(row.Physical)} · Societal ${fmtPercent(row.Societal)}<br>Dominant: ${dominantCluster(row)}`
          : `<strong>${name}</strong><br>No data in current interval`;
        mapTooltip.style("display", "block")
          .style("left", `${event.offsetX}px`).style("top", `${event.offsetY}px`).html(body);
      })
      .on("mouseleave", () => mapTooltip.style("display", "none"))
      .on("click", (_, f) => {
        const row = byCountry.get(normalizeCountryName(f.properties.ADMIN || f.properties.NAME));
        if (!row) return;
        enterPathMode(row.Country);
        render();
      });
  }

  // ──────────────────────────────────────────────
  //  三角框架
  // ──────────────────────────────────────────────
  function drawFrame(root, geo) {
    const vertices = {
      Societal: { x: 0, y: 0 },
      Physical: { x: 1, y: 0 },
      Natural: { x: 0.5, y: geo.triHeight }
    };
    const defs = root.append("defs");

    [["m4-arrow-actual", "#151a22"], ["m4-arrow-predicted", "#7c3aed"], ["m4-arrow-actual-next", "#dc2626"]].forEach(([id, color]) => {
      defs.append("marker").attr("id", id).attr("markerWidth", 10).attr("markerHeight", 10)
        .attr("refX", 8).attr("refY", 3).attr("orient", "auto").attr("markerUnits", "strokeWidth")
        .append("path").attr("d", "M0,0 L0,6 L9,3 z").attr("fill", color);
    });

    for (const value of d3.range(0.2, 1, 0.2)) {
      root.append("line").attr("class", "m4-grid-line")
        .attr("x1", geo.sx(value / 2)).attr("y1", geo.sy(value * geo.triHeight))
        .attr("x2", geo.sx(1 - value / 2)).attr("y2", geo.sy(value * geo.triHeight));
      root.append("line").attr("class", "m4-grid-line")
        .attr("x1", geo.sx(value)).attr("y1", geo.sy(0))
        .attr("x2", geo.sx(0.5 + value / 2)).attr("y2", geo.sy((1 - value) * geo.triHeight));
      root.append("line").attr("class", "m4-grid-line")
        .attr("x1", geo.sx(value)).attr("y1", geo.sy(0))
        .attr("x2", geo.sx(value / 2)).attr("y2", geo.sy(value * geo.triHeight));
    }

    root.append("path").attr("class", "m4-frame-line")
      .attr("d", `M${geo.sx(vertices.Societal.x)},${geo.sy(vertices.Societal.y)}L${geo.sx(vertices.Physical.x)},${geo.sy(vertices.Physical.y)}L${geo.sx(vertices.Natural.x)},${geo.sy(vertices.Natural.y)}Z`);

    root.append("text").attr("class", "m4-axis-label")
      .attr("x", geo.sx(vertices.Natural.x)).attr("y", geo.sy(vertices.Natural.y) - 22)
      .attr("text-anchor", "middle").text("Natural");
    root.append("text").attr("class", "m4-axis-label")
      .attr("x", geo.sx(vertices.Physical.x) + 16).attr("y", geo.sy(vertices.Physical.y) + 28)
      .attr("text-anchor", "start").text("Physical");
    root.append("text").attr("class", "m4-axis-label")
      .attr("x", geo.sx(vertices.Societal.x) - 16).attr("y", geo.sy(vertices.Societal.y) + 28)
      .attr("text-anchor", "end").text("Societal");
  }

  // ──────────────────────────────────────────────
  //  密度等高线
  // ──────────────────────────────────────────────
  function drawDensity(root, rows, geo) {
    if (!state.showDensity || rows.length < 8) return;
    const points = rows.map(row => [geo.sx(row.x), geo.sy(row.y)]);
    const contours = d3.contourDensity()
      .x(d => d[0]).y(d => d[1])
      .size([geo.width, geo.height]).bandwidth(24).thresholds(6)(points);
    root.append("g").selectAll("path").data(contours).join("path")
      .attr("class", "m4-density-contour").attr("d", d3.geoPath());
  }

  // ──────────────────────────────────────────────
  //  指标面板
  // ──────────────────────────────────────────────
  function renderMetrics(row) {
    const metricRows = [
      ["收入组", row?.Income_Group || "Unknown"],
      ["论文数", cleanMetric(row?.Total_Papers, fmtInteger)],
      ["科学多样性", cleanMetric(row?.Diversity)],
      ["GDP", cleanMetric(row?.GDP, d3.format(",.0f"))],
      ["ECI", cleanMetric(row?.ECI)],
      ["Natural", row ? fmtPercent(row.Natural) : "缺失"],
      ["Physical", row ? fmtPercent(row.Physical) : "缺失"],
      ["Societal", row ? fmtPercent(row.Societal) : "缺失"]
    ];
    d3.select("#m4-metricPanel")
      .selectAll(".m4-metric").data(metricRows).join("div").attr("class", "m4-metric")
      .html(([label, value]) => `<span>${label}</span><strong>${value}</strong>`);
  }

  // ──────────────────────────────────────────────
  //  路径故事板（path 模式：全国家时期轨迹小格）
  // ──────────────────────────────────────────────
  function drawPathStoryboard(root, geo, country) {
    const actual = data.trajectories
      .filter(row => row.Country === country)
      .sort((a, b) => data.intervals.indexOf(a.From_Interval) - data.intervals.indexOf(b.From_Interval));
    const predictions = new Map(
      data.predictions.filter(row => row.Country === country)
        .map(row => [`${row.From_Interval}|${row.To_Interval}`, row])
    );

    const defs = root.append("defs");
    [["m4-story-arrow-actual", "#dc2626"], ["m4-story-arrow-predicted", "#7c3aed"]].forEach(([id, color]) => {
      defs.append("marker").attr("id", id).attr("markerWidth", 8).attr("markerHeight", 8)
        .attr("refX", 7).attr("refY", 3).attr("orient", "auto").attr("markerUnits", "strokeWidth")
        .append("path").attr("d", "M0,0 L0,6 L8,3 z").attr("fill", color);
    });

    const columns = geo.width >= 1050 ? 4 : 2;
    const rowCount = Math.ceil(actual.length / columns);
    const gapX = 14, gapY = 14;
    const outer = { left: 22, right: 22, top: 82, bottom: 20 };
    const cellWidth = (geo.width - outer.left - outer.right - gapX * (columns - 1)) / columns;
    const cellHeight = (geo.height - outer.top - outer.bottom - gapY * (rowCount - 1)) / rowCount;
    const triHeight = Math.sqrt(3) / 2;

    actual.forEach((step, index) => {
      const prediction = predictions.get(`${step.From_Interval}|${step.To_Interval}`);
      const col = index % columns;
      const row = Math.floor(index / columns);
      const cellX = outer.left + col * (cellWidth + gapX);
      const cellY = outer.top + row * (cellHeight + gapY);
      const side = Math.min(cellWidth - 42, (cellHeight - 64) / triHeight);
      const originX = cellX + (cellWidth - side) / 2;
      const originY = cellY + cellHeight - 24;
      const sx = v => originX + v * side;
      const sy = v => originY - v * side;
      const difference = prediction ? Math.hypot(step.x1 - prediction.predicted_x, step.y1 - prediction.predicted_y) : null;

      root.append("rect").attr("class", "m4-story-cell")
        .attr("x", cellX).attr("y", cellY).attr("width", cellWidth).attr("height", cellHeight).attr("rx", 7);
      root.append("text").attr("class", "m4-story-title").attr("x", cellX + 12).attr("y", cellY + 20)
        .text(`${index + 1}. ${compactInterval(step.From_Interval)} → ${compactInterval(step.To_Interval)}`);
      root.append("text").attr("class", "m4-story-stat").attr("x", cellX + cellWidth - 12).attr("y", cellY + 20).attr("text-anchor", "end")
        .text(difference === null || !state.showActual || !state.showPredicted ? "" : `实际-预测偏差 ${difference.toFixed(3)}`);

      root.append("path").attr("class", "m4-story-triangle")
        .attr("d", `M${sx(0)},${sy(0)}L${sx(1)},${sy(0)}L${sx(0.5)},${sy(triHeight)}Z`);
      root.append("text").attr("class", "m4-story-axis").attr("x", sx(0.5)).attr("y", sy(triHeight) - 5).attr("text-anchor", "middle").text("N");
      root.append("text").attr("class", "m4-story-axis").attr("x", sx(0) - 5).attr("y", sy(0) + 10).attr("text-anchor", "end").text("S");
      root.append("text").attr("class", "m4-story-axis").attr("x", sx(1) + 5).attr("y", sy(0) + 10).text("P");

      if (state.showActual) {
        root.append("line").attr("class", "m4-story-actual-line")
          .attr("x1", sx(step.x0)).attr("y1", sy(step.y0)).attr("x2", sx(step.x1)).attr("y2", sy(step.y1))
          .attr("marker-end", "url(#m4-story-arrow-actual)");
        root.append("circle").attr("class", "m4-story-actual").attr("cx", sx(step.x1)).attr("cy", sy(step.y1)).attr("r", 5);
      }
      if (prediction && state.showPredicted) {
        root.append("line").attr("class", "m4-story-predicted-line")
          .attr("x1", sx(step.x0)).attr("y1", sy(step.y0))
          .attr("x2", sx(prediction.predicted_x)).attr("y2", sy(prediction.predicted_y))
          .attr("marker-end", "url(#m4-story-arrow-predicted)");
        root.append("circle").attr("class", "m4-story-predicted")
          .attr("cx", sx(prediction.predicted_x)).attr("cy", sy(prediction.predicted_y)).attr("r", 5);
      }
      if (prediction && state.showActual && state.showPredicted) {
        root.append("line").attr("class", "m4-story-gap-line")
          .attr("x1", sx(step.x1)).attr("y1", sy(step.y1))
          .attr("x2", sx(prediction.predicted_x)).attr("y2", sy(prediction.predicted_y));
      }
      root.append("circle").attr("class", "m4-story-start").attr("cx", sx(step.x0)).attr("cy", sy(step.y0)).attr("r", 4.5);
    });
  }

  // ──────────────────────────────────────────────
  //  全球平均流场
  // ──────────────────────────────────────────────
  function drawAggregateFlow(root, geo) {
    const predictionByStep = new Map(
      data.predictions.map(row => [`${row.Country}|${row.From_Interval}|${row.To_Interval}`, row])
    );
    const binSize = 0.1;
    const bins = d3.group(
      data.trajectories.map(actual => ({
        actual,
        prediction: predictionByStep.get(`${actual.Country}|${actual.From_Interval}|${actual.To_Interval}`)
      })).filter(r => r.prediction),
      r => `${Math.floor(r.actual.x0 / binSize)}|${Math.floor(r.actual.y0 / binSize)}`
    );

    const flows = Array.from(bins.values()).filter(rows => rows.length >= 4).map(rows => ({
      count: rows.length,
      x0: d3.mean(rows, r => r.actual.x0), y0: d3.mean(rows, r => r.actual.y0),
      actualX: d3.mean(rows, r => r.actual.x1), actualY: d3.mean(rows, r => r.actual.y1),
      predictedX: d3.mean(rows, r => r.prediction.predicted_x), predictedY: d3.mean(rows, r => r.prediction.predicted_y)
    }));

    const defs = root.append("defs");
    [["m4-flow-arrow-actual", "#dc2626"], ["m4-flow-arrow-predicted", "#64748b"]].forEach(([id, color]) => {
      defs.append("marker").attr("id", id).attr("markerWidth", 8).attr("markerHeight", 8)
        .attr("refX", 7).attr("refY", 3).attr("orient", "auto").attr("markerUnits", "strokeWidth")
        .append("path").attr("d", "M0,0 L0,6 L8,3 z").attr("fill", color);
    });

    const tooltip = d3.select("#m4-tooltip");
    const groups = root.append("g").selectAll("g").data(flows).join("g");
    groups.filter(() => state.showPredicted).append("line").attr("class", "m4-flow-predicted")
      .attr("x1", d => geo.sx(d.x0)).attr("y1", d => geo.sy(d.y0))
      .attr("x2", d => geo.sx(d.predictedX)).attr("y2", d => geo.sy(d.predictedY))
      .attr("marker-end", "url(#m4-flow-arrow-predicted)");
    groups.filter(() => state.showActual).append("line").attr("class", "m4-flow-actual")
      .attr("x1", d => geo.sx(d.x0)).attr("y1", d => geo.sy(d.y0))
      .attr("x2", d => geo.sx(d.actualX)).attr("y2", d => geo.sy(d.actualY))
      .attr("marker-end", "url(#m4-flow-arrow-actual)");
    groups.append("circle").attr("class", "m4-flow-start")
      .attr("cx", d => geo.sx(d.x0)).attr("cy", d => geo.sy(d.y0))
      .attr("r", d => Math.min(5.5, 2.5 + Math.sqrt(d.count) * 0.12));
    groups.filter(d => d.count >= 35).append("text").attr("class", "m4-flow-count")
      .attr("x", d => geo.sx(d.x0) + 6).attr("y", d => geo.sy(d.y0) - 6).text(d => `n=${d.count}`);
    groups.append("circle").attr("cx", d => geo.sx(d.x0)).attr("cy", d => geo.sy(d.y0)).attr("r", 11)
      .attr("fill", "transparent").style("cursor", "help")
      .on("mouseenter mousemove", (event, d) => {
        const ad = Math.hypot(d.actualX - d.x0, d.actualY - d.y0);
        const pd = Math.hypot(d.predictedX - d.x0, d.predictedY - d.y0);
        tooltip.style("display", "block").style("left", `${event.offsetX}px`).style("top", `${event.offsetY}px`)
          .html(`<strong>${d.count} 条国家-时期移动</strong><br>真实平均位移 ${ad.toFixed(3)}<br>预测平均位移 ${pd.toFixed(3)}`);
      })
      .on("mouseleave", () => tooltip.style("display", "none"));
  }

  // ──────────────────────────────────────────────
  //  单国家发展轨迹
  // ──────────────────────────────────────────────
  function drawCountryPath(root, geo, country) {
    const positions = data.positions.filter(r => r.Country === country)
      .sort((a, b) => data.intervals.indexOf(a.Time_Interval) - data.intervals.indexOf(b.Time_Interval));
    const predictions = data.predictions.filter(r => r.Country === country)
      .sort((a, b) => data.intervals.indexOf(a.From_Interval) - data.intervals.indexOf(b.From_Interval));
    const tooltip = d3.select("#m4-tooltip");

    if (state.showActual && positions.length > 1) {
      root.append("path").datum(positions).attr("class", "m4-country-path-line")
        .attr("d", d3.line().x(d => geo.sx(d.x)).y(d => geo.sy(d.y)));
      root.append("g").selectAll("circle").data(positions).join("circle")
        .attr("class", "m4-country-path-node").attr("cx", d => geo.sx(d.x)).attr("cy", d => geo.sy(d.y)).attr("r", 6)
        .on("mouseenter mousemove", (event, d) => {
          tooltip.style("display", "block").style("left", `${event.offsetX}px`).style("top", `${event.offsetY}px`)
            .html(`<strong>${d.Country}</strong><br>${d.Time_Interval}<br>Natural ${fmtPercent(d.Natural)} · Physical ${fmtPercent(d.Physical)} · Societal ${fmtPercent(d.Societal)}<br>收入组：${d.Income_Group}`);
        })
        .on("mouseleave", () => tooltip.style("display", "none"));
      root.append("g").selectAll("text").data(positions).join("text")
        .attr("class", "m4-country-node-number").attr("x", d => geo.sx(d.x)).attr("y", d => geo.sy(d.y) + 3)
        .attr("text-anchor", "middle").text((_, i) => i + 1);
      root.append("g").selectAll("text").data(positions.filter((_, i) => i === 0 || i === positions.length - 1))
        .join("text").attr("class", "m4-country-path-label")
        .attr("x", d => geo.sx(d.x) + 9).attr("y", d => geo.sy(d.y) - 9).text(d => compactInterval(d.Time_Interval));
    }

    if (state.showPredicted) {
      root.append("g").selectAll("line").data(predictions).join("line")
        .attr("class", "m4-country-prediction-line")
        .attr("x1", d => geo.sx(d.x0)).attr("y1", d => geo.sy(d.y0))
        .attr("x2", d => geo.sx(d.predicted_x)).attr("y2", d => geo.sy(d.predicted_y))
        .attr("marker-end", "url(#m4-arrow-predicted)");
      root.append("g").selectAll("circle").data(predictions).join("circle")
        .attr("class", "m4-country-prediction-node")
        .attr("cx", d => geo.sx(d.predicted_x)).attr("cy", d => geo.sy(d.predicted_y)).attr("r", 4.5);
    }
  }

  // ──────────────────────────────────────────────
  //  主渲染函数
  // ──────────────────────────────────────────────
  function render() {
    const svg = d3.select("#m4-ternaryChart");
    const flowSvg = d3.select("#m4-flowChart");
    const countryPathSvg = d3.select("#m4-countryPathChart");
    const tooltip = d3.select("#m4-tooltip");

    const geo = getChartGeometry(svg);
    svg.attr("viewBox", `0 0 ${geo.width} ${geo.height}`);
    svg.selectAll("*").remove();
    flowSvg.selectAll("*").remove();
    countryPathSvg.selectAll("*").remove();

    const root = svg.append("g");
    const interval = currentInterval();
    const intervalRows = data.positions.filter(r => r.Time_Interval === interval && state.incomeGroups.has(r.Income_Group));
    const selectedRows = data.positions.filter(r => r.Country === state.country)
      .sort((a, b) => d3.ascending(data.intervals.indexOf(a.Time_Interval), data.intervals.indexOf(b.Time_Interval)));
    const selectedAtInterval = selectedRows.find(r => r.Time_Interval === interval);
    const selectedCurrent = selectedAtInterval || selectedRows[selectedRows.length - 1];

    if (state.mode === "path") {
      const flowGeo = getChartGeometry(flowSvg);
      const countryGeo = getChartGeometry(countryPathSvg);
      flowSvg.attr("viewBox", `0 0 ${flowGeo.width} ${flowGeo.height}`);
      countryPathSvg.attr("viewBox", `0 0 ${countryGeo.width} ${countryGeo.height}`);
      const flowRoot = flowSvg.append("g");
      const countryRoot = countryPathSvg.append("g");
      drawFrame(flowRoot, flowGeo);
      drawAggregateFlow(flowRoot, flowGeo);
      drawFrame(countryRoot, countryGeo);
      drawCountryPath(countryRoot, countryGeo, state.country);
      d3.select("#m4-intervalLabel").text("全部相邻时期");
      d3.select("#m4-visibleCount").text(state.country);
      renderMetrics(selectedRows[selectedRows.length - 1]);
      return;
    }

    // 全球模式
    drawFrame(root, geo);
    drawMap(intervalRows);
    drawDensity(root, intervalRows, geo);

    root.append("g").selectAll("circle").data(intervalRows).join("circle")
      .attr("class", d => d.Country === state.country ? "m4-selected-point" : "m4-point")
      .attr("cx", d => geo.sx(d.x)).attr("cy", d => geo.sy(d.y))
      .attr("r", d => d.Country === state.country ? 8 : 5)
      .attr("fill", d => d.Country === state.country ? "#0f766e" : clusterColors[dominantCluster(d)])
      .on("mouseenter mousemove", (event, d) => {
        tooltip.style("display", "block").style("left", `${event.offsetX}px`).style("top", `${event.offsetY}px`)
          .html(`<strong>${d.Country}</strong><br>${d.Time_Interval}<br>Natural ${fmtPercent(d.Natural)} · Physical ${fmtPercent(d.Physical)} · Societal ${fmtPercent(d.Societal)}<br>收入组：${d.Income_Group}`);
      })
      .on("mouseleave", () => tooltip.style("display", "none"))
      .on("click", (_, d) => { enterPathMode(d.Country); render(); });

    if (state.showLabels) {
      root.append("g").selectAll("text")
        .data(intervalRows.filter(d => ["China", "United States", "Vietnam", "Ethiopia"].includes(d.Country)))
        .join("text").attr("class", "m4-country-label")
        .attr("x", d => geo.sx(d.x) + 8).attr("y", d => geo.sy(d.y) - 8).text(d => d.Country);
    }

    d3.select("#m4-intervalLabel").text(interval);
    d3.select("#m4-visibleCount").text(`${intervalRows.length} 个国家`);
    d3.select("#m4-intervalRange").property("value", state.intervalIndex);
    renderMetrics(selectedCurrent);
  }

  // ──────────────────────────────────────────────
  //  入口
  // ──────────────────────────────────────────────
  function init() {
    data = window.DEVELOPMENT_PATH_DATA;
    if (!data) { console.error("DEVELOPMENT_PATH_DATA not found"); return; }

    state = {
      mode: "global",
      country: data.countries.includes("China") ? "China" : data.countries[0],
      intervalIndex: data.intervals.length - 1,
      incomeGroups: new Set(data.income_groups.filter(g => g !== "Unknown")),
      showActual: true,
      showPredicted: true,
      showDensity: true,
      showLabels: false
    };

    setupControls();
    applyMode();
    render();
    window.addEventListener("resize", () => render());
  }

  return { init, render };
})();
