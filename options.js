// Mail to Claude — Options page

const DEFAULT_PROMPT = `Tu es un assistant qui m'aide à rédiger des réponses à mes emails professionnels.

Consignes :
- Réponds en français sauf si le fil est en anglais
- Adopte un ton professionnel mais chaleureux
- Sois concis et va droit au but
- Si le mail nécessite une action de ma part, propose une réponse qui confirme la prise en charge
- Si c'est une question, réponds-y directement
- Ne génère que le corps de la réponse (pas de "Objet:", pas de signature)`;

const promptEl = document.getElementById('prompt');
const saveBtn = document.getElementById('save');
const restoreBtn = document.getElementById('restore');
const statusEl = document.getElementById('status');

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status status-${type}`;
  statusEl.hidden = false;
  setTimeout(() => { statusEl.hidden = true; }, 2000);
}

// Load saved prompt
chrome.storage.sync.get({ prompt: DEFAULT_PROMPT }, (result) => {
  promptEl.value = result.prompt;
});

// Save
saveBtn.addEventListener('click', () => {
  chrome.storage.sync.set({ prompt: promptEl.value }, () => {
    showStatus('Sauvegardé !', 'success');
  });
});

// Restore default
restoreBtn.addEventListener('click', () => {
  promptEl.value = DEFAULT_PROMPT;
  chrome.storage.sync.set({ prompt: DEFAULT_PROMPT }, () => {
    showStatus('Prompt par défaut restauré', 'success');
  });
});

// Save with Ctrl+S / Cmd+S
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveBtn.click();
  }
});
