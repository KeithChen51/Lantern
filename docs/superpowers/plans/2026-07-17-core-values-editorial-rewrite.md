# Core Values Editorial Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有核心价值英文选词页面改成“服务核心框架英文版方案”，保留考据深度，去除公式化 AI 文风，并让章节纹样自然融入页面边缘。

**Architecture:** 继续使用现有单文件 HTML，不拆分脚本、样式或资源。先用静态契约锁定标题、文案模式和纹样规则，再分别修改正文与 CSS，最后运行内容、资源、脚本和项目测试。

**Tech Stack:** HTML5、CSS3、原生 JavaScript、PowerShell 静态检查、Vitest 项目测试。

## Global Constraints

- 只修改 `C:\Own Docm\Coding\服务品牌升级\Lantern\brand-vi-and-training\brand-vi\精诚服务核心价值英文选词说明.html`。
- 五个英文主词保持 `Truth · Goodness · Beauty · Care · Flourishing`。
- 中文正式用词保持 `求真 · 尽善 · 致美 · 大爱 · 幸福`。
- 保留 14 项来源、音标、拉丁语与“概念对应并非直接词根”等事实边界。
- 不修改章节导航、阅读进度、返回顶部、打印样式和内嵌资源数量。
- 不触碰仓库中用户现有的未提交文件。

---

### Task 1: 建立修订契约

**Files:**
- Test: PowerShell 内联契约，不创建持久测试文件
- Inspect: `C:\Own Docm\Coding\服务品牌升级\Lantern\brand-vi-and-training\brand-vi\精诚服务核心价值英文选词说明.html`

**Interfaces:**
- Consumes: 当前 HTML 字符串
- Produces: 对新标题、模板句数量和纹样边缘化规则的可重复检查

- [ ] **Step 1: 运行修订前契约**

```powershell
$p = 'C:\Own Docm\Coding\服务品牌升级\Lantern\brand-vi-and-training\brand-vi\精诚服务核心价值英文选词说明.html'
$t = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)
$checks = [ordered]@{
  new_title = $t.Contains('服务核心框架英文版方案')
  old_title_removed = -not $t.Contains('为什么是<span>这五个词？</span>')
  formulaic_phrases = [regex]::Matches($t, '不是[^。；]+而是|不只[^。；]+也|不仅[^。；]+而且').Count -le 3
  edge_pattern = $t.Contains('inline-size: clamp(34rem, 46vw, 42rem)') -and $t.Contains('right: -23rem')
}
$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
if (-not $failed.Count) { throw 'Expected the pre-edit contract to fail' }
$failed | ForEach-Object { "RED=$($_.Key)" }
```

Expected: 至少输出 `RED=new_title`、`RED=old_title_removed` 和 `RED=edge_pattern`。

---

### Task 2: 完成编辑式文案重写

**Files:**
- Modify: `C:\Own Docm\Coding\服务品牌升级\Lantern\brand-vi-and-training\brand-vi\精诚服务核心价值英文选词说明.html`

**Interfaces:**
- Consumes: 现有语义结构、五章词源事实、来源编号和英文品牌解释句
- Produces: 新首屏、总述、五章正文、结语与来源说明

- [ ] **Step 1: 修改页面标题与首屏**

使用以下确定文本，保留原有元素和 class：

```html
<title>服务核心框架英文版方案｜精诚服务</title>
<span>服务核心框架英文版方案</span>
<span class="masthead-meta">English Framework · v1.1</span>
<p class="eyebrow">核心价值的英文表达</p>
<h1 id="page-title">服务核心框架<span>英文版方案</span></h1>
<p class="hero-deck">这套方案先回答一个实际问题：求真、尽善、致美、大爱、幸福，到了英语语境里，分别该用哪个词？我们不追求字面一一对应，而是核对词义、使用习惯和思想来源，再选择最接近精诚服务原意的表达。</p>
```

- [ ] **Step 2: 重写五词总述**

```html
<p class="section-kicker">HOW THE FIVE WORDS WORK · 五个词怎样连起来</p>
<h2 id="overview-title">五个词各有分工，也有先后关系。</h2>
<p class="overview-lead">服务先从事实出发。事实清楚了，才谈得上判断什么做法更合宜；判断落到流程和现场，才会形成一种有秩序的美。Care 提醒我们，规则面对的是具体的人。Flourishing 则把时间拉长，检验客户、员工和组织能否一起变得更好。</p>
```

路径短句依次改为“看清事实”“作出合适选择”“把事情做得有章法”“顾到具体的人”“看长期结果”。

- [ ] **Step 3: 重写五章开篇判断**

保留词源摘要、音标和章节标题，使用以下 chapter thesis：

