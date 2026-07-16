/* ==========================================================================
   ヒジリBlog — 管理画面ロジック
   ========================================================================== */

const PASS_HASH_KEY = "hijiri_admin_pass_hash";
const UNLOCK_KEY = "hijiri_admin_unlocked"; // sessionStorage: このタブを開いている間だけ有効

/* ---------------------------------------------------------------------- */
/* ロック画面                                                              */
/* ---------------------------------------------------------------------- */

async function sha256Hex(text){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function initGate(){
  const gate = document.getElementById("gate");
  const app = document.getElementById("admin-app");
  const desc = document.getElementById("gate-desc");
  const passInput = document.getElementById("gate-pass");
  const confirmInput = document.getElementById("gate-pass-confirm");
  const submitBtn = document.getElementById("gate-submit");
  const errorEl = document.getElementById("gate-error");

  const storedHash = localStorage.getItem(PASS_HASH_KEY);
  const isSetupMode = !storedHash;

  if(sessionStorage.getItem(UNLOCK_KEY) === "1"){
    gate.style.display = "none";
    app.style.display = "block";
    initAdminApp();
    return;
  }

  desc.textContent = isSetupMode
    ? "初回設定です。このブラウザで使う合言葉を決めてください。"
    : "合言葉を入力してください。";
  confirmInput.style.display = isSetupMode ? "block" : "none";

  submitBtn.addEventListener("click", async () => {
    errorEl.textContent = "";
    const pass = passInput.value;
    if(!pass){ errorEl.textContent = "合言葉を入力してください。"; return; }

    if(isSetupMode){
      const confirmPass = confirmInput.value;
      if(pass !== confirmPass){ errorEl.textContent = "確認用の合言葉が一致しません。"; return; }
      if(pass.length < 4){ errorEl.textContent = "4文字以上にしてください。"; return; }
      localStorage.setItem(PASS_HASH_KEY, await sha256Hex(pass));
      sessionStorage.setItem(UNLOCK_KEY, "1");
      gate.style.display = "none";
      app.style.display = "block";
      initAdminApp();
    }else{
      const hash = await sha256Hex(pass);
      if(hash === storedHash){
        sessionStorage.setItem(UNLOCK_KEY, "1");
        gate.style.display = "none";
        app.style.display = "block";
        initAdminApp();
      }else{
        errorEl.textContent = "合言葉が違います。";
      }
    }
  });

  passInput.addEventListener("keydown", e => { if(e.key === "Enter") submitBtn.click(); });
  confirmInput.addEventListener("keydown", e => { if(e.key === "Enter") submitBtn.click(); });
}

/* ---------------------------------------------------------------------- */
/* ステータス表示                                                          */
/* ---------------------------------------------------------------------- */

function showStatus(message, kind = "ok"){
  const el = document.getElementById("status-banner");
  el.innerHTML = `<div class="status-banner ${kind}">${message}</div>`;
  if(kind !== "busy"){
    setTimeout(() => { if(el.firstChild && el.firstChild.textContent === message) el.innerHTML = ""; }, 5000);
  }
}

/* ---------------------------------------------------------------------- */
/* タブ切り替え                                                            */
/* ---------------------------------------------------------------------- */

function initTabs(){
  document.querySelectorAll(".admin-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("is-active"));
      document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add("is-active");
    });
  });
}

/* ---------------------------------------------------------------------- */
/* リッチテキストエディタ                                                   */
/* ---------------------------------------------------------------------- */

function initEditorToolbars(){
  document.querySelectorAll(".editor-toolbar").forEach(toolbar => {
    if(toolbar.dataset.wired === "1") return; // 二重初期化によるボタンの多重登録を防ぐ
    toolbar.dataset.wired = "1";

    const targetId = toolbar.dataset.target;
    const editor = document.getElementById(targetId);

    toolbar.querySelectorAll("button[data-cmd]").forEach(btn => {
      btn.addEventListener("click", () => {
        editor.focus();
        const cmd = btn.dataset.cmd;
        if(cmd.startsWith("formatBlock:")){
          document.execCommand("formatBlock", false, cmd.split(":")[1]);
        }else if(cmd === "createLink"){
          const url = prompt("リンク先のURLを入力してください");
          if(url) document.execCommand("createLink", false, url);
        }else{
          document.execCommand(cmd, false, null);
        }
      });
    });

    toolbar.querySelectorAll("input[data-upload]").forEach(input => {
      input.addEventListener("change", () => handleMediaUpload(input, editor));
    });
  });
}

function fileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleMediaUpload(input, editor){
  const file = input.files[0];
  if(!file) return;

  if(input.dataset.busy === "1") return; // 同じ選択に対する二重実行を防ぐ
  input.dataset.busy = "1";

  if(file.size > 20 * 1024 * 1024){
    showStatus("ファイルが大きすぎます（20MBまで）。動画は圧縮するか、外部サービス（YouTube限定公開など）へのリンクをご利用ください。", "err");
    input.value = "";
    input.dataset.busy = "0";
    return;
  }
  if(file.size > 1 * 1024 * 1024){
    showStatus("1MBを超えるファイルです。GitHubへの保存に時間がかかったり失敗する場合があります…", "busy");
  }

  try{
    showStatus("メディアをアップロード中…", "busy");
    const base64 = await fileToBase64(file);
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `assets/${yyyy}/${mm}/${Date.now()}-${safeName}`;

    await ghPutBinaryFile(path, base64, `chore: add media ${path}`);

    const isVideo = input.dataset.upload === "video";
    const tag = isVideo
      ? `<p><video controls src="${path}"></video></p>`
      : `<p><img src="${path}" alt=""></p>`;
    editor.innerHTML += tag;
    showStatus("メディアを追加しました。", "ok");
  }catch(e){
    console.error(e);
    showStatus(`アップロードに失敗しました: ${e.message}`, "err");
  }finally{
    input.value = "";
    input.dataset.busy = "0";
  }
}

/* ---------------------------------------------------------------------- */
/* 記事の読み書き                                                          */
/* ---------------------------------------------------------------------- */

async function fetchPostsFromGitHub(){
  const file = await ghGetFile("data/posts.json");
  if(!file) return { posts: [], sha: null };
  return { posts: (JSON.parse(file.content).posts || []), sha: file.sha };
}

