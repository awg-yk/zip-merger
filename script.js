(() => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const mergeBtn = document.getElementById('mergeBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusEl = document.getElementById('status');

  /** @type {File[]} */
  let zipFiles = [];

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function refreshList() {
    fileList.innerHTML = '';
    zipFiles.forEach((file, index) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = file.name;
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `${file.name} を削除`);
      removeBtn.addEventListener('click', () => {
        zipFiles.splice(index, 1);
        refreshList();
      });
      li.appendChild(name);
      li.appendChild(removeBtn);
      fileList.appendChild(li);
    });
    const hasFiles = zipFiles.length > 0;
    mergeBtn.disabled = !hasFiles;
    clearBtn.disabled = !hasFiles;
  }

  function addFiles(fileListLike) {
    const newZips = Array.from(fileListLike).filter((f) =>
      f.name.toLowerCase().endsWith('.zip')
    );
    zipFiles = zipFiles.concat(newZips);
    refreshList();
    setStatus('');
  }

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  });

  clearBtn.addEventListener('click', () => {
    zipFiles = [];
    refreshList();
    setStatus('');
  });

  mergeBtn.addEventListener('click', async () => {
    if (zipFiles.length === 0) return;
    mergeBtn.disabled = true;
    clearBtn.disabled = true;
    try {
      await flattenPdfsFromZips(zipFiles);
    } catch (err) {
      console.error(err);
      setStatus(`エラーが発生しました: ${err.message || err}`);
    } finally {
      mergeBtn.disabled = false;
      clearBtn.disabled = false;
    }
  });

  async function flattenPdfsFromZips(zips) {
    // すべてのZIPから、ZIPの区別なくPDFを1つのフォルダに集めたものとして扱い、
    // ファイル名順で並べた上で、個々のPDFファイルのまま1つのZIPにまとめる。
    const allPdfEntries = [];
    for (let i = 0; i < zips.length; i++) {
      const zipFile = zips[i];
      setStatus(`(${i + 1}/${zips.length}) ${zipFile.name} を展開中...`);
      const zip = await JSZip.loadAsync(zipFile);
      const pdfEntries = Object.values(zip.files).filter(
        (entry) => !entry.dir && entry.name.toLowerCase().endsWith('.pdf')
      );
      const baseName = (path) => path.split('/').pop();
      pdfEntries.forEach((entry) => {
        allPdfEntries.push({ zipName: zipFile.name, entry, name: baseName(entry.name) });
      });
    }

    if (allPdfEntries.length === 0) {
      setStatus('PDFファイルが見つかりませんでした。');
      return;
    }

    allPdfEntries.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    const outputZip = new JSZip();
    const usedNames = new Set();

    for (let i = 0; i < allPdfEntries.length; i++) {
      const { zipName, entry, name } = allPdfEntries[i];
      setStatus(`(${i + 1}/${allPdfEntries.length}) ${zipName} - ${entry.name} を格納中...`);
      const pdfBytes = await entry.async('uint8array');
      outputZip.file(uniqueName(name, usedNames), pdfBytes);
    }

    setStatus('ZIPファイルを作成しています...');
    const zipBytes = await outputZip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBytes);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'merged_pdfs.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus(`完了しました。${allPdfEntries.length} 個のPDFを1つのZIPにまとめました。`);
  }

  function uniqueName(name, usedNames) {
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
    const dot = name.lastIndexOf('.');
    const stem = dot === -1 ? name : name.slice(0, dot);
    const ext = dot === -1 ? '' : name.slice(dot);
    let n = 2;
    let candidate = `${stem}_${n}${ext}`;
    while (usedNames.has(candidate)) {
      n++;
      candidate = `${stem}_${n}${ext}`;
    }
    usedNames.add(candidate);
    return candidate;
  }

  refreshList();
})();
