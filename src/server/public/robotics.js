const categories = [
  { key: 'all', label: '全部方向' },
  { key: 'foundation', label: '开发基础', start: 1, end: 10 },
  { key: 'ros', label: 'ROS 2 系统', start: 11, end: 20 },
  { key: 'simulation', label: '仿真与部署', start: 21, end: 30 },
  { key: 'perception', label: '感知与定位', start: 31, end: 40 },
  { key: 'control', label: '规划与控制', start: 41, end: 50 }
];

const storageKey = 'jobtrending.robotics.practice.v1';
const state = {
  data: null,
  category: 'all',
  search: '',
  pendingOnly: false,
  visibleCount: 8,
  evidenceCount: 3,
  selectedId: new URLSearchParams(window.location.hash.slice(1)).get('skill'),
  practiced: new Set()
};

const nodes = {
  sampleCount: document.querySelector('#sample-count'),
  sampleDate: document.querySelector('#sample-date'),
  axisTotal: document.querySelector('#axis-total'),
  resultCount: document.querySelector('#result-count'),
  categoryStrip: document.querySelector('#category-strip'),
  skillList: document.querySelector('#skill-list'),
  detail: document.querySelector('#skill-detail'),
  showMore: document.querySelector('#show-more'),
  methodFigures: document.querySelector('#method-figures'),
  search: document.querySelector('#skill-search'),
  pendingOnly: document.querySelector('#pending-only')
};

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function skillCategory(skill) {
  const number = Number(skill.id);
  return categories.find((category) => category.start <= number && number <= category.end);
}

function readProgress() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(stored)) state.practiced = new Set(stored.map(String));
  } catch {
    state.practiced = new Set();
  }
}

function saveProgress() {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...state.practiced]));
  } catch {
    return;
  }
}

function filteredSkills() {
  const text = state.search.toLocaleLowerCase('zh-CN');
  return [...state.data.skills]
    .filter((skill) => state.category === 'all' || skillCategory(skill)?.key === state.category)
    .filter((skill) => !text || `${skill.name} ${skill.check}`.toLocaleLowerCase('zh-CN').includes(text))
    .filter((skill) => !state.pendingOnly || !state.practiced.has(skill.id))
    .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name, 'zh-CN'));
}

function orderedSources(skill) {
  const seen = new Set();
  const distinct = [];
  const repeated = [];
  for (const source of skill.sources) {
    const key = String(source.excerpt || '').replace(/\s+/g, '').toLocaleLowerCase('zh-CN');
    if (seen.has(key)) repeated.push(source);
    else {
      seen.add(key);
      distinct.push(source);
    }
  }
  return [...distinct, ...repeated];
}

function renderCategories() {
  const fragment = document.createDocumentFragment();
  for (const category of categories) {
    const button = element('button', 'category-button', category.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.category === category.key));
    if (state.category === category.key) button.classList.add('is-active');
    button.addEventListener('click', () => {
      state.category = category.key;
      state.visibleCount = 8;
      state.evidenceCount = 3;
      state.selectedId = null;
      renderAll();
    });
    fragment.append(button);
  }
  nodes.categoryStrip.replaceChildren(fragment);
}

function renderSkillList(skills) {
  const fragment = document.createDocumentFragment();
  const maxCount = Math.max(1, ...state.data.skills.map((skill) => skill.count));

  for (const skill of skills.slice(0, state.visibleCount)) {
    const row = element('button', 'skill-row');
    row.type = 'button';
    row.setAttribute('aria-pressed', String(state.selectedId === skill.id));
    if (state.selectedId === skill.id) row.classList.add('is-selected');

    const main = element('span', 'skill-main');
    const title = element('span', 'skill-name', skill.name);
    if (state.practiced.has(skill.id)) title.append(element('span', 'practiced-mark', '已练习'));
    main.append(title, element('span', 'skill-group', skillCategory(skill)?.label || '其他'));

    const measure = element('span', 'skill-measure');
    const track = element('span', 'skill-track');
    const fill = element('span', 'skill-fill');
    fill.style.width = `${Math.max(3, Math.round(skill.count / maxCount * 100))}%`;
    track.append(fill);
    measure.append(track, element('strong', 'skill-count', String(skill.count)));
    row.append(main, measure);
    row.addEventListener('click', () => {
      state.selectedId = skill.id;
      state.evidenceCount = 3;
      window.history.replaceState(null, '', `#skill=${encodeURIComponent(skill.id)}`);
      renderAll();
      if (window.matchMedia('(max-width: 780px)').matches) {
        nodes.detail.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      }
    });
    fragment.append(row);
  }

  if (skills.length === 0) {
    fragment.append(element('p', 'empty-state', '没有匹配的技能。试试其他关键词或方向。'));
  }

  nodes.skillList.replaceChildren(fragment);
  nodes.resultCount.textContent = `当前 ${skills.length} 项`;
  nodes.showMore.hidden = skills.length <= state.visibleCount;
  nodes.showMore.textContent = `再看 ${Math.min(8, skills.length - state.visibleCount)} 项技能`;
}

