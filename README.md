# Group-19: 全球知识生产的规律洞察

基于 Nature Human Behaviour (2022) 论文的交互式数据可视化网站，复现并扩展了原文的核心分析，以滚动叙事的方式呈现全球科学知识生产的结构、演变与不平等。

## 数据规模

- 时间跨度：1973–2017（以五年为区间，共 9 个时间段）
- 覆盖范围：217 个国家/地区，143 个学科
- 数据量：约 3500 万篇论文

## 内容结构

### 第一章 · 全球科学能力的空间分布
交互式世界地图，展示各国在四个维度上的表现：
- **RCA 模式**：显性比较优势（一国某学科论文占比相对于全球平均水平），蓝-红渐变
- **Binary 模式**：有无比较优势的二值视图
- **出版物模式**：论文发表总量，紫色-红色渐变
- **多样性模式**：拥有比较优势的学科比例，紫色-黄色渐变

点击任意国家可查看该国学科优势分布、三大集群雷达图、多样性变化趋势。支持时间区间切换和自动播放。

### 第二章 · 学科之间的关联结构
基于力导向布局的学科关联网络图：
- 节点大小表示学科论文量，连线粗细表示学科邻近性
- 三大集群（自然、物理、社会）用颜色区分
- 可调整边阈值过滤弱关联，支持缩放、拖拽、点击查看学科详情和趋势

### 第三章 · 国家科研结构的发展路径
三元相图（Ternary Plot）展示各国在三大学科集群间的结构定位：
- **全球格局模式**：当前时间区间所有国家的分布
- **发展路径模式**：单个国家跨时间的轨迹，对比实际路径与基于关联性原则的模型预测
- 世界地图联动显示各国主导学科集群
- 支持收入组别筛选

### 第四章 · 四十年结构演变趋势
Plotly 交互图表展示四种系统级指标的长期趋势：
- 嵌套性（NODF）：等级秩序的变化
- 模块性（Modularity Q）：学科集群间壁垒的消长
- 按收入组别的出版物数量和科学多样性
- 出版物与多样性/GDP/经济复杂度的关联分析
- 多指标趋势对比和自定义散点图

## 技术实现

- **前端框架**：纯原生 JavaScript（ES6+），无框架依赖
- **可视化库**：D3.js v7（力导向图、地图、三元图）、Plotly.js（统计图表）
- **数据处理**：PapaParse（CSV 解析）、TopoJSON（地理数据）
- **样式**：响应式 CSS，滚动叙事布局，支持移动端适配
- **部署**：GitHub Pages（`yulinlin-hub.github.io/yushui_data_visualization`）

## 项目结构

```
├── index.html          # 主页面，包含所有章节的 HTML 结构
├── app.js              # 全局命名空间，数据加载与共享
├── member2.js          # 第一章：世界地图可视化
├── member3.js          # 第二章：力导向学科网络
├── member4.js          # 第三章：三元相图与发展路径
├── member5.js          # 第四章：统计图表（Plotly）
├── styles.css          # 全局样式
├── assets/
│   └── d3.v7.min.js    # D3.js 本地副本
├── data/
│   ├── rca_*.csv           # 各时间段的 RCA 数据
│   ├── binary_rca_*.csv    # 二值化 RCA
│   ├── proximity_*.csv     # 学科邻近性矩阵
│   ├── integrated_data_for_correlation.csv
│   ├── scientific_diversity_by_interval.csv
│   ├── nestedness_nodf.csv
│   ├── bipartite_modularity_by_interval.csv
│   ├── income_group_timeseries.csv
│   ├── world_countries.js  # 世界地图 GeoJSON
│   ├── development_path_data.js
│   └── member3/
│       ├── nodes.json / links.json
│       ├── discipline_meta.json
│       └── discipline_trends.csv
└── README.md
```

## 部署链接

https://yulinlin-hub.github.io/yushui_data_visualization/

## 项目人员

沙羽 · 王诗锦 · 蒋宇 · 蔡亦轩 · 吴江 · 李美航