```text
Truth：Truth 在这里既指事实准确，也指说话算数：车辆情况、费用、进度和风险都要经得起核对。
Goodness：Goodness 关乎判断。遇到具体问题时，要兼顾规则、资源和人的需要，作出合适、周全的选择。
Beauty：Beauty 对应的是“致美”：把专业、秩序和从容做进每一次服务。
Care：Care 从在意开始，并落实为注意、责任和照料。对服务而言，它比抽象的“爱”更准确。
Flourishing：Flourishing 把“幸福”放到更长的时间里：人和组织有条件成长，也能发挥各自的能力。
```

- [ ] **Step 4: 编辑词源与思想背景段**

保留全部事实和引用编号，按以下文本落稿：

```text
Truth：Truth 源自中古英语 trewthe，早期形式是古英语 trēowth。这个词最初就有两层意思：一是事实为真，二是忠实、可信、守信；它与 trēowe（忠诚、可信赖）同源。拉丁语 vēritās 来自 vērus，可表示 truth、truthfulness 和 reality，也可指人的诚实品格。英语 verify、veracity、veritable 沿用这条拉丁词根；Truth 本身仍是日耳曼语来源。中世纪有关“超越属性”的讨论，常把 verum（真）与 unum（一）、bonum（善）放在一起。这里不借用那套宗教或形而上学体系，只取一个简单关系：判断要可信，先得承认事实。

Goodness：Goodness 由 good 和 -ness 构成。Good 来自古英语 gōd，-ness 用来形成抽象名词，合起来就是“好这一性质”。拉丁语 bonus、bonum、bonitās 的范围更宽，既可以谈道德上的善，也可以说一个事物品质良好、合宜、有益，或适合其用途。亚里士多德伦理学把“善”与行动目的联系起来，也重视实践智慧。具体情境总有差别，规则提供边界，最后仍要判断怎样做更合适。

Beauty：Beauty 经中古英语 beaute 和 Anglo-French bel、beau 进入英语，可追溯到拉丁语 bellus，含漂亮、优美、可喜和雅致之意。较正式的拉丁词 pulchritūdō 还可以描述城市、作品、结构和比例之美。西方关于美的讨论常涉及比例、和谐、秩序、完整性，以及形式与功能的协调。“真、善、美”汇集了多条古典和中世纪传统，并非一个原封不动的古希腊三元公式。对外介绍时，需要把这条边界说清楚。

Care：Care 来自古英语 cearu、caru，早期含忧虑、悲伤与挂念，继续追溯到日耳曼语词根。现代的注意、负责和照料，正是从“因为重要而挂念”发展出来的。拉丁语 cūra、cūrāre 也表示关切、照料和用心，但 OED 明确指出，两者意义接近，却不是同一词源。关怀伦理把关系和依赖带回道德判断。抽象规则仍然重要，但人在怎样的处境中、谁在承担后果，同样需要被看见。

Flourishing：Flourishing 来自 flourish，经 Anglo-French florir 进入英语，连接拉丁语 flōrēre（开花、繁盛）与 flōs、flōris（花）。“开花”就是这个词本来的意象：生命在合适条件下长开，逐步发挥自身能力。现代伦理学常用 human flourishing 解释古希腊语 eudaimonia，关注的是一生怎样过得好，而非一时的愉悦。
```

- [ ] **Step 5: 重写服务现场解释与选词判断**

```text
Truth：放在服务现场，Truth 要求我们把车辆情况讲清楚，费用和进度说准确。暂时不能确定的，也要明确告诉客户。选择 Truth，是因为它能同时容纳“查清事实”和“让人信得过”。Accuracy 更像检验结果；Authenticity 常用于真实自我；Integrity 接近正直和一致性。它们都有关联，却不能单独覆盖“求真”在服务现场的含义。

Goodness：尽善不等于无原则让利。成本、效率和资源都是真实约束；要做的是在这些条件内，找出对客户和长期关系更负责的办法。Goodness 保留了真、善、美之间的关系，也比 Excellence 更接近“合宜的判断”。它在日常英语中可能先让人想到善良，所以必须和解释句一起使用。

Beauty：服务之美首先是一种做事方式。流程清楚，现场有序，交付从容；客户和员工都能感受到这种差别。中文定稿是“致美”。“至美”指最高或最完美的状态；“致美”是一个动作，意思是让事情逐步趋于美。英文用 Beauty 做主标签最清楚，具体含义由解释句补足。

Care：大爱落在具体处境里：有人担心安全，有人承受时间和费用压力，员工也有能力与边界。Care 要求规则看见这些差别，并给出负责任的回应。Care 是服务英语中很自然的词。它可以指态度，也可以直接进入 customer care、duty of care、care for employees 等组织语境。Love 太私人；Great Love 生硬；Compassion 更集中于痛苦；Humanity 又偏抽象。

Flourishing：对客户，是安心使用并愿意继续托付；对员工，是获得支持、尊重和成长空间；对组织，是靠真实价值和稳定交付取得长期结果。Happiness 简单亲切，却容易落在即时情绪或满意度上；它的词根 hap 还与好运、机遇和命运相关。Flourishing 更明确地指向发展，能把客户、员工和组织放进同一个长期视角。这个词不算日常，因此同样需要解释句。
```

