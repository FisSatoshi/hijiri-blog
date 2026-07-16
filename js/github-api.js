/* ==========================================================================
   GitHub Contents API ヘルパー
   admin.html からブラウザ上で直接リポジトリのファイルを読み書きするための関数群。
   認証は個人アクセストークン（PAT）を使用し、ブラウザの localStorage にのみ保存する。
   トークンはこのサイトのコードには一切含まれず、サーバーにも送信されない
   （GitHub の API に直接アクセスするだけ）。
   ========================================================================== */

const GH_CONFIG_KEY = "hijiri_gh_config"; // { owner, repo, branch, token }

function ghGetConfig(){
  try{
    return JSON.parse(localStorage.getItem(GH_CONFIG_KEY) || "null");
  }catch(e){
    return null;
  }
}

function ghSetConfig(cfg){
  localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg));
}

function ghClearConfig(){
  localStorage.removeItem(GH_CONFIG_KEY);
}

function ghApiBase(cfg){
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents`;
}

/** 設定が保存されているか確認し、なければ分かりやすいエラーを投げる */
function ghRequireConfig(){
  const cfg = ghGetConfig();
  if(!cfg || !cfg.owner || !cfg.repo || !cfg.token){
    throw new Error("GitHubの接続設定が未入力です。「GitHub連携設定」タブでユーザー名・リポジトリ名・トークンを入力して保存してください。");
  }
  return cfg;
}

async function ghRequest(url, options = {}){
  const cfg = ghGetConfig();
  if(!cfg || !cfg.token) throw new Error("GitHubの接続設定がありません。設定タブでトークンを入力してください。");
  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `token ${cfg.token}`,
      "Accept": "application/vnd.github+json",
      ...(options.headers || {}),
    },
  });
  if(!res.ok){
    let detail = "";
    try{ detail = (await res.json()).message; }catch(e){ /* ignore */ }
    throw new Error(`GitHub APIエラー (${res.status}): ${detail || res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

/** UTF-8文字列 → Base64（日本語対応） */
function utf8ToBase64(str){
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

/** Base64 → UTF-8文字列 */
function base64ToUtf8(b64){
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** ファイルを取得（存在しない場合は null を返す） */
async function ghGetFile(path){
  const cfg = ghGetConfig();
  const url = `${ghApiBase(cfg)}/${path}?ref=${encodeURIComponent(cfg.branch || "main")}&_=${Date.now()}`;
  try{
    const data = await ghRequest(url);
    return { content: base64ToUtf8(data.content), sha: data.sha };
  }catch(e){
    if(String(e.message).includes("404")) return null;
    throw e;
  }
}

/** テキストファイルを作成/更新する */
async function ghPutTextFile(path, contentStr, message){
  const cfg = ghGetConfig();
  const existing = await ghGetFile(path);
  const body = {
    message,
    content: utf8ToBase64(contentStr),
    branch: cfg.branch || "main",
  };
  if(existing) body.sha = existing.sha;
  return ghRequest(`${ghApiBase(cfg)}/${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** バイナリファイル（画像・動画）を作成する。base64Data は data:URLのプレフィックスを含まない生のBase64 */
async function ghPutBinaryFile(path, base64Data, message){
  const cfg = ghGetConfig();
  const body = {
    message,
    content: base64Data,
    branch: cfg.branch || "main",
  };
  return ghRequest(`${ghApiBase(cfg)}/${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** 接続確認：リポジトリ情報を取得できるか試す */
async function ghTestConnection(){
  const cfg = ghGetConfig();
  if(!cfg) throw new Error("設定が未入力です");
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, {
    headers: { "Authorization": `token ${cfg.token}`, "Accept": "application/vnd.github+json" },
  });
  if(!res.ok) throw new Error(`接続に失敗しました (${res.status})。owner/repo/トークンを確認してください。`);
  return res.json();
}
