// Mail to Claude — Content Script
// Injects a button into Gmail thread view that copies the email thread + prompt to clipboard.

const DEFAULT_PROMPT = `Tu es un assistant qui m'aide à rédiger des réponses à mes emails professionnels.

Consignes :
- Réponds en français sauf si le fil est en anglais
- Adopte un ton professionnel mais chaleureux
- Sois concis et va droit au but
- Si le mail nécessite une action de ma part, propose une réponse qui confirme la prise en charge
- Si c'est une question, réponds-y directement
- Ne génère que le corps de la réponse (pas de "Objet:", pas de signature)`;

const BUTTON_ID = 'mail-to-claude-btn';

// ─── Gmail DOM selectors ────────────────────────────────────────────

function getSubject() {
  // Primary: Gmail's known class
  const h2 = document.querySelector('h2.hP');
  if (h2) return h2.textContent.trim();

  // Fallback: first h2 in the main conversation area
  const mainArea = document.querySelector('div[role="main"]');
  if (mainArea) {
    const heading = mainArea.querySelector('h2');
    if (heading) return heading.textContent.trim();
  }

  return '(sujet non trouvé)';
}

function getMessageContainers() {
  // Primary: Gmail message containers
  let containers = document.querySelectorAll('.h7');
  if (containers.length) return containers;

  containers = document.querySelectorAll('.gs');
  if (containers.length) return containers;

  // Fallback: look for elements with data-message-id
  containers = document.querySelectorAll('[data-message-id]');
  if (containers.length) return containers;

  // Last resort: structural fallback — divs inside the thread that contain email-like content
  const mainArea = document.querySelector('div[role="main"]');
  if (!mainArea) return [];

  const candidates = mainArea.querySelectorAll('div[role="listitem"], div.kv');
  return candidates.length ? candidates : [];
}

function extractSender(container) {
  // span or element with email attribute
  const gd = container.querySelector('.gD[email]');
  if (gd) {
    const name = gd.textContent.trim();
    const email = gd.getAttribute('email');
    return name !== email ? `${name} <${email}>` : email;
  }

  const spanEmail = container.querySelector('span[email]');
  if (spanEmail) {
    const name = spanEmail.textContent.trim();
    const email = spanEmail.getAttribute('email');
    return name !== email ? `${name} <${email}>` : email;
  }

  return '(expéditeur inconnu)';
}

function extractDate(container) {
  // Gmail puts the date in a span with a title attribute containing full date
  const dateSpan = container.querySelector('.g3');
  if (dateSpan) {
    const titled = dateSpan.querySelector('span[title]');
    if (titled) return titled.getAttribute('title');
    return dateSpan.textContent.trim();
  }

  // Fallback: any span with title that looks like a date
  const spans = container.querySelectorAll('span[title]');
  for (const span of spans) {
    const title = span.getAttribute('title');
    if (title && /\d{1,2}\s\w+\s\d{4}|^\d{1,2}\/\d{1,2}\/\d{2,4}|^\w+ \d{1,2},\s?\d{4}/.test(title)) {
      return title;
    }
  }

  return '(date inconnue)';
}

function extractRecipients(container) {
  // Look for "to" field — usually in a span with class .g2 or within the header area
  const toContainer = container.querySelector('.g2');
  if (toContainer) {
    const spans = toContainer.querySelectorAll('span[email]');
    if (spans.length) {
      return Array.from(spans).map(s => {
        const name = s.textContent.trim();
        const email = s.getAttribute('email');
        return name !== email ? `${name} <${email}>` : email;
      }).join(', ');
    }
    return toContainer.textContent.replace(/^[àÀ]\s*:?\s*/i, '').trim();
  }

  return '';
}

function extractBody(container) {
  // Primary: Gmail message body
  const body = container.querySelector('.a3s.aiL');
  if (body) return cleanBody(body);

  // Fallback: largest text div
  const divs = container.querySelectorAll('div');
  let best = null;
  let bestLen = 0;
  for (const div of divs) {
    const text = div.innerText || '';
    if (text.length > bestLen && !div.querySelector('h2')) {
      bestLen = text.length;
      best = div;
    }
  }

  return best ? cleanBody(best) : '(contenu non trouvé)';
}

