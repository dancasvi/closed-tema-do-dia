// script.js — Vanilla JS + Bootstrap 5
document.addEventListener('DOMContentLoaded', () => {
  const statusArea = document.getElementById('statusArea');
  const tbody = document.querySelector('#tabelaInscritos tbody');
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearch');

  const modalEl = document.getElementById('imagemModal');
  const modalLabel = document.getElementById('imagemModalLabel');
  const modalSpinner = document.getElementById('modalSpinner');
  const modalImage = document.getElementById('modalImage');
  const modalError = document.getElementById('modalError');
  const modalLink = document.getElementById('modalLink');

  const bsModal = new bootstrap.Modal(modalEl);

  let inscritos = [];
  let filtered = [];

  // seta data atual no input readonly se vazio (mantive para compatibilidade)
  (function setTodayIfEmpty(){
    const input = document.getElementById('eventoData');
    if (!input.value) {
      const hoje = new Date();
      const y = hoje.getFullYear();
      const m = String(hoje.getMonth()+1).padStart(2,'0');
      const d = String(hoje.getDate()).padStart(2,'0');
      input.value = `${y}-${m}-${d}`;
    }
  })();

  function escapeHtml(str){
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function showLoading(msg='Carregando inscritos...'){
    statusArea.innerHTML = `
      <div class="d-flex align-items-center text-muted small">
        <div class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></div>
        <div>${escapeHtml(msg)}</div>
      </div>
    `;
  }

  function showError(msg){
    statusArea.innerHTML = `<div class="text-danger small">${escapeHtml(msg)}</div>`;
  }

  function clearStatus(){ statusArea.textContent = ''; }

  function initials(name){
    return (name || '').split(/\s+/).filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('') || '?';
  }

  // sanitize: remove acentos, manter apenas [0-9A-Za-z], substituir por underscore, trim underscores, lower
  function sanitizeFilename(name) {
    if (!name) return '';
    const noAccents = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const replaced = noAccents.replace(/[^0-9A-Za-z]/g, '_');
    const collapsed = replaced.replace(/_+/g, '_').replace(/^_|_$/g, '');
    return collapsed.toLowerCase();
  }

  // tenta carregar uma imagem por lista de URLs (usa Image load/error)
  // retorna Promise<string|null> com a URL que carregou com sucesso (ou null)
  function findFirstWorkingImage(urls) {
    return new Promise(resolve => {
      let i = 0;
      function tryNext() {
        if (i >= urls.length) return resolve(null);
        const candidate = urls[i++];
        const img = new Image();
        img.onload = () => resolve(candidate);
        img.onerror = () => tryNext();
        // para evitar alguns caches agressivos em dev, podemos adicionar um pequeno cache-bust opcional
        img.src = candidate;
      }
      tryNext();
    });
  }

  // cria linha da tabela
  function createRow(item){
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'name-cell';
    const spanAvatar = document.createElement('span');
    spanAvatar.className = 'avatar';
    spanAvatar.textContent = initials(item.nome);
    const divName = document.createElement('div');
    divName.textContent = item.nome || '';
    tdName.appendChild(spanAvatar);
    tdName.appendChild(divName);

    const tdImg = document.createElement('td');
    tdImg.className = 'text-center';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm';
    const urlImagem = (item['url-imagem'] || '').trim();

    if (urlImagem) {
      // usa URL explícita do JSON (prioridade)
      btn.classList.add('btn-primary');
      btn.textContent = 'Ver imagem';
      btn.dataset.url = urlImagem;
      btn.dataset.nome = item.nome || '';
      btn.addEventListener('click', onViewImageClick);
    } else {
      // sem url — buscar na pasta imagens/<nome>/
      btn.classList.add('btn-primary');
      btn.textContent = 'Ver imagem';
      btn.dataset.nome = item.nome || '';
      btn.dataset.localLookup = '1';
      btn.addEventListener('click', onViewImageClick);
    }

    tdImg.appendChild(btn);
    tr.appendChild(tdName);
    tr.appendChild(tdImg);
    return tr;
  }

  function renderTable(list){
    tbody.innerHTML = '';
    if (!Array.isArray(list) || list.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="2" class="text-center text-muted small">Nenhum inscrito encontrado.</td>';
      tbody.appendChild(tr);
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(item => frag.appendChild(createRow(item)));
    tbody.appendChild(frag);
  }

  function applyFilter(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) filtered = inscritos.slice();
    else filtered = inscritos.filter(i => (i.nome || '').toLowerCase().includes(q));
    renderTable(filtered);
  }

  function debounce(fn, wait = 180) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // handler do botão "Ver imagem"
  async function onViewImageClick(e) {
    const btn = e.currentTarget;
    const nome = btn.dataset.nome || 'Imagem';
    const explicitUrl = btn.dataset.url; // pode ser undefined
    const needLocalLookup = btn.dataset.localLookup === '1';

    modalLabel.textContent = nome;
    modalError.classList.add('d-none');
    modalImage.classList.add('d-none');
    modalImage.src = '';
    modalLink.classList.add('d-none');
    modalLink.href = '#';
    modalSpinner.classList.remove('d-none');

    // função interna para mostrar URL no modal e configurar listeners
    function showUrlInModal(urlToShow) {
      modalImage.onload = () => {
        modalSpinner.classList.add('d-none');
        modalImage.classList.remove('d-none');
        modalLink.href = urlToShow;
        modalLink.classList.remove('d-none');
      };
      modalImage.onerror = () => {
        modalSpinner.classList.add('d-none');
        modalImage.classList.add('d-none');
        modalError.classList.remove('d-none');
        modalLink.classList.add('d-none');
      };
      // dispara carregamento
      modalImage.src = urlToShow;
    }

    // prioridade: explicitUrl do JSON
    if (explicitUrl) {
      showUrlInModal(explicitUrl);
      bsModal.show();
      return;
    }

    // caso contrário, monta lista de candidatos locais com base na nova regra:
    // imagens/<nome-sanitzado>/<nome-sanitzado>.<ext>
    const sanitized = sanitizeFilename(nome);
    const baseFolder = `imagens/${encodeURIComponent(sanitized)}`;
    const candidates = [`${baseFolder}/imagem1.png`];


    // tenta encontrar a primeira que carrega
    const found = await findFirstWorkingImage(candidates);
    if (found) {
      showUrlInModal(found);
    } else {
      // não encontrou — mostra mensagem de erro no modal
      modalSpinner.classList.add('d-none');
      modalImage.classList.add('d-none');
      modalError.classList.remove('d-none');
      modalError.textContent = 'Candidato não inscrito';
      modalLink.classList.add('d-none');
    }
    bsModal.show();
  }

  // carrega inscritos.json
  async function loadInscritos() {
    showLoading();
    try {
      const resp = await fetch('inscritos.json', { cache: 'no-store' });
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      if (!Array.isArray(data)) {
        showError('Formato do JSON inválido — esperado um array.');
        inscritos = [];
        renderTable(inscritos);
        return;
      }
      inscritos = data;
      filtered = inscritos.slice();
      clearStatus();
      renderTable(filtered);
    } catch (err) {
      const extra = (location.protocol === 'file:') ? ' (se estiver abrindo via file://, use servidor local ex: python -m http.server)' : '';
      showError('Não foi possível carregar inscritos — ' + String(err) + extra);
      inscritos = [];
      renderTable(inscritos);
    }
  }

  // eventos
  searchInput.addEventListener('input', debounce(e => applyFilter(e.target.value), 160));
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    applyFilter('');
    searchInput.focus();
  });

  // inicia
  loadInscritos();
});
