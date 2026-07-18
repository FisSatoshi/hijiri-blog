/* ==========================================================================
   ヒジリBlog — 共通スクリプト
   posts.json / profile.json を読み込んで各ページを描画する
   ========================================================================== */

/* タグは自由入力。色は文字列から自動で決めるので、
   新しいタグを付けるだけで見た目も自動的に増えていく。
   半角カンマ(,)は複数タグの区切り、全角の読点(，)は
   1つのタグの中の「親タグ，子タグ」という階層区切りとして扱う。 */
const TAG_PALETTE = ["#FF8552", "#7C5CFC", "#17A398", "#FFC145", "#E94F7B", "#4C6EF5", "#37B24D", "#F06595"];

/* サムネイルのアイコン：投稿ごとに手動指定（post.icon）があればそれを優先し、
   なければタグ名から自動で決める（よくあるタグは専用アイコン、それ以外はハッシュで固定の絵文字を割り当てる）。 */
const TAG_ICON_MAP = {
  "日記": "📓", "つぶやき": "💬", "ゲーム": "🎮", "お出かけ": "🚃", "旅行": "✈️",
  "グルメ": "🍜", "食べ物": "🍙", "映画": "🎬", "音楽": "🎵", "読書": "📚",
  "写真": "📸", "スポーツ": "⚽", "ペット": "🐾", "勉強": "🖊️", "仕事": "💼",
  "趣味": "🎨", "その他": "✏️",
};
const ICON_PALETTE = ["✨", "🌟", "🍀", "🎈", "🧸", "🌈", "🔖", "🎧", "🌙", "🍡", "🧁", "🪁"];

/** "ゲーム，マリオカートワールド" → { parent: "ゲーム", child: "マリオカートワールド" } */
function splitHier(tagName){
  const parts = String(tagName).split("，").map(s => s.trim()).filter(Boolean);
  return { parent: parts[0] || "その他", child: parts[1] || null };
}

