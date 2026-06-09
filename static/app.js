const columns = [
  "제조사",
  "품명",
  "규격",
  "신품/중고",
  "무자료가격",
  "계산서가격",
  "입고일자",
  "제조사 판매가",
  "재고수량",
];

const loginView = document.querySelector("#loginView");
const inventoryView = document.querySelector("#inventoryView");
const loginError = document.querySelector("#loginError");
const authHelp = document.querySelector("#authHelp");
const googleLoginButton = document.querySelector("#googleLoginButton");
const devEntryButton = document.querySelector("#devEntryButton");
const inventoryBody = document.querySelector("#inventoryBody");
const searchInput = document.querySelector("#searchInput");
const sourceText = document.querySelector("#sourceText");
const userText = document.querySelector("#userText");
const refreshButton = document.querySelector("#refreshButton");
const logoutButton = document.querySelector("#logoutButton");
const makerFilters = document.querySelector("#makerFilters");
const adminView = document.querySelector("#adminView");
const adminButton = document.querySelector("#adminButton");
const backButton = document.querySelector("#backButton");
const uploadForm = document.querySelector("#uploadForm");
const uploadStatus = document.querySelector("#uploadStatus");
const membersBody = document.querySelector("#membersBody");

let inventoryItems = [];
let selectedMaker = "전체";
let currentMember = null;
const priceColumns = new Set(["무자료가격", "계산서가격", "제조사 판매가"]);

async function apiFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (isDevMode()) {
    headers["X-Dev-Mode"] = "1";
  }

  const response = await fetch(url, {
    headers,
    credentials: "same-origin",
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "요청 실패" }));
    throw new Error(error.detail || "요청 실패");
  }
  return response.json();
}

function isDevMode() {
  return document.body.dataset.devMode === "1";
}

function showInventoryView() {
  loginView.hidden = true;
  loginView.style.display = "none";
  inventoryView.hidden = false;
  inventoryView.style.display = "block";
  adminView.hidden = true;
  adminView.style.display = "none";
  loginError.hidden = true;
}

function showLoginView() {
  inventoryView.hidden = true;
  inventoryView.style.display = "none";
  adminView.hidden = true;
  adminView.style.display = "none";
  loginView.hidden = false;
  loginView.style.display = "grid";
}

function showAdminView() {
  loginView.hidden = true;
  loginView.style.display = "none";
  inventoryView.hidden = true;
  inventoryView.style.display = "none";
  adminView.hidden = false;
  adminView.style.display = "block";
}

async function loadInventory(refresh = false) {
  const data = await apiFetch(`/api/inventory${refresh ? "?refresh=true" : ""}`);
  inventoryItems = data.items || [];
  sourceText.textContent = data.source === "google_sheets" ? " | Google Sheets 데이터" : " | 샘플 데이터";
  renderInventory(filterItems());
}

function renderInventory(items) {
  inventoryBody.innerHTML = "";

  if (items.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = columns.length;
    cell.textContent = "검색 결과가 없습니다.";
    row.appendChild(cell);
    inventoryBody.appendChild(row);
    return;
  }

  for (const item of items) {
    const row = document.createElement("tr");
    for (const column of columns) {
      const cell = document.createElement("td");
      cell.textContent = formatCellValue(column, item[column]);
      row.appendChild(cell);
    }
    inventoryBody.appendChild(row);
  }
}

function filterItems() {
  const query = searchInput.value;
  const trimmedQuery = query.trim();

  return inventoryItems.filter((item) => {
    if (!hasStock(item)) {
      return false;
    }
    if (selectedMaker !== "전체" && item["제조사"] !== selectedMaker) {
      return false;
    }
    return !trimmedQuery || matchesQuery(item, trimmedQuery);
  });
}

function matchesQuery(item, query) {
  const searchText = `${item["제조사"] || ""} ${item["품명"] || ""} ${item["규격"] || ""}`.toLowerCase();
  const orGroups = query.split(/\s+OR\s+/i);

  return orGroups.some((group) => {
    const andTerms = group.split(/\s+AND\s+/i).map((term) => term.trim()).filter(Boolean);
    if (andTerms.length === 0) {
      return false;
    }
    return andTerms.every((term) => searchText.includes(term.toLowerCase()));
  });
}

function hasStock(item) {
  return parseNumber(item["재고수량"]) > 0;
}