function renderDetail(skill) {
  if (!skill) {
    nodes.detail.replaceChildren(element('p', 'detail-empty', '选择一项技能，查看练习验收和岗位原文。'));
    return;
  }

  const fragment = document.createDocumentFragment();
  const top = element('div', 'detail-top');
  top.append(element('span', 'detail-category', skillCategory(skill)?.label || '其他'));
  const heading = element('h2', '', skill.name);
  const countLine = element('p', 'detail-count');
  countLine.append(element('strong', '', String(skill.count)), document.createTextNode(` / ${state.data.reviewedRelevantJobs} 个岗位提到`));
  const percent = state.data.reviewedRelevantJobs ? Math.round(skill.count / state.data.reviewedRelevantJobs * 100) : 0;
  const meter = element('div', 'detail-meter');
  const meterFill = element('span');
  meterFill.style.width = `${percent}%`;
  meter.append(meterFill);
  top.append(heading, countLine, meter, element('p', 'detail-percentage', `占本次纳入样本的 ${percent}%`));
  fragment.append(top);

  const practice = element('section', 'practice');
  practice.append(element('h3', '', '练习验收'));
  practice.append(element('p', 'practice-check', skill.check));
  const progressButton = element('button', 'progress-button', state.practiced.has(skill.id) ? '已完成练习 · 点击撤销' : '标记为已完成练习');
  progressButton.type = 'button';
  progressButton.setAttribute('aria-pressed', String(state.practiced.has(skill.id)));
  progressButton.addEventListener('click', () => {
    if (state.practiced.has(skill.id)) state.practiced.delete(skill.id);
    else state.practiced.add(skill.id);
    saveProgress();
    renderAll();
  });
  practice.append(progressButton, element('small', '', `已完成 ${state.practiced.size} / ${state.data.skills.length} 项 · 仅保存在本机浏览器`));
  fragment.append(practice);

  const evidence = element('section', 'evidence');
  const sources = orderedSources(skill);
  const evidenceHead = element('div', 'evidence-heading');
  evidenceHead.append(element('h3', '', '岗位怎么写'), element('span', '', `${skill.sources.length} 条原文依据`));
  evidence.append(evidenceHead);
  for (const source of sources.slice(0, state.evidenceCount)) {
    const item = element('article', 'evidence-item');
    const link = element('a', 'evidence-link', source.title || '查看岗位');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    item.append(link, element('div', 'evidence-meta', [source.company, source.city].filter(Boolean).join(' · ')), element('blockquote', '', source.excerpt));
    evidence.append(item);
  }
  if (state.evidenceCount < skill.sources.length) {
    const more = element('button', 'evidence-more', `再看 ${Math.min(5, skill.sources.length - state.evidenceCount)} 条原文`);
    more.type = 'button';
    more.addEventListener('click', () => {
      state.evidenceCount += 5;
      renderDetail(skill);
    });
    evidence.append(more);
  }
  fragment.append(evidence);
  nodes.detail.replaceChildren(fragment);
}

function renderAll() {
  const skills = filteredSkills();
  if (!skills.some((skill) => skill.id === state.selectedId)) state.selectedId = skills[0]?.id || null;
  const selectedIndex = skills.findIndex((skill) => skill.id === state.selectedId);
  if (selectedIndex >= state.visibleCount) state.visibleCount = selectedIndex + 1;
  renderCategories();
  renderSkillList(skills);
  renderDetail(skills.find((skill) => skill.id === state.selectedId));
}

function renderMethod() {
  const data = state.data;
  const figures = [
    [data.candidateJobs, '搜索候选'],
    [data.capturedDescriptionJobs, '取得描述'],
    [data.pendingReviewJobs, '待审核'],
    [data.reviewedRelevantJobs, '纳入技能统计']
  ];
  const fragment = document.createDocumentFragment();
  for (const [value, label] of figures) {
    const item = element('div', 'method-figure');
    item.append(element('strong', '', String(value)), element('span', '', label));
    fragment.append(item);
  }
  nodes.methodFigures.replaceChildren(fragment);
}

nodes.search.addEventListener('input', () => {
  state.search = nodes.search.value.trim();
  state.visibleCount = 8;
  state.evidenceCount = 3;
  state.selectedId = null;
  renderAll();
});

nodes.pendingOnly.addEventListener('change', () => {
  state.pendingOnly = nodes.pendingOnly.checked;
  state.visibleCount = 8;
  state.selectedId = null;
  renderAll();
});

nodes.showMore.addEventListener('click', () => {
  state.visibleCount += 8;
  renderAll();
});

readProgress();

function loadData() {
  return fetch('/api/robotics/skills')
    .then((response) => {
      if (!response.ok) throw new Error('skill data unavailable');
      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data.skills)) throw new Error('invalid skill data');
      state.data = data;
      nodes.sampleCount.textContent = String(data.reviewedRelevantJobs);
      nodes.axisTotal.textContent = String(data.reviewedRelevantJobs);
      nodes.sampleDate.textContent = `${data.scope} · 实时，${new Date(data.generatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新`;
      renderMethod();
      renderAll();
    });
}

loadData().catch(() => {
  nodes.detail.replaceChildren(element('p', 'detail-empty', '技能数据暂时无法读取。请确认服务在运行，再刷新页面。'));
  nodes.skillList.replaceChildren(element('p', 'empty-state', '暂无可显示的技能数据。'));
});
setInterval(() => loadData().catch(() => {}), 60_000);
