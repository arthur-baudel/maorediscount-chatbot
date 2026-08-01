// widget.js — Bulle de chat MaoréDiscount (refonte visuelle v2)
// Intégration : <script src="https://maorediscount-api.vercel.app/widget.js"></script>
(function () {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWidget);
  } else {
    mountWidget();
  }

  function mountWidget() {
    const API_URL = "https://maorediscount-api.vercel.app/api/chat";

    // ---------- Palette ----------
    const BRAND = "#16407A";       // bleu profond, plus distinctif que le bleu générique
    const BRAND_DARK = "#0F2E58";
    const ACCENT = "#FF6B4A";      // corail — CTA, envoi, accents ponctuels
    const ACCENT_SOFT = "#FFEDE8";
    const CHIP_SOFT = "#EAF1FA";   // fond des boutons rapides

    let history = [];
    let isOpen = false;
    let isLoading = false;

    const MAIN_MENU = [
      { label: "Voir nos produits", emoji: "🛍️", message: "Qu'est-ce que vous vendez ?" },
      { label: "Livraison & Commande", emoji: "📦", message: "Quels sont vos modes de livraison ?" },
      { label: "Paiement", emoji: "💳", message: "Quels sont vos moyens de paiement ?" },
      { label: "Promotions du moment", emoji: "💰", message: "Quelles sont les promotions en cours ?" },
    ];
    const MENU_BUTTON = { label: "Menu principal", emoji: "🏠", message: "__MENU__" };

    // ---------- Styles ----------
    const style = document.createElement("style");
    style.textContent = `
      #md-chat-bubble {
        position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px;
        border-radius: 50%; background: linear-gradient(135deg, ${BRAND}, ${BRAND_DARK});
        color: #fff; border: none; cursor: pointer;
        box-shadow: 0 6px 18px rgba(15, 46, 88, 0.35); z-index: 999999;
        display: flex; align-items: center; justify-content: center; font-size: 26px;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      #md-chat-bubble:hover { transform: scale(1.06); box-shadow: 0 8px 22px rgba(15, 46, 88, 0.42); }
      #md-chat-window {
        position: fixed; bottom: 92px; right: 20px; width: 372px; max-width: 92vw;
        height: 580px; max-height: 80vh; background: #fff; border-radius: 18px;
        box-shadow: 0 16px 44px rgba(15, 30, 50, 0.22); z-index: 999999; display: none;
        flex-direction: column; overflow: hidden; font-family: -apple-system, "Segoe UI", Arial, sans-serif;
      }
      #md-chat-window.open { display: flex; }
      #md-chat-header {
        background: linear-gradient(135deg, ${BRAND}, ${BRAND_DARK});
        color: #fff; padding: 18px 20px; font-weight: 700; font-size: 16.5px;
        display: flex; justify-content: space-between; align-items: center;
        letter-spacing: 0.1px;
      }
      #md-chat-header-actions { display: flex; align-items: center; gap: 16px; }
      #md-chat-header-actions button {
        background: rgba(255,255,255,0.14); border: none; color: #fff; cursor: pointer;
        font-size: 15px; line-height: 1; padding: 6px; border-radius: 8px;
        width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
        transition: background 0.15s ease;
      }
      #md-chat-header-actions button:hover { background: rgba(255,255,255,0.26); }
      #md-chat-subheader {
        background: #F4F8FC; color: ${BRAND_DARK}; font-size: 12.5px;
        padding: 8px 20px; font-weight: 600; letter-spacing: 0.15px;
        border-bottom: 1px solid #E7EDF4;
      }
      #md-chat-messages {
        flex: 1; overflow-y: auto; padding: 16px; background: #FAFBFD;
        display: flex; flex-direction: column;
      }
      .md-msg { margin-bottom: 12px; display: flex; }
      .md-msg.user { justify-content: flex-end; }
      .md-bubble {
        max-width: 84%; padding: 11px 14px; border-radius: 15px; font-size: 14px;
        line-height: 1.5; white-space: pre-wrap; word-wrap: break-word;
      }
      .md-msg.user .md-bubble {
        background: linear-gradient(135deg, ${BRAND}, ${BRAND_DARK}); color: #fff;
        border-bottom-right-radius: 4px; box-shadow: 0 2px 6px rgba(15,46,88,0.18);
      }
      .md-msg.bot .md-bubble {
        background: #fff; color: #1D2733; border: 1px solid #E7EBF0;
        border-bottom-left-radius: 4px; box-shadow: 0 1px 3px rgba(20,30,45,0.05);
      }
      .md-bubble img { max-width: 100%; border-radius: 10px; margin: 8px 0; display: block; }
      .md-bubble a { color: ${ACCENT}; font-weight: 700; text-decoration: none; }
      .md-bubble a:hover { text-decoration: underline; }

      /* Boutons rapides — intégrés au flux des messages, plus de bloc séparé */
      .md-qr-group {
        display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 14px 0;
      }
      .md-qr-btn {
        display: flex; align-items: center; gap: 8px;
        background: ${CHIP_SOFT}; border: none; color: ${BRAND_DARK};
        border-radius: 12px; padding: 8px 12px 8px 8px; font-size: 13px; font-weight: 600;
        cursor: pointer; white-space: nowrap; transition: background 0.15s ease, transform 0.1s ease;
      }
      .md-qr-btn:hover { background: #DCE9F8; transform: translateY(-1px); }
      .md-qr-icon {
        width: 24px; height: 24px; border-radius: 8px; background: #fff;
        display: flex; align-items: center; justify-content: center; font-size: 13px;
        flex-shrink: 0; box-shadow: 0 1px 2px rgba(15,46,88,0.12);
      }
      .md-qr-btn.md-qr-menu {
        background: ${ACCENT_SOFT}; color: #B8431F;
      }
      .md-qr-btn.md-qr-menu:hover { background: #FFDFD4; }
      .md-qr-btn.md-qr-menu .md-qr-icon { box-shadow: 0 1px 2px rgba(255,107,74,0.2); }

      #md-chat-inputrow { display: flex; border-top: 1px solid #EDF0F4; padding: 10px; background: #fff; gap: 8px; }
      #md-chat-input {
        flex: 1; border: 1.5px solid #E2E7ED; border-radius: 22px; padding: 10px 15px;
        font-size: 14px; outline: none; transition: border-color 0.15s ease;
      }
      #md-chat-input:focus { border-color: ${BRAND}; }
      #md-chat-send {
        background: linear-gradient(135deg, ${ACCENT}, #E85A3A); color: #fff; border: none;
        border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 16px;
        flex-shrink: 0; box-shadow: 0 3px 8px rgba(255,107,74,0.35);
        transition: transform 0.12s ease;
      }
      #md-chat-send:hover { transform: scale(1.05); }
      #md-chat-send:disabled { opacity: 0.5; cursor: default; transform: none; }
      .md-typing {
        font-size: 13px; color: #8A93A0; padding: 4px 4px 10px 4px; display: flex; align-items: center; gap: 6px;
      }
      .md-typing-dots { display: inline-flex; gap: 3px; }
      .md-typing-dots span {
        width: 5px; height: 5px; border-radius: 50%; background: ${ACCENT};
        animation: mdPulse 1.1s infinite ease-in-out;
      }
      .md-typing-dots span:nth-child(2) { animation-delay: 0.15s; }
      .md-typing-dots span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes mdPulse { 0%,100% { opacity:0.35; transform: scale(0.85); } 50% { opacity:1; transform: scale(1); } }
      #md-chat-footer {
        text-align: center; font-size: 10.5px; color: #A6AEB8; padding: 6px 0 10px 0;
        background: #fff; font-weight: 500; letter-spacing: 0.2px;
      }
      #md-chat-footer strong { color: #8A93A0; font-weight: 700; }
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
      <div id="md-chat-inputrow">
        <input id="md-chat-input" type="text" placeholder="Tapez votre message ici..." />
        <button id="md-chat-send">➤</button>
      </div>
      <div id="md-chat-footer">Powered by <strong>CLASSIC AI</strong></div>
    `;

    document.body.appendChild(bubble);
    document.body.appendChild(win);

    const messagesEl = win.querySelector("#md-chat-messages");
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
      showWelcome();
    }

    function showWelcome() {
      addBotMessage("Bonjour 👋 Comment puis-je vous aider aujourd'hui ?");
      showMenu();
    }

    function showMenu() {
      renderQuickReplies(MAIN_MENU, false);
    }

    // Les boutons rapides sont désormais insérés DANS le flux des messages
    // (comme un message à part entière), et non plus dans un bloc séparé
    // sous les messages — ça évite l'espace vide qui apparaissait quand le
    // contenu des messages était court.
    function renderQuickReplies(items, includeMenuButton) {
      removeExistingQuickReplies();
      const group = document.createElement("div");
      group.className = "md-qr-group";
      group.dataset.qrGroup = "true";

      items.forEach((item) => {
        const btn = document.createElement("button");
        btn.className = "md-qr-btn";
        btn.innerHTML = `<span class="md-qr-icon">${item.emoji}</span>${item.label}`;
        btn.addEventListener("click", () => handleQuickReply(item));
        group.appendChild(btn);
      });
      if (includeMenuButton) {
        const menuBtn = document.createElement("button");
        menuBtn.className = "md-qr-btn md-qr-menu";
        menuBtn.innerHTML = `<span class="md-qr-icon">${MENU_BUTTON.emoji}</span>${MENU_BUTTON.label}`;
        menuBtn.addEventListener("click", () => showMenu());
        group.appendChild(menuBtn);
      }
      messagesEl.appendChild(group);
      scrollToBottom();
    }

    function removeExistingQuickReplies() {
      messagesEl.querySelectorAll('[data-qr-group="true"]').forEach(el => el.remove());
    }

    function handleQuickReply(item) {
      removeExistingQuickReplies();
      addUserMessage(item.label);
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
      removeExistingQuickReplies();
      addUserMessage(text);
      runChat(text);
    }

    async function runChat(text) {
      setLoading(true);
      try {
        const resp = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
          typingEl.innerHTML = `En train d'écrire <span class="md-typing-dots"><span></span><span></span><span></span></span>`;
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
      const isProductList = /🛒/.test(text);
      const linkLabel = isProductList ? "Voir le produit" : "Voir plus";

      safe = safe.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, url) => {
        return `<img src="${url}" alt="${alt}" loading="lazy" />`;
      });
      safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
        return `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
      });
      safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      safe = safe.replace(
        /👉\s*(https?:\/\/[^\s<]+)/g,
        `👉 <a href="$1" target="_blank" rel="noopener">${linkLabel}</a>`
      );
      safe = safe.replace(
        /(^|[^"'>])(https?:\/\/[^\s<]+)/g,
        (m, prefix, url) => `${prefix}<a href="${url}" target="_blank" rel="noopener">${linkLabel}</a>`
      );
      return safe;
    }
  }
})();