function formatCellValue(column, value) {
  if (!priceColumns.has(column)) {
    return value || "";
  }

  const number = parseNumber(value);
  if (Number.isNaN(number)) {
    return value || "";
  }
  return number.toLocaleString("ko-KR");
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") {
    return Number.NaN;
  }

  const number = Number(String(value).replaceAll(",", "").trim());
  return Number.isFinite(number) ? number : Number.NaN;
}

function applyMember(member) {
  currentMember = member;
  userText.textContent = `${member.name || member.email} (${member.role})`;
  adminButton.hidden = member.role !== "admin";
}

async function loadMembers() {
  const data = await apiFetch("/api/members");
  renderMembers(data.members || []);
}

function renderMembers(members) {
  membersBody.innerHTML = "";
  for (const member of members) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(member.email)}</td>
      <td>${escapeHtml(member.name || "")}</td>
      <td>
        <select data-email="${escapeHtml(member.email)}" data-field="role">
          <option value="viewer"${member.role === "viewer" ? " selected" : ""}>viewer</option>
          <option value="admin"${member.role === "admin" ? " selected" : ""}>admin</option>
        </select>
      </td>
      <td>
        <input type="checkbox" data-email="${escapeHtml(member.email)}" data-field="enabled"${member.enabled ? " checked" : ""} />
      </td>
    `;
    membersBody.appendChild(row);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

googleLoginButton.addEventListener("click", () => {
  window.location.href = "/auth/google/login";
});

searchInput.addEventListener("input", () => {
  renderInventory(filterItems());
});

makerFilters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-maker]");
  if (!button) {
    return;
  }

  selectedMaker = button.dataset.maker;
  makerFilters.querySelectorAll("button").forEach((filterButton) => {
    filterButton.classList.toggle("active", filterButton === button);
  });
  renderInventory(filterItems());
});

refreshButton.addEventListener("click", async () => {
  await loadInventory(true);
});

logoutButton.addEventListener("click", async () => {
  if (!isDevMode()) {
    await apiFetch("/api/logout", { method: "POST" });
  } else {
    window.location.href = "/";
    return;
  }
  inventoryItems = [];
  currentMember = null;
  searchInput.value = "";
  selectedMaker = "전체";
  makerFilters.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.maker === "전체");
  });
  showLoginView();
});

adminButton.addEventListener("click", async () => {
  showAdminView();
  await loadMembers();
});

backButton.addEventListener("click", () => {
  showInventoryView();
});

membersBody.addEventListener("change", async (event) => {
  const target = event.target;
  const email = target.dataset.email;
  if (!email) {
    return;
  }

  const row = target.closest("tr");
  const role = row.querySelector("[data-field='role']").value;
  const enabled = row.querySelector("[data-field='enabled']").checked;
  await apiFetch(`/api/members/${encodeURIComponent(email)}`, {
    method: "PATCH",
    body: JSON.stringify({ role, enabled }),
  });
  await loadMembers();
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  uploadStatus.textContent = "";

  const file = uploadForm.file.files[0];
  if (!file) {
    return;
  }

  const body = new FormData();
  body.append("file", file);
  try {
    const response = await fetch("/api/inventory/upload", {
      method: "POST",
      body,
      credentials: "same-origin",
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.detail || "업로드 실패");
    }
    uploadStatus.textContent = `${result.rows}개 행을 업로드했습니다.`;
    await loadInventory(true);
  } catch (error) {
    uploadStatus.textContent = error.message;
  }
});

async function initialize() {
  if (isDevMode()) {
    userText.textContent = "개발 모드";
    adminButton.hidden = true;
    showInventoryView();
    await loadInventory();
    return;
  }

  let config = { googleConfigured: false };
  try {
    config = await apiFetch("/api/auth/config");
  } catch {
    authHelp.textContent = "서버 연결을 확인하지 못했습니다. static/index.html 파일을 직접 열지 말고 http://127.0.0.1:8000 주소로 접속하세요.";
    devEntryButton.hidden = true;
    showLoginView();
    return;
  }

  if (config.googleConfigured) {
    authHelp.textContent = "오류가 나면 VS Code 미리보기가 아닌 Chrome 또는 Edge에서 http://127.0.0.1:8000 주소를 직접 여세요.";
    devEntryButton.hidden = true;
  } else {
    authHelp.textContent = "Google OAuth 환경변수가 없어 개발용 바로가기로 재고 검색 화면을 확인할 수 있습니다.";
    devEntryButton.hidden = false;
  }

  try {
    const data = await apiFetch("/api/me");
    applyMember(data.member);
    showInventoryView();
    await loadInventory();
  } catch {
    showLoginView();
  }
}

initialize();