function tagColor(tagName){
  const { parent } = splitHier(tagName);
  let hash = 0;
  for(const ch of parent) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

function normalizeTags(post){
  if(Array.isArray(post.tags) && post.tags.length) return post.tags;
  if(post.category) return [post.category === "diary" ? "日記" : post.category === "game" ? "ゲーム" : post.category === "outing" ? "お出かけ" : "その他"];
  return ["その他"];
}

function tagChip(tagName){
  const { parent, child } = splitHier(tagName);
  const label = child
    ? `${escapeHTML(parent)}<span class="tag-sub">›${escapeHTML(child)}</span>`
    : escapeHTML(parent);
  return `<span class="tag" style="background:${tagColor(tagName)};">${label}</span>`;
}

function tagChipsHTML(post){
  return normalizeTags(post).map(tagChip).join(" ");
}

/** タグの一覧から「親タグ → 使われている子タグ一覧」のツリーを組み立てる */
function buildTagTree(posts){
  const map = new Map();
  posts.forEach(p => normalizeTags(p).forEach(raw => {
    const { parent, child } = splitHier(raw);
    if(!map.has(parent)) map.set(parent, new Set());
    if(child) map.get(parent).add(child);
  }));
  return Array.from(map.entries())
    .map(([parent, childSet]) => ({ parent, children: Array.from(childSet).sort((a, b) => a.localeCompare(b, "ja")) }))
    .sort((a, b) => a.parent.localeCompare(b.parent, "ja"));
}

/** 投稿のタグが、指定した絞り込み条件(親タグのみ／親，子の厳密一致)に合うか判定 */
function tagMatchesFilter(rawTag, filterValue){
  const { parent, child } = splitHier(rawTag);
  const f = splitHier(filterValue);
  if(f.child) return parent === f.parent && child === f.child;
  return parent === f.parent;
}

function collectAllTags(posts){
  const set = new Set();
  posts.forEach(p => normalizeTags(p).forEach(t => {
    set.add(t.trim());
    set.add(splitHier(t).parent);
  }));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
}

function postIcon(post){
  if(post.icon && String(post.icon).trim()) return String(post.icon).trim();
  const tags = normalizeTags(post);
  const top = tags.length ? splitHier(tags[0]).parent : "その他";
  if(TAG_ICON_MAP[top]) return TAG_ICON_MAP[top];
  let hash = 0;
  for(const ch of top) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return ICON_PALETTE[hash % ICON_PALETTE.length];
}

async function loadJSON(path){
  const res = await fetch(path, { cache: "no-store" });
  if(!res.ok) throw new Error(`${path} を読み込めませんでした`);
  return res.json();
}

async function loadPosts(){
  try{
    const data = await loadJSON("data/posts.json");
    return (data.posts || []).slice().sort((a,b) => (a.date < b.date ? 1 : -1));
  }catch(e){
    console.error(e);
    return [];
  }
}

async function loadProfile(){
  try{
    return await loadJSON("data/profile.json");
  }catch(e){
    console.error(e);
    return null;
  }
}

function formatDate(iso){
  if(!iso) return "";
  const d = new Date(iso);
  if(isNaN(d)) return iso;
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

function postCardHTML(post){
  const primaryTag = normalizeTags(post)[0];
  const accent = tagColor(primaryTag);
  const hasImage = post.media && post.media[0] && post.media[0].type === "image";

  const thumbInner = hasImage
    ? `<img class="thumb-photo" src="${post.media[0].src}" alt="" loading="lazy">
       <div class="thumb-overlay"><span>続きを読む ↗</span></div>`
    : `<div class="thumb-icon-tile" style="background: linear-gradient(135deg, color-mix(in srgb, ${accent} 22%, white), color-mix(in srgb, ${accent} 6%, white));">
         <span class="thumb-icon">${postIcon(post)}</span>
       </div>`;

  return `
    <article class="post-card">
      <a href="post.html?id=${encodeURIComponent(post.id)}">
        <div class="post-thumb" style="--accent:${accent};">${thumbInner}</div>
        <div class="post-body">
          <div class="post-date">${formatDate(post.date)}</div>
          <div class="tag-row">${tagChipsHTML(post)}</div>
          <div class="post-title">${escapeHTML(post.title)}</div>
          <div class="post-excerpt">${escapeHTML(post.excerpt || "")}</div>
        </div>
      </a>
    </article>`;
}

function escapeHTML(str){
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/* ---- ホームページ：最新の投稿プレビュー ---- */
async function renderHomeLatest(){
  const el = document.getElementById("latest-posts");
  if(!el) return;
  const posts = await loadPosts();
  if(posts.length === 0){
    el.innerHTML = `<div class="empty-state"><div class="stamp">まだ投稿がありません</div><p>最初のひとことを、そのうちここに。</p></div>`;
    return;
  }
  el.innerHTML = posts.slice(0, 3).map(postCardHTML).join("");
}

/* ---- ホームページ：プロフィール ---- */
async function renderHomeProfile(){
  const bioEl = document.getElementById("bio-content");
  const timelineEl = document.getElementById("timeline");
  const heroLeadEl = document.getElementById("hero-lead");
  const profile = await loadProfile();
  if(!profile) return;
  if(heroLeadEl && profile.tagline) heroLeadEl.textContent = profile.tagline;
  if(bioEl) bioEl.innerHTML = profile.bio || "";
  if(timelineEl && Array.isArray(profile.history)){
    timelineEl.innerHTML = profile.history.map(h => `
      <li>
        <div class="year">${escapeHTML(h.year)}</div>
        <div class="title">${escapeHTML(h.title)}</div>
        ${h.note ? `<div class="note">${escapeHTML(h.note)}</div>` : ""}
      </li>`).join("");
  }
}

/* ---- 一覧ページ（blog.html） ----
   タグは投稿するたびに自由に増やせるので、絞り込みチップは
   実際に使われているタグから毎回自動で生成する。 */
async function renderBlogList(){
  const grid = document.getElementById("post-grid");
  const filterBar = document.getElementById("filter-bar");
  if(!grid) return;
  const posts = await loadPosts();
  const tagTree = buildTagTree(posts);
  let currentFilter = "all";

  function draw(){
    const filtered = currentFilter === "all"
      ? posts
      : posts.filter(p => normalizeTags(p).some(t => tagMatchesFilter(t, currentFilter)));
    grid.innerHTML = filtered.length
      ? filtered.map(postCardHTML).join("")
      : `<div class="empty-state" style="grid-column:1/-1;"><div class="stamp">このタグの投稿はまだありません</div></div>`;
  }

  function closeAllDropdowns(){
    filterBar.querySelectorAll(".tag-filter-group.is-open").forEach(g => g.classList.remove("is-open"));
    filterBar.querySelectorAll(".tag-caret").forEach(c => c.setAttribute("aria-expanded", "false"));
  }

  function drawFilterBar(){
    if(!filterBar) return;
    const allBtn = `<button class="filter-chip is-active" data-filter="all">すべて</button>`;

    const groups = tagTree.map(({ parent, children }) => {
      const color = tagColor(parent);
      const mainBtn = `<button class="filter-chip" data-filter="${escapeHTML(parent)}" style="--chip-color:${color};">${escapeHTML(parent)}</button>`;
      if(children.length === 0){
        return `<div class="tag-filter-group">${mainBtn}</div>`;
      }
      const dropdown = `
        <div class="tag-dropdown">
          <div class="tag-dropdown-label">${escapeHTML(parent)}のタグ</div>
          ${children.map(c => `<button class="tag-dropdown-chip" data-filter="${escapeHTML(parent)}，${escapeHTML(c)}" style="--chip-color:${color};">${escapeHTML(c)}</button>`).join("")}
        </div>`;
      return `
        <div class="tag-filter-group has-children">
          ${mainBtn}
          <button type="button" class="tag-caret" aria-label="${escapeHTML(parent)}の詳細タグを開く" aria-expanded="false">▾</button>
          ${dropdown}
        </div>`;
    }).join("");

    filterBar.innerHTML = allBtn + groups;

    filterBar.querySelectorAll("[data-filter]").forEach(btn => {
      btn.addEventListener("click", () => {
        filterBar.querySelectorAll("[data-filter]").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        currentFilter = btn.dataset.filter;
        draw();
        closeAllDropdowns();
      });
    });

    filterBar.querySelectorAll(".tag-caret").forEach(caret => {
      caret.addEventListener("click", (e) => {
        e.stopPropagation();
        const group = caret.closest(".tag-filter-group");
        const wasOpen = group.classList.contains("is-open");
        closeAllDropdowns();
        if(!wasOpen){
          group.classList.add("is-open");
          caret.setAttribute("aria-expanded", "true");
        }
      });
    });
  }

  document.addEventListener("click", () => { if(filterBar) closeAllDropdowns(); });

  drawFilterBar();
  draw();
}

/* ---- 単一記事ページ（post.html） ---- */
async function renderSinglePost(){
  const root = document.getElementById("post-root");
  if(!root) return;
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const posts = await loadPosts();
  const post = posts.find(p => p.id === id);

  if(!post){
    root.innerHTML = `<div class="empty-state"><div class="stamp">記事が見つかりませんでした</div><p><a href="blog.html">記事一覧にもどる</a></p></div>`;
    document.title = "記事が見つかりません — ヒジリBlog";
    return;
  }

  document.title = `${post.title} — ヒジリBlog`;

  root.innerHTML = `
    <div class="post-header">
      <div class="post-meta">
        <span>${formatDate(post.date)}</span>
        <span class="tag-row">${tagChipsHTML(post)}</span>
      </div>
      <h1>${escapeHTML(post.title)}</h1>
    </div>
    <div class="post-content">${post.body || ""}</div>
    <p style="margin-top:40px;"><a href="blog.html">← 記事一覧にもどる</a></p>
  `;
}

/* ---- 背景の浮遊モチーフ（admin.html以外の閲覧ページにだけ表示） ---- */
function renderBackgroundDecor(){
  if(document.getElementById("gate")) return; // 管理画面では出さない
  if(document.getElementById("bg-decor")) return;
  const decor = document.createElement("div");
  decor.id = "bg-decor";
  decor.setAttribute("aria-hidden", "true");
  decor.innerHTML = `
    <span class="deco d1">✦</span>
    <span class="deco d2">🎈</span>
    <span class="deco d3">✎</span>
    <span class="deco d4">☁️</span>
    <span class="deco d5">✦</span>
    <span class="deco d6">🎀</span>
  `;
  document.body.appendChild(decor);
}

/* ---- ナビゲーションの現在地ハイライト ---- */
function highlightNav(){
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".main-nav a").forEach(a => {
    if(a.getAttribute("href") === path) a.classList.add("is-active");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  highlightNav();
  renderBackgroundDecor();
  renderHomeLatest();
  renderHomeProfile();
  renderBlogList();
  renderSinglePost();
});
