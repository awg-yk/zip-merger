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
      await mergePdfsFromZips(zipFiles);
    } catch (err) {
      console.error(err);
      setStatus(`エラーが発生しました: ${err.message || err}`);
    } finally {
      mergeBtn.disabled = false;
      clearBtn.disabled = false;
    }
  });

  async function mergePdfsFromZips(zips) {
    const { PDFDocument } = PDFLib;
    const mergedPdf = await PDFDocument.create();

    // すべてのZIPから、ZIPの区別なくPDFを1つのフォルダに集めたものとして扱い、
    // ファイル名順（同名の場合は元のファイル名で二次ソート）で結合する。
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

    allPdfEntries.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    let pdfCount = 0;
    for (const { zipName, entry } of allPdfEntries) {
      setStatus(`(${pdfCount + 1}/${allPdfEntries.length}) ${zipName} - ${entry.name} を結合中...`);
      const pdfBytes = await entry.async('uint8array');
      let srcDoc;
      try {
        srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      } catch (err) {
        console.warn(`スキップ: ${entry.name} を読み込めませんでした`, err);
        continue;
      }
      const pageIndices = srcDoc.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(srcDoc, pageIndices);
      copiedPages.forEach((page) => mergedPdf.addPage(page));
      pdfCount++;
    }

    if (pdfCount === 0) {
      setStatus('PDFファイルが見つかりませんでした。');
      return;
    }

    setStatus(`${pdfCount} 個のPDFを結合しています...`);
    const mergedBytes = await mergedPdf.save();
    const blob = new Blob([mergedBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'merged.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus(`完了しました。${pdfCount} 個のPDFを結合しました。`);
  }

  refreshList();
})();
