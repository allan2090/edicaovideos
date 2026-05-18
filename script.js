const videoFileInput = document.getElementById('videoFile');
const startInput = document.getElementById('startTime');
const endInput = document.getElementById('endTime');
const trimButton = document.getElementById('trimButton');
const mergeButton = document.getElementById('mergeButton');
const status = document.getElementById('status');
const fileList = document.getElementById('fileList');
const selectedFileInfo = document.getElementById('selectedFileInfo');
const videoPreview = document.getElementById('videoPreview');
const downloadLink = document.getElementById('downloadLink');
const userGreeting = document.getElementById('userGreeting');
const logoutButton = document.getElementById('logoutButton');
const adminPageLink = document.getElementById('adminPageLink');

async function loadUserProfile() {
  try {
    const response = await fetch('/api/profile');
    if (!response.ok) {
      window.location.href = '/login.html';
      return;
    }

    const user = await response.json();
    userGreeting.textContent = `Olá, ${user.name}`;
    if (user.role === 'admin') {
      adminPageLink.hidden = false;
    }
  } catch (error) {
    console.error(error);
    window.location.href = '/login.html';
  }
}

logoutButton.addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login.html';
  }
});

loadUserProfile();

let selectedFiles = [];
let fileMetadata = [];
let activeFileIndex = 0;
let activePreviewUrl = null;

function updateStatus(message) {
  status.textContent = message;
}

function enableControls({ trim = false, merge = false } = {}) {
  startInput.disabled = !trim;
  endInput.disabled = !trim;
  trimButton.disabled = !trim;
  mergeButton.disabled = !merge;
}

function cleanupPreviewUrl() {
  if (activePreviewUrl) {
    URL.revokeObjectURL(activePreviewUrl);
    activePreviewUrl = null;
  }
}

function renderFileList(files) {
  if (!files.length) {
    fileList.textContent = 'Nenhum arquivo selecionado.';
    return;
  }

  const items = files.map((file, index) => {
    const isActive = index === activeFileIndex ? ' selected' : '';
    const duration = fileMetadata[index]?.duration ? ` <span class="file-duration">${fileMetadata[index].duration.toFixed(2)}s</span>` : '';
    return `<li class="file-list-item${isActive}"><button type="button" class="file-select-btn" data-index="${index}">${file.name}</button>${duration}</li>`;
  }).join('');

  fileList.innerHTML = `<p>${files.length} arquivos selecionados:</p><ol>${items}</ol>`;
  fileList.querySelectorAll('.file-select-btn').forEach(button => {
    button.addEventListener('click', () => setActiveFile(Number(button.dataset.index)));
  });
}

function updateSelectedFileInfo() {
  if (!selectedFiles.length) {
    selectedFileInfo.textContent = '';
    return;
  }

  const meta = fileMetadata[activeFileIndex] || { duration: 0 };
  selectedFileInfo.innerHTML = `<strong>Arquivo ativo:</strong> ${selectedFiles[activeFileIndex].name}${meta.duration ? ` (${meta.duration.toFixed(2)} s)` : ''}`;
}

function getVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.muted = true;
    tempVideo.src = URL.createObjectURL(file);

    tempVideo.onloadedmetadata = () => {
      const duration = tempVideo.duration;
      URL.revokeObjectURL(tempVideo.src);
      resolve({ duration });
    };

    tempVideo.onerror = () => {
      URL.revokeObjectURL(tempVideo.src);
      reject(new Error(`Não foi possível carregar metadados de ${file.name}`));
    };
  });
}

async function loadMetadataForFiles(files) {
  const metadata = [];

  for (const file of files) {
    try {
      metadata.push(await getVideoMetadata(file));
    } catch (error) {
      console.warn(error);
      metadata.push({ duration: 0 });
    }
  }

  return metadata;
}

async function setActiveFile(index) {
  activeFileIndex = index;
  const file = selectedFiles[activeFileIndex];
  const meta = fileMetadata[activeFileIndex] || { duration: 0 };

  cleanupPreviewUrl();
  activePreviewUrl = URL.createObjectURL(file);
  videoPreview.src = activePreviewUrl;
  videoPreview.load();

  if (meta.duration > 0) {
    startInput.value = 0;
    endInput.value = Number(meta.duration.toFixed(2));
    startInput.max = endInput.value;
    endInput.max = endInput.value;
    enableControls({ trim: true, merge: selectedFiles.length > 1 });
    updateStatus(`Arquivo ativo: ${file.name} (${meta.duration.toFixed(2)} seg).`);
  } else {
    enableControls({ trim: false, merge: selectedFiles.length > 1 });
    updateStatus(`Arquivo ativo: ${file.name}. Metadados não disponíveis.`);
  }

  updateSelectedFileInfo();
  renderFileList(selectedFiles);
}