function slugify(title){
  const base = title.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${new Date().toISOString().slice(0,10)}-${base || "post"}-${Math.random().toString(36).slice(2,6)}`;
}

function clearPostForm(){
  document.getElementById("post-id").value = "";
  document.getElementById("post-title").value = "";
  document.getElementById("post-tags").value = "";
  document.getElementById("post-date").value = new Date().toISOString().slice(0,10);
  document.getElementById("post-excerpt").value = "";
  document.getElementById("post-editor").innerHTML = "";
}

function fillPostForm(post){
  document.getElementById("post-id").value = post.id;
  document.getElementById("post-title").value = post.title;
  document.getElementById("post-tags").value = normalizeTags(post).join(", ");
  document.getElementById("post-date").value = post.date;
  document.getElementById("post-excerpt").value = post.excerpt || "";
  document.getElementById("post-editor").innerHTML = post.body || "";
  document.querySelector('.admin-tab-btn[data-tab="write"]').click();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function parseTagsInput(value){
  return value.split(",").map(t => t.trim()).filter(Boolean);
}

/** これまで使われたタグ一覧を入力補助（datalist）に反映する */
function updateTagSuggestions(posts){
  const datalist = document.getElementById("tag-suggestions");
  if(!datalist) return;
  const tags = collectAllTags(posts);
  datalist.innerHTML = tags.map(t => `<option value="${escapeHTML(t)}"></option>`).join("");
}

function extractMediaFromHTML(html){
  const container = document.createElement("div");
  container.innerHTML = html;
  const media = [];
  container.querySelectorAll("img").forEach(img => media.push({ type: "image", src: img.getAttribute("src"), caption: img.getAttribute("alt") || "" }));
  container.querySelectorAll("video").forEach(v => media.push({ type: "video", src: v.getAttribute("src"), caption: "" }));
  return media;
}

async function publishPost(){
  const title = document.getElementById("post-title").value.trim();
  if(!title){ showStatus("タイトルを入力してください。", "err"); return; }

  try{
    showStatus("公開処理中…", "busy");
    const { posts, sha } = await fetchPostsFromGitHub();

    const id = document.getElementById("post-id").value || slugify(title);
    const body = document.getElementById("post-editor").innerHTML;
    const tags = parseTagsInput(document.getElementById("post-tags").value);
    const newPost = {
      id,
      title,
      tags: tags.length ? tags : ["その他"],
      date: document.getElementById("post-date").value || new Date().toISOString().slice(0,10),
      excerpt: document.getElementById("post-excerpt").value.trim(),
      body,
      media: extractMediaFromHTML(body),
    };

    const existingIndex = posts.findIndex(p => p.id === id);
    if(existingIndex >= 0) posts[existingIndex] = newPost;
    else posts.unshift(newPost);

    await ghPutTextFile("data/posts.json", JSON.stringify({ posts }, null, 2), `post: ${existingIndex >= 0 ? "update" : "publish"} "${title}"`);
    showStatus("公開しました！GitHub Pagesへの反映には数十秒〜数分かかることがあります。", "ok");
    clearPostForm();
    refreshPostList();
  }catch(e){
    console.error(e);
    showStatus(`公開に失敗しました: ${e.message}`, "err");
  }
}

async function refreshPostList(){
  const listEl = document.getElementById("post-list");
  listEl.innerHTML = `<p style="color:var(--ink-soft);">読み込み中…</p>`;
  try{
    const { posts } = await fetchPostsFromGitHub();
    updateTagSuggestions(posts);
    if(posts.length === 0){
      listEl.innerHTML = `<div class="empty-state"><div class="stamp">まだ記事がありません</div></div>`;
      return;
    }
    listEl.innerHTML = posts.map(p => `
      <div class="post-list-row">
        <div class="meta">
          <span class="tag-row">${tagChipsHTML(p)}</span>
          <strong>${escapeHTML(p.title)}</strong>
          <span style="color:var(--ink-soft);font-size:13px;">${p.date}</span>
        </div>
        <div class="row-actions">
          <button data-edit="${p.id}">編集</button>
          <button class="danger" data-delete="${p.id}">削除</button>
        </div>
      </div>`).join("");

    listEl.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const { posts } = await fetchPostsFromGitHub();
        const post = posts.find(p => p.id === btn.dataset.edit);
        if(post) fillPostForm(post);
      });
    });
    listEl.querySelectorAll("[data-delete]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if(!confirm("この記事を削除します。よろしいですか？")) return;
        try{
          showStatus("削除中…", "busy");
          const { posts } = await fetchPostsFromGitHub();
          const filtered = posts.filter(p => p.id !== btn.dataset.delete);
          await ghPutTextFile("data/posts.json", JSON.stringify({ posts: filtered }, null, 2), `post: delete ${btn.dataset.delete}`);
          showStatus("削除しました。", "ok");
          refreshPostList();
        }catch(e){
          showStatus(`削除に失敗しました: ${e.message}`, "err");
        }
      });
    });
  }catch(e){
    listEl.innerHTML = `<div class="status-banner err">記事一覧を読み込めませんでした: ${escapeHTML(e.message)}</div>`;
  }
}

/* ---------------------------------------------------------------------- */
/* プロフィール編集                                                         */
/* ---------------------------------------------------------------------- */

function historyRowHTML(item = { year: "", title: "", note: "" }){
  return `
    <div class="history-row">
      <input type="text" class="h-year" placeholder="2026年4月" value="${escapeHTML(item.year)}">
      <input type="text" class="h-title" placeholder="〇〇大学 入学" value="${escapeHTML(item.title)}">
      <input type="text" class="h-note" placeholder="補足（任意）" value="${escapeHTML(item.note || "")}">
      <button type="button" class="h-remove" aria-label="この項目を削除">✕</button>
    </div>`;
}

function renderHistoryRows(history){
  const wrap = document.getElementById("history-rows");
  wrap.innerHTML = (history.length ? history : [{year:"",title:"",note:""}]).map(historyRowHTML).join("");
  wrap.querySelectorAll(".h-remove").forEach(btn => {
    btn.addEventListener("click", () => btn.closest(".history-row").remove());
  });
}

async function loadProfileIntoForm(){
  try{
    const file = await ghGetFile("data/profile.json");
    const profile = file ? JSON.parse(file.content) : { name: "", tagline: "", bio: "", history: [], links: {} };
    document.getElementById("profile-name").value = profile.name || "";
    document.getElementById("profile-tagline").value = profile.tagline || "";
    document.getElementById("bio-editor").innerHTML = profile.bio || "";
    renderHistoryRows(profile.history || []);
  }catch(e){
    showStatus(`プロフィールの読み込みに失敗しました: ${e.message}`, "err");
  }
}

async function saveProfile(){
  try{
    showStatus("保存中…", "busy");
    const history = Array.from(document.querySelectorAll("#history-rows .history-row")).map(row => ({
      year: row.querySelector(".h-year").value.trim(),
      title: row.querySelector(".h-title").value.trim(),
      note: row.querySelector(".h-note").value.trim(),
    })).filter(h => h.year || h.title);

    const existing = await ghGetFile("data/profile.json");
    const prevLinks = existing ? (JSON.parse(existing.content).links || {}) : {};

    const profile = {
      name: document.getElementById("profile-name").value.trim(),
      tagline: document.getElementById("profile-tagline").value.trim(),
      bio: document.getElementById("bio-editor").innerHTML,
      history,
      links: prevLinks,
    };
    await ghPutTextFile("data/profile.json", JSON.stringify(profile, null, 2), "profile: update");
    showStatus("プロフィールを保存しました。", "ok");
  }catch(e){
    showStatus(`保存に失敗しました: ${e.message}`, "err");
  }
}

/* ---------------------------------------------------------------------- */
/* GitHub連携設定                                                          */
/* ---------------------------------------------------------------------- */

function loadSettingsIntoForm(){
  const cfg = ghGetConfig();
  if(!cfg) return;
  document.getElementById("gh-owner").value = cfg.owner || "";
  document.getElementById("gh-repo").value = cfg.repo || "";
  document.getElementById("gh-branch").value = cfg.branch || "main";
  document.getElementById("gh-token").value = cfg.token || "";
}

function saveSettings(){
  const cfg = {
    owner: document.getElementById("gh-owner").value.trim(),
    repo: document.getElementById("gh-repo").value.trim(),
    branch: document.getElementById("gh-branch").value.trim() || "main",
    token: document.getElementById("gh-token").value.trim(),
  };
  if(!cfg.owner || !cfg.repo || !cfg.token){
    showStatus("ユーザー名・リポジトリ名・トークンをすべて入力してください。", "err");
    return;
  }
  ghSetConfig(cfg);
  showStatus("設定を保存しました。", "ok");
  refreshPostList();
}

async function testConnection(){
  saveSettings();
  try{
    showStatus("接続を確認中…", "busy");
    const repo = await ghTestConnection();
    showStatus(`接続に成功しました：${repo.full_name}`, "ok");
  }catch(e){
    showStatus(e.message, "err");
  }
}

/* ---------------------------------------------------------------------- */
/* 初期化                                                                  */
/* ---------------------------------------------------------------------- */

function initAdminApp(){
  initTabs();
  initEditorToolbars();
  clearPostForm();
  loadSettingsIntoForm();

  document.getElementById("publish-btn").addEventListener("click", publishPost);
  document.getElementById("new-post-btn").addEventListener("click", clearPostForm);
  document.getElementById("save-profile-btn").addEventListener("click", saveProfile);
  document.getElementById("save-settings-btn").addEventListener("click", saveSettings);
  document.getElementById("test-connection-btn").addEventListener("click", testConnection);
  document.getElementById("add-history-row").addEventListener("click", () => {
    document.getElementById("history-rows").insertAdjacentHTML("beforeend", historyRowHTML());
    document.querySelectorAll("#history-rows .history-row .h-remove").forEach(btn => {
      btn.onclick = () => btn.closest(".history-row").remove();
    });
  });

  const cfg = ghGetConfig();
  if(cfg && cfg.token){
    refreshPostList();
    loadProfileIntoForm();
  }else{
    showStatus("まずは「GitHub連携設定」タブでリポジトリとトークンを設定してください。", "err");
  }
}

document.addEventListener("DOMContentLoaded", initGate);
