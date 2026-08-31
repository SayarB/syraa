import { renderMarkdown } from "./markdown.js";

const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const userIdEl = document.getElementById("user-id");
const subtitleEl = document.getElementById("subtitle");
const memoryMetaEl = document.getElementById("memory-meta");
const memoryItemsEl = document.getElementById("memory-items");
const refreshBtn = document.getElementById("refresh-memory");

/** @type {Array<{role: 'user' | 'assistant', content: string}>} */
let chatHistory = [];
let messageCounter = 0;
let sending = false;

function userId() {
  return userIdEl.value.trim() || "demo-user";
}

function appendMessage(role, content) {
  const el = document.createElement("div");
  el.className = `message ${role}`;

  if (role === "assistant") {
    el.classList.add("markdown-body");
    el.innerHTML = renderMarkdown(content);
  } else {
    el.textContent = content;
  }

  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function loadMemory() {
  const res = await fetch(`/api/memory?userId=${encodeURIComponent(userId())}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function patchItem(id, status) {
  await fetch(`/api/memory/items/${id}?userId=${encodeURIComponent(userId())}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  await refreshMemory();
}

function renderMemory({ memory, items }) {
  const pending = items.filter((item) => item.status === "pending").length;
  memoryMetaEl.textContent = `memory ${memory.id.slice(0, 8)}… · ${items.length} item(s)${pending ? ` · ${pending} pending` : ""}`;

  if (!items.length) {
    memoryItemsEl.innerHTML =
      '<p class="empty">Nothing saved yet. Chat naturally — the model drafts memory as you talk.</p>';
    return;
  }

  memoryItemsEl.innerHTML = "";
  for (const item of items) {
    const card = document.createElement("article");
    card.className = `memory-item${item.status === "pending" ? " pending" : ""}`;
    const actions =
      item.status === "pending"
        ? `<div class="memory-actions">
            <button type="button" class="confirm-btn" data-id="${item.id}">Remember</button>
            <button type="button" class="dismiss-btn" data-id="${item.id}">Dismiss</button>
          </div>`
        : `<button type="button" class="dismiss-btn" data-id="${item.id}">dismiss</button>`;

    card.innerHTML = `
      <div class="memory-item-top">
        <span class="badge ${item.status === "pending" ? "pending" : ""}">${item.type}${item.status === "pending" ? " · pending" : ""}</span>
        ${item.status !== "pending" ? actions : ""}
      </div>
      <p>${escapeHtml(item.text)}</p>
      ${item.why ? `<p class="why">${escapeHtml(item.why)}</p>` : ""}
      <time>${formatTime(item.createdAt)} · ${item.source}</time>
      ${item.status === "pending" ? actions : ""}
    `;
    memoryItemsEl.appendChild(card);
  }

  memoryItemsEl.querySelectorAll(".confirm-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await patchItem(btn.getAttribute("data-id"), "active");
    });
  });

  memoryItemsEl.querySelectorAll(".dismiss-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await patchItem(btn.getAttribute("data-id"), "dismissed");
    });
  });
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function refreshMemory() {
  try {
    const data = await loadMemory();
    renderMemory(data);
  } catch (err) {
    memoryMetaEl.textContent = "Could not load memory";
    memoryItemsEl.innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  }
}

async function loadConfig() {
  const res = await fetch("/api/config");
  if (!res.ok) return;
  const { chat } = await res.json();
  if (chat.configured) {
    subtitleEl.textContent = `Chat + Memory · ${chat.provider} · ${chat.model.split("/").pop()}`;
  } else {
    subtitleEl.textContent = "Set FIREWORKS_API_KEY in .env to enable chat";
    inputEl.disabled = true;
    sendBtn.disabled = true;
  }
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (sending) return;
  const message = inputEl.value.trim();
  if (!message) return;

  appendMessage("user", message);
  inputEl.value = "";
  sending = true;
  sendBtn.disabled = true;

  const messageId = `msg-${++messageCounter}`;
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId(),
        message,
        messageId,
        history: chatHistory,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      appendMessage("assistant", `Error: ${data.error ?? res.status}`);
      return;
    }

    appendMessage("assistant", data.content);
    chatHistory.push({ role: "user", content: message });
    chatHistory.push({ role: "assistant", content: data.content });

    if (data.memoryItems?.length) {
      await refreshMemory();
      const count = data.memoryItems.length;
      const pending = data.memoryItems.filter((item) => item.status === "pending").length;
      if (pending > 0) {
        appendMessage(
          "system",
          `Drafted ${count} memory item(s) — ${pending} waiting for confirmation →`,
        );
      } else {
        appendMessage("system", `Saved ${count} memory item(s) →`);
      }
    }
  } finally {
    sending = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
});

userIdEl.addEventListener("change", () => {
  chatHistory = [];
  messagesEl.innerHTML = "";
  appendMessage("system", `Switched to user “${userId()}”.`);
  refreshMemory();
});

refreshBtn.addEventListener("click", () => refreshMemory());

loadConfig();
appendMessage(
  "system",
  "Chat normally. Memory builds from conversation — confirm pending items on the right.",
);
refreshMemory();