- [ ] **Step 6: 压缩备选词说明并更新结语**

每项备选词保留一个具体不足，不重复“容易”“强调”“范围”。结语使用：

```html
<p class="section-kicker">USAGE NOTE · 使用方式</p>
<h2 id="closing-title">五个词要和解释句一起使用。</h2>
<p>单独摆出 Truth、Goodness、Beauty、Care、Flourishing，英语读者会按自己的日常经验理解。正式发布、培训或国际沟通时，应同时保留解释句，把词义带回精诚服务的业务现场。</p>
```

来源说明使用：

```html
<h2 id="sources-title">这些词从哪里来，我们为什么这样解释</h2>
<p class="sources-intro">以下 14 项来源用于核对词源、概念和思想背景。文中明确区分直接词源、概念对应和品牌解释：前两者可以查证，后者是精诚服务结合自身业务作出的选择。</p>
```

---

### Task 3: 让纹样成为边缘暗纹

**Files:**
- Modify: `C:\Own Docm\Coding\服务品牌升级\Lantern\brand-vi-and-training\brand-vi\精诚服务核心价值英文选词说明.html`

**Interfaces:**
- Consumes: 五个现有 `--mask-*` 数据资源和每章 `--pattern` 变量
- Produces: 不形成完整方块、不遮挡文字的边缘裁切纹样

- [ ] **Step 1: 修改首屏纹样**

```css
.hero::before {
  inset: -14rem -22rem auto auto;
  width: min(80vw, 46rem);
  opacity: 0.035;
  transform: rotate(3deg);
}
```

保留原有 background、mask 和 pointer-events 声明。

- [ ] **Step 2: 修改章节纹样基础样式**

```css
.value-chapter::after {
  inset: 5rem -16rem auto auto;
  inline-size: 22rem;
  opacity: 0.04;
  transform: none;
}
```

保留 `z-index: -1`、`background`、mask 和 `pointer-events`。

- [ ] **Step 3: 添加桌面边缘裁切规则**

在 `@media (min-width: 48rem)` 中加入：

```css
.value-chapter::after {
  top: 4rem;
  right: -23rem;
  inline-size: clamp(34rem, 46vw, 42rem);
  opacity: 0.045;
}
```

- [ ] **Step 4: 检查纹样不遮挡内容**

确认 `.value-chapter` 仍为 `overflow: hidden` 和 `isolation: isolate`，`.chapter-inner` 保持在纹样之上；移动端只显示右缘片段。

---

### Task 4: 完整验证

**Files:**
- Verify: `C:\Own Docm\Coding\服务品牌升级\Lantern\brand-vi-and-training\brand-vi\精诚服务核心价值英文选词说明.html`
- Test: `C:\Own Docm\Coding\服务品牌升级\Lantern\lantern-app`

**Interfaces:**
- Consumes: 修订后的单文件 HTML
- Produces: 内容契约、资源完整性、脚本语法和项目回归证据

- [ ] **Step 1: 重新运行 Task 1 契约**

Expected: 所有检查为 true，不再输出 `RED=`。

- [ ] **Step 2: 运行静态结构检查**

检查五章、五个导航项、14 项来源、10 个内嵌 PNG、唯一 ID、全部页内链接、无外部运行时依赖，以及精确的中英文框架词。

- [ ] **Step 3: 解析内联 JavaScript**

```powershell
$p = 'C:\Own Docm\Coding\服务品牌升级\Lantern\brand-vi-and-training\brand-vi\精诚服务核心价值英文选词说明.html'
@'
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
if (scripts.length !== 1) throw new Error(`Expected 1 inline script, got ${scripts.length}`);
for (const code of scripts) new Function(code);
console.log('JS_SYNTAX=pass');
'@ | node - $p
```

Expected: `JS_SYNTAX=pass`。

- [ ] **Step 4: 运行项目测试**

Run: `npm test`

Expected: 26 个测试文件、113 项测试全部通过。

- [ ] **Step 5: 检查仓库状态**

Run: `git status --short`

Expected: 仍只显示用户原有未提交文件；目标 HTML 位于仓库外，不进入提交。
