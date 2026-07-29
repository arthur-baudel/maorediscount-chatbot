// widget.js — Bulle de chat MaoréDiscount
// Intégration : <script src="https://maorediscount-api.vercel.app/widget.js"></script>
(function () {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWidget);
  } else {
    mountWidget();
  }

  function mountWidget() {
    const API_URL = "https://maorediscount-api.vercel.app/api/chat";
    const WIDGET_SECRET = "wgt_maorediscount_2026_xK9p";

    // Couleur de marque MaoréDiscount — ajuste ce hex si besoin pour matcher exactement ton logo.
    const BRAND_BLUE = "#1E73BE";
    const BRAND_BLUE_DARK = "#175A96";

    let history = [];
    let isOpen = false;
    let isLoading = false;

    // Menu principal façon Botmind : boutons de navigation rapide.
    const MAIN_MENU = [
      { label: "Voir nos produits", emoji: "🛍️", message: "Qu'est-ce que vous vendez ?" },
      { label: "Livraison & Commande", emoji: "📦", message: "Quels sont vos modes de livraison ?" },
      { label: "Paiement", emoji: "💳", message: "Quels sont vos moyens de paiement ?" },
      { label: "Retour & Remboursement", emoji: "🔄", message: "Comment fonctionne le retour d'un produit ?" },
      { label: "Montage & Installation", emoji: "🛠️", message: "Proposez-vous le montage et l'installation ?" },
      { label: "Carte MTUKUFU", emoji: "🎫", message: "Comment fonctionne la carte MTUKUFU ?" },
      { label: "Promotions du moment", emoji: "💰", message: "Quelles sont les promotions en cours ?" },
    ];
    const MENU_BUTTON = { label: "Menu principal", emoji: "🏠", message: "__MENU__" };

    // ---------- Styles ----------
    const style = document.createElement("style");
    style.textContent = `
      #md-chat-bubble {
        position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px;
        border-radius: 50%; background: ${BRAND_BLUE}; color: #fff; border: none;
        cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.25); z-index: 999999;
        display: flex; align-items: center; justify-content: center; font-size: 28px;
        transition: transform 0.2s ease;
      }
      #md-chat-bubble:hover { transform: scale(1.06); }
      #md-chat-window {
        position: fixed; bottom: 92px; right: 20px; width: 370px; max-width: 92vw;
        height: 560px; max-height: 78vh; background: #fff; border-radius: 16px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.25); z-index: 999999; display: none;
        flex-direction: column; overflow: hidden; font-family: Arial, Helvetica, sans-serif;
      }
      #md-chat-window.open { display: flex; }
      #md-chat-header {
        background: ${BRAND_BLUE}; color: #fff; padding: 16px 18px; font-weight: bold;
        font-size: 16px; display: flex; justify-content: space-between; align-items: center;
      }
      #md-chat-header-actions { display: flex; align-items: center; gap: 14px; }
      #md-chat-header-actions button {
        background: none; border: none; color: #fff; cursor: pointer;
        font-size: 17px; line-height: 1; padding: 2px;
      }
      #md-chat-subheader {
        background: #f0f6fb; color: ${BRAND_BLUE_DARK}; font-size: 12px;
        padding: 6px 18px; font-weight: 600; letter-spacing: 0.2px;
      }
      #md-chat-messages { flex: 1; overflow-y: auto; padding: 12px; background: #f7f8fa; }
      .md-msg { margin-bottom: 10px; display: flex; }
      .md-msg.user { justify-content: flex-end; }
      .md-bubble {
        max-width: 82%; padding: 10px 13px; border-radius: 14px; font-size: 14px;
        line-height: 1.45; white-space: pre-wrap; word-wrap: break-word;
      }
      .md-msg.user .md-bubble { background: ${BRAND_BLUE}; color: #fff; border-bottom-right-radius: 3px; }
      .md-msg.bot .md-bubble { background: #fff; color: #222; border: 1px solid #e2e6ea; border-bottom-left-radius: 3px; }
      .md-bubble img { max-width: 100%; border-radius: 8px; margin: 6px 0; display: block; }
      .md-bubble a { color: ${BRAND_BLUE}; font-weight: bold; text-decoration: none; }
      .md-bubble a:hover { text-decoration: underline; }
      #md-quick-replies {
        display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 12px 12px 12px; background: #f7f8fa;
      }
      .md-qr-btn {
        background: #fff; border: 1.5px solid ${BRAND_BLUE}; color: ${BRAND_BLUE_DARK};
        border-radius: 20px; padding: 8px 14px; font-size: 13px; cursor: pointer;
        white-space: nowrap; transition: background 0.15s ease, color 0.15s ease;
      }
      .md-qr-btn:hover { background: ${BRAND_BLUE}; color: #fff; }
      .md-qr-btn.md-qr-menu { border-style: dashed; }
      #md-chat-inputrow { display: flex; border-top: 1px solid #eee; padding: 8px; background: #fff; }
      #md-chat-input {
        flex: 1; border: 1px solid #ddd; border-radius: 20px; padding: 9px 14px;
        font-size: 14px; outline: none;
      }
      #md-chat-input:focus { border-color: ${BRAND_BLUE}; }
      #md-chat-send {
        background: ${BRAND_BLUE}; color: #fff; border: none; border-radius: 50%;
        width: 38px; height: 38px; margin-left: 8px; cursor: pointer; font-size: 16px;
      }
      #md-chat-send:disabled { opacity: 0.5; cursor: default; }
      .md-typing { font-size: 13px; color: #888; padding: 4px 12px; }
      #md-chat-footer {
        text-align: center; font-size: 11px; color: #aaa; padding: 4px 0 8px 0; background: #fff;
      }
    `;
    document.head.appendChild(style);

    // ---------- DOM ----------
    const bubble = document.createElement("button");
    bubble.id = "md-chat-bubble";
    bubble.innerHTML = "💬";
    bubble.setAttribute("aria-label", "Ouvrir le chat");

    const win = document.createElement("div");
    win.id = "md-chat-window";
    win.innerHTML = `
      <div id="md-chat-header">
        <span>Bienvenue</span>
        <div id="md-chat-header-actions">
          <button id="md-chat-reset" aria-label="Réinitialiser la conversation" title="Réinitialiser la conversation">↻</button>
          <button id="md-chat-home" aria-label="Menu principal" title="Menu principal">🏠</button>
          <button id="md-chat-close" aria-label="Fermer" title="Fermer">—</button>
        </div>
      </div>
      <div id="md-chat-subheader">Nous sommes à votre disposition 👋</div>
      <div id="md-chat-messages"></div>
      <div id="md-quick-replies"></div>
      <div id="md-chat-inputrow">
        <input id="md-chat-input" type="text" placeholder="Tapez votre message ici..." />
        <button id="md-chat-send">➤</button>
      </div>
      <div id="md-chat-footer">Powered by <strong>CLASSIC AI</strong></div>
    `;

    document.body.appendChild(bubble);
    document.body.appendChild(win);

    const messagesEl = win.querySelector("#md-chat-messages");
    const quickRepliesEl = win.querySelector("#md-quick-replies");
    const inputEl = win.querySelector("#md-chat-input");
    const sendBtn = win.querySelector("#md-chat-send");
    const closeBtn = win.querySelector("#md-chat-close");
    const homeBtn = win.querySelector("#md-chat-home");
    const resetBtn = win.querySelector("#md-chat-reset");

    // ---------- Ouverture / fermeture ----------
    bubble.addEventListener("click", () => {
      isOpen = !isOpen;
      win.classList.toggle("open", isOpen);
      if (isOpen && messagesEl.children.length === 0) {
        showWelcome();
      }
    });
    closeBtn.addEventListener("click", () => {
      isOpen = false;
      win.classList.remove("open");
    });
    homeBtn.addEventListener("click", () => {
      showMenu();
    });
    resetBtn.addEventListener("click", () => {
      resetConversation();
    });

    function resetConversation() {
      history = [];
      messagesEl.innerHTML = "";
      quickRepliesEl.innerHTML = "";
      showWelcome();
    }

    function showWelcome() {
      addBotMessage("Bonjour 👋 Comment puis-je vous aider aujourd'hui ?");
      showMenu();
    }

    function showMenu() {
      renderQuickReplies(MAIN_MENU, false);
    }

    function renderQuickReplies(items, includeMenuButton) {
      quickRepliesEl.innerHTML = "";
      items.forEach((item) => {
        const btn = document.createElement("button");
        btn.className = "md-qr-btn";
        btn.textContent = `${item.emoji} ${item.label}`;
        btn.addEventListener("click", () => handleQuickReply(item));
        quickRepliesEl.appendChild(btn);
      });
      if (includeMenuButton) {
        const menuBtn = document.createElement("button");
        menuBtn.className = "md-qr-btn md-qr-menu";
        menuBtn.textContent = `${MENU_BUTTON.emoji} ${MENU_BUTTON.label}`;
        menuBtn.addEventListener("click", () => showMenu());
        quickRepliesEl.appendChild(menuBtn);
      }
    }

    function handleQuickReply(item) {
      addUserMessage(item.label);
      quickRepliesEl.innerHTML = "";
      runChat(item.message);
    }

    // ---------- Envoi de message libre ----------
    sendBtn.addEventListener("click", sendMessage);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });

    function sendMessage() {
      const text = inputEl.value.trim();
      if (!text || isLoading) return;
      inputEl.value = "";
      quickRepliesEl.innerHTML = "";
      addUserMessage(text);
      runChat(text);
    }

  async function runChat(text) {
  setLoading(true);
  try {
   const resp = await fetch(API_URL, {
  method: "POST",
  headers: { 
    "Content-Type": "application/json",
    "x-widget-token": WIDGET_SECRET
  },
  body: JSON.stringify({ message: text, history }),
});
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "Erreur serveur");
        history = data.history || history;
        addBotMessage(data.reply || "Désolé, je n'ai pas de réponse à vous donner.");
      } catch (err) {
        addBotMessage("Une erreur est survenue, merci de réessayer dans un instant.");
        console.error("MD widget error:", err);
      } finally {
        setLoading(false);
        // Menu de navigation toujours accessible après chaque réponse.
        renderQuickReplies(MAIN_MENU.slice(0, 3), true);
      }
    }

    function setLoading(loading) {
      isLoading = loading;
      sendBtn.disabled = loading;
      let typingEl = messagesEl.querySelector(".md-typing");
      if (loading) {
        if (!typingEl) {
          typingEl = document.createElement("div");
          typingEl.className = "md-typing";
          typingEl.textContent = "En train d'écrire...";
          messagesEl.appendChild(typingEl);
          scrollToBottom();
        }
      } else if (typingEl) {
        typingEl.remove();
      }
    }

    function addUserMessage(text) {
      const row = document.createElement("div");
      row.className = "md-msg user";
      row.innerHTML = `<div class="md-bubble">${escapeHtml(text)}</div>`;
      messagesEl.appendChild(row);
      scrollToBottom();
    }

    function addBotMessage(text) {
      const row = document.createElement("div");
      row.className = "md-msg bot";
      const bubbleEl = document.createElement("div");
      bubbleEl.className = "md-bubble";
      bubbleEl.innerHTML = renderMarkdownLite(text);
      row.appendChild(bubbleEl);
      messagesEl.appendChild(row);
      scrollToBottom();
    }

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }

    function renderMarkdownLite(text) {
      let safe = escapeHtml(text);
      safe = safe.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, url) => {
        return `<img src="${url}" alt="${alt}" loading="lazy" />`;
      });
      safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
        return `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
      });
      safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      safe = safe.replace(
        /👉\s*(https?:\/\/[^\s<]+)/g,
        '👉 <a href="$1" target="_blank" rel="noopener">Voir plus</a>'
      );
      return safe;
    }
  }
})();
