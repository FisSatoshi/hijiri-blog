/* ==========================================================================
   ヒジリBlog — 共通スクリプト
   posts.json / profile.json を読み込んで各ページを描画する
   ========================================================================== */

/* タグは自由入力。色は文字列から自動で決めるので、
   新しいタグを付けるだけで見た目も自動的に増えていく。 */
const TAG_PALETTE = ["#FF8552", "#7C5CFC", "#17A398", "#FFC145", "#E94F7B", "#4C6EF5", "#37B24D", "#F06595"];

function tagColor(tagName){
  let hash = 0;
  for(const ch of String(tagName)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

function normalizeTags(post){
  if(Array.isArray(post.tags) && post.tags.length) return post.tags;
  if(post.category) return [post.category === "diary" ? "日記" : post.category === "game" ? "ゲーム" : post.category === "outing" ? "お出かけ" : "その他"];
  return ["その他"];
}

function tagChip(tagName){
  return `<span class="tag" style="background:${tagColor(tagName)};">${escapeHTML(tagName)}</span>`;
}

function tagChipsHTML(post){
  return normalizeTags(post).map(tagChip).join(" ");
}

function collectAllTags(posts){
  const set = new Set();
  posts.forEach(p => normalizeTags(p).forEach(t => set.add(t)));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
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
  const thumb = post.media && post.media[0] && post.media[0].type === "image"
    ? `<img src="${post.media[0].src}" alt="" style="width:100%;height:100%;object-fit:cover;">`
    : "📝";
  return `
    <article class="post-card">
      <a href="post.html?id=${encodeURIComponent(post.id)}">
        <div class="post-thumb">${thumb}</div>
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
  const allTags = collectAllTags(posts);
  let currentFilter = "all";

  function draw(){
    const filtered = currentFilter === "all" ? posts : posts.filter(p => normalizeTags(p).includes(currentFilter));
    grid.innerHTML = filtered.length
      ? filtered.map(postCardHTML).join("")
      : `<div class="empty-state" style="grid-column:1/-1;"><div class="stamp">このタグの投稿はまだありません</div></div>`;
  }

  function drawFilterBar(){
    if(!filterBar) return;
    const chips = [`<button class="filter-chip is-active" data-filter="all">すべて</button>`]
      .concat(allTags.map(t => `<button class="filter-chip" data-filter="${escapeHTML(t)}" style="--chip-color:${tagColor(t)};">${escapeHTML(t)}</button>`));
    filterBar.innerHTML = chips.join("");

    filterBar.querySelectorAll(".filter-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        filterBar.querySelectorAll(".filter-chip").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        currentFilter = btn.dataset.filter;
        draw();
      });
    });
  }

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

  const mediaHTML = (post.media || []).map(m => {
    if(m.type === "video"){
      return `<video controls src="${m.src}"></video>${m.caption ? `<p class="post-date">${escapeHTML(m.caption)}</p>` : ""}`;
    }
    return `<img src="${m.src}" alt="${escapeHTML(m.caption || '')}">${m.caption ? `<p class="post-date">${escapeHTML(m.caption)}</p>` : ""}`;
  }).join("");

  root.innerHTML = `
    <div class="post-header">
      <div class="post-meta">
        <span>${formatDate(post.date)}</span>
        <span class="tag-row">${tagChipsHTML(post)}</span>
      </div>
      <h1>${escapeHTML(post.title)}</h1>
    </div>
    <div class="post-content">${post.body || ""}</div>
    ${mediaHTML}
    <p style="margin-top:40px;"><a href="blog.html">← 記事一覧にもどる</a></p>
  `;
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
  renderHomeLatest();
  renderHomeProfile();
  renderBlogList();
  renderSinglePost();
});