function isSupportedVideoFormat(file) {
  const supportedMimeTypes = ['video/mp4', 'video/mpeg', 'video/quicktime'];
  const supportedExtensions = ['.mp4', '.m4v', '.mpeg', '.mpg'];
  const name = file.name.toLowerCase();
  return supportedMimeTypes.includes(file.type) || supportedExtensions.some(ext => name.endsWith(ext));
}

videoFileInput.addEventListener('change', async () => {
  selectedFiles = Array.from(videoFileInput.files || []).filter(isSupportedVideoFormat);
  fileMetadata = [];
  activeFileIndex = 0;
  renderFileList(selectedFiles);
  selectedFileInfo.textContent = '';
  downloadLink.hidden = true;
  cleanupPreviewUrl();

  if (!selectedFiles.length) {
    updateStatus('Selecione pelo menos um vídeo MPEG-4 válido.');
    enableControls({ trim: false, merge: false });
    return;
  }

  updateStatus('Carregando metadados dos arquivos...');
  fileMetadata = await loadMetadataForFiles(selectedFiles);
  await setActiveFile(0);

  if (selectedFiles.length === 1) {
    updateStatus('Arquivo carregado. Ajuste o tempo para recortar.');
  } else {
    updateStatus(`${selectedFiles.length} vídeos carregados. Selecione o arquivo ativo para editar ou clique em "Juntar vídeos".`);
  }
});

startInput.addEventListener('input', () => {
  const start = Number(startInput.value);
  if (start >= Number(endInput.value)) {
    startInput.value = Math.max(0, Number(endInput.value) - 0.1);
  }
});

endInput.addEventListener('input', () => {
  const end = Number(endInput.value);
  if (end <= Number(startInput.value)) {
    endInput.value = Math.min(Number(videoPreview.duration || 0), Number(startInput.value) + 0.1);
  }
});

async function fetchApiFile(route, formData, defaultFilename) {
  const response = await fetch(route, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Erro no servidor durante a requisição.');
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const matches = /filename="?([^";]*)"?/.exec(disposition);
  const filename = matches ? matches[1] : defaultFilename;
  return { blob, filename };
}

function setDownloadLink(blob, filename, label) {
  const url = URL.createObjectURL(blob);
  downloadLink.href = url;
  downloadLink.download = filename;
  downloadLink.hidden = false;
  downloadLink.textContent = label;
}

trimButton.addEventListener('click', async () => {
  if (!selectedFiles.length) {
    updateStatus('Nenhum arquivo carregado.');
    return;
  }

  const file = selectedFiles[activeFileIndex];
  const start = Number(startInput.value);
  const end = Number(endInput.value);

  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    updateStatus('Intervalo inválido. Ajuste início e fim corretamente.');
    return;
  }

  updateStatus('Recortando vídeo no servidor...');
  trimButton.disabled = true;
  mergeButton.disabled = true;

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('start', start.toString());
    formData.append('end', end.toString());

    const { blob, filename } = await fetchApiFile('/api/trim', formData, `video-recortado-${Date.now()}.mp4`);
    setDownloadLink(blob, filename, 'Baixar vídeo recortado');

    cleanupPreviewUrl();
    activePreviewUrl = URL.createObjectURL(blob);
    videoPreview.src = activePreviewUrl;
    videoPreview.load();
    updateStatus('Recorte concluído.');
  } catch (error) {
    console.error(error);
    updateStatus(error.message || 'Erro ao recortar o vídeo.');
  } finally {
    trimButton.disabled = false;
    mergeButton.disabled = selectedFiles.length > 1 ? false : true;
  }
});

mergeButton.addEventListener('click', async () => {
  if (selectedFiles.length < 2) {
    updateStatus('Selecione pelo menos dois vídeos para juntar.');
    return;
  }

  updateStatus('Juntando vídeos no servidor...');
  mergeButton.disabled = true;
  trimButton.disabled = true;

  try {
    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('files', file));

    const { blob, filename } = await fetchApiFile('/api/merge', formData, `video-juntado-${Date.now()}.mp4`);
    setDownloadLink(blob, filename, 'Baixar filme MP4');

    cleanupPreviewUrl();
    activePreviewUrl = URL.createObjectURL(blob);
    videoPreview.src = activePreviewUrl;
    videoPreview.load();
    updateStatus('Junção concluída.');
  } catch (error) {
    console.error(error);
    updateStatus(error.message || 'Erro ao juntar os vídeos.');
  } finally {
    mergeButton.disabled = false;
    trimButton.disabled = selectedFiles.length === 1 ? false : true;
  }
});