function cleanBody(element) {
  // Clone to avoid mutating the DOM
  const clone = element.cloneNode(true);

  // Remove quoted content
  clone.querySelectorAll('.gmail_quote').forEach(el => el.remove());

  // Remove signatures
  clone.querySelectorAll('.gmail_signature').forEach(el => el.remove());

  let text = clone.innerText || '';

  // Remove lines starting with > (quoted)
  text = text.split('\n').filter(line => !line.trimStart().startsWith('>')).join('\n');

  // Remove signature delimiter and everything after
  const sigIndex = text.indexOf('\n-- \n');
  if (sigIndex !== -1) {
    text = text.substring(0, sigIndex);
  }

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

// ─── Thread extraction ──────────────────────────────────────────────

function extractThread() {
  const subject = getSubject();
  const containers = getMessageContainers();

  const messages = [];
  for (const container of containers) {
    messages.push({
      from: extractSender(container),
      date: extractDate(container),
      to: extractRecipients(container),
      body: extractBody(container),
    });
  }

  return { subject, messages };
}

// ─── Clipboard builder ──────────────────────────────────────────────

function buildClipboardContent(prompt, thread) {
  let output = prompt + '\n\n---\n\n## Fil d\'email\n\n';
  output += `**Sujet** : ${thread.subject}\n\n`;

  thread.messages.forEach((msg, i) => {
    output += `### Message ${i + 1}\n`;
    output += `**De** : ${msg.from}\n`;
    output += `**Date** : ${msg.date}\n`;
    if (msg.to) {
      output += `**À** : ${msg.to}\n`;
    }
    output += `\n${msg.body}\n\n`;
  });

  return output.trim();
}

// ─── Button injection ───────────────────────────────────────────────

function createButton() {
  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.className = 'mail-to-claude-btn';
  btn.innerHTML = `
    <svg class="mtc-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
    <span class="mtc-label">Claude</span>
  `;
  btn.addEventListener('click', handleClick);
  return btn;
}

async function handleClick() {
  const btn = document.getElementById(BUTTON_ID);
  if (!btn || btn.classList.contains('mtc-loading')) return;

  btn.classList.add('mtc-loading');
  btn.querySelector('.mtc-label').textContent = '...';

  try {
    // Get the user's prompt from storage
    const prompt = await new Promise((resolve) => {
      chrome.storage.sync.get({ prompt: DEFAULT_PROMPT }, (result) => {
        resolve(result.prompt);
      });
    });

    const thread = extractThread();

    if (thread.messages.length === 0) {
      throw new Error('Aucun message trouvé');
    }

    const content = buildClipboardContent(prompt, thread);
    await navigator.clipboard.writeText(content);

    // Success feedback
    btn.classList.remove('mtc-loading');
    btn.classList.add('mtc-success');
    btn.querySelector('.mtc-label').textContent = 'Copié !';

    setTimeout(() => {
      btn.classList.remove('mtc-success');
      btn.querySelector('.mtc-label').textContent = 'Claude';
    }, 2000);
  } catch (err) {
    console.error('Mail to Claude:', err);
    btn.classList.remove('mtc-loading');
    btn.classList.add('mtc-error');
    btn.querySelector('.mtc-label').textContent = 'Erreur';

    setTimeout(() => {
      btn.classList.remove('mtc-error');
      btn.querySelector('.mtc-label').textContent = 'Claude';
    }, 2000);
  }
}

function injectButton() {
  // Already injected?
  if (document.getElementById(BUTTON_ID)) return;

  // Are we in a thread view?
  if (!document.querySelector('h2.hP') && !document.querySelector('div[role="main"] h2')) return;

  const btn = createButton();

  // Try to inject in Gmail's toolbar
  const toolbar = document.querySelector('.ade');
  if (toolbar) {
    toolbar.appendChild(btn);
    return;
  }

  // Fallback: look for the action bar above messages
  const actionBar = document.querySelector('.iH > div');
  if (actionBar) {
    actionBar.appendChild(btn);
    return;
  }

  // Last fallback: floating button
  btn.classList.add('mtc-floating');
  document.body.appendChild(btn);
}

function removeButton() {
  const btn = document.getElementById(BUTTON_ID);
  if (btn) btn.remove();
}

// ─── Observer ───────────────────────────────────────────────────────

function isThreadView() {
  return !!(document.querySelector('h2.hP') || document.querySelector('div[role="main"] h2'));
}

let wasThreadView = false;

function checkView() {
  const inThread = isThreadView();
  if (inThread && !wasThreadView) {
    // Small delay to let Gmail finish rendering
    setTimeout(injectButton, 300);
  } else if (!inThread && wasThreadView) {
    removeButton();
  }
  wasThreadView = inThread;
}

const observer = new MutationObserver(() => {
  checkView();
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial check
checkView();
