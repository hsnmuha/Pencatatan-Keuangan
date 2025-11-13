// --- KONSTANTA & INISIALISASI ---
const GOOGLE_SHEET_API_URL = 'https://api.sheetson.com/v2/sheets/Sheet1';
const SHEETSON_SPREADSHEET_ID = '18Tcu1doi7L00PbaY-AR5S2DqoPNh7d_1ULaOgRztqF4';
const SHEETSON_API_KEY = 'Zj95gut0S_LLdD-kxZklxk_edTvBGpQ5qT2UzAe8BGbgAPxjq7jYvtHDzZg';
const IMGBB_API = 'https://api.imgbb.com/1/upload?key=6f20b7c40f8089cbab2e1e64fa40eb57';

const KATEGORI = {
    "Pendapatan": ["Gaji", "Bonus", "Investasi", "Lain-lain"],
    "Pengeluaran": ["Makanan & Minuman", "Transportasi", "Cicilan & Utang", "Belanja", "Hiburan", "Tagihan", "Lain-lain"]
};

const MONTH_NAMES = [
    { value: 'all', label: 'Semua Bulan' }, { value: '01', label: 'Januari' }, { value: '02', label: 'Februari' },
    { value: '03', label: 'Maret' }, { value: '04', label: 'April' }, { value: '05', label: 'Mei' },
    { value: '06', label: 'Juni' }, { value: '07', label: 'Juli' }, { value: '08', label: 'Agustus' },
    { value: '09', label: 'September' }, { value: '10', label: 'Oktober' }, { value: '11', label: 'November' },
    { value: '12', label: 'Desember' }
];

let transactions = []; 
let currentFilteredList = []; 

// Elemen DOM
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const financialForm = document.getElementById('financialForm');
const categorySelect = document.getElementById('category');
const transactionListBody = document.getElementById('transactionList');
const filterYearSelect = document.getElementById('filterYear'); 
const filterMonthSelect = document.getElementById('filterMonth');
const searchBox = document.getElementById('searchBox');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const receiptInput = document.getElementById('receipt');

// --- FUNGSI UTILITIES ---

function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
}

function calculateSummaryData(listToRender) {
    let totalIncome = 0; let totalExpense = 0;
    listToRender.forEach(t => {
        const amount = Number(t.jumlah) || 0; 
        if (t.jenis === 'Pendapatan') { totalIncome += amount; } else { totalExpense += amount; }
    });
    return { totalIncome: totalIncome, totalExpense: totalExpense, netBalance: totalIncome - totalExpense };
}

function calculateAndRenderSummary(listToRender) {
    const summary = calculateSummaryData(listToRender);

    document.getElementById('totalIncome').textContent = formatRupiah(summary.totalIncome);
    document.getElementById('totalExpense').textContent = formatRupiah(summary.totalExpense);
    
    const netBalanceEl = document.getElementById('netBalance');
    netBalanceEl.textContent = formatRupiah(summary.netBalance);
    // Atur warna saldo bersih
    netBalanceEl.style.color = summary.netBalance >= 0 ? '#007bff' : '#dc3545';
}

// --- FUNGSI CLOUD (SHEETDB) ---

async function loadTransactionsFromCloud() {
    try {
        transactionListBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Memuat data dari Cloud...</td></tr>';
        
        const response = await fetch(GOOGLE_SHEET_API_URL, {
            headers: {
                'Authorization': `Bearer ${SHEETSON_API_KEY}`,
                'X-Spreadsheet-Id': SHEETSON_SPREADSHEET_ID
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        const rows = Array.isArray(data)
            ? data
            : (Array.isArray(data.results)
                ? data.results
                : (Array.isArray(data.data) ? data.data : []));
        if (Array.isArray(rows)) {
            return rows.map((t) => {
                const base = t && typeof t === 'object' ? t : {};
                const v = base.data || base.cells || base.row || base;
                const pick = (obj, field) => {
                    if (!obj || typeof obj !== 'object') return undefined;
                    if (field in obj) return obj[field];
                    const k = Object.keys(obj).find(key => key && key.trim().toLowerCase() === field.trim().toLowerCase());
                    return k ? obj[k] : undefined;
                };
                let gambarVal = pick(v, 'Gambar') || '';
                if (typeof gambarVal === 'string' && gambarVal.includes('HYPERLINK(')) {
                    const m = gambarVal.match(/HYPERLINK\(\s*"([^"]+)"/i);
                    if (m && m[1]) gambarVal = m[1];
                }
                const cleanGambar = typeof gambarVal === 'string' ? gambarVal.trim() : '';
                return {
                    id: pick(v, 'Timestamp'),
                    tanggal: pick(v, 'Tanggal'),
                    jenis: pick(v, 'Jenis'),
                    kategori: pick(v, 'Kategori'),
                    jumlah: parseFloat(String(pick(v, 'Jumlah')).replace(/[^0-9.]/g, '')) || 0,
                    deskripsi: pick(v, 'Deskripsi') || '',
                    gambar: cleanGambar
                };
            }).filter(t => t.id);
        }
        return [];

    } catch (error) {
        console.error("Gagal memuat transaksi dari Sheetson:", error);
        Swal.fire('Gagal Memuat!', 'Terjadi masalah saat memuat data dari cloud. Cek koneksi atau konfigurasi Sheetson Anda.', 'error');
        return [];
    }
}

async function saveTransactionToCloud(newTransaction) {
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SHEETSON_API_KEY}`,
            'X-Spreadsheet-Id': SHEETSON_SPREADSHEET_ID
        },
        body: JSON.stringify(newTransaction)
    };

    try {
        const response = await fetch(GOOGLE_SHEET_API_URL, options);
        if (!response.ok) throw new Error(response.statusText);
        return { success: true };
    } catch (error) {
        console.error("Gagal menyimpan transaksi ke Sheetson:", error);
        return { success: false, message: error.toString() };
    }
}

async function getRowIndexByTimestamp(id) {
    try {
        const res = await fetch(GOOGLE_SHEET_API_URL, {
            headers: {
                'Authorization': `Bearer ${SHEETSON_API_KEY}`,
                'X-Spreadsheet-Id': SHEETSON_SPREADSHEET_ID
            }
        });
        if (!res.ok) return null;
        const json = await res.json();
        const rows = Array.isArray(json)
            ? json
            : (Array.isArray(json.results)
                ? json.results
                : (Array.isArray(json.data) ? json.data : []));
        const match = rows.find(r => {
            const base = r && typeof r === 'object' ? r : {};
            const v = base.data || base.cells || base.row || base;
            return v.Timestamp === id;
        });
        if (!match) return null;
        return match.rowIndex || match._rowIndex || match.rowNumber || null;
    } catch {
        return null;
    }
}

async function updateTransactionImageInCloud(id, imageUrl) {
    const rowIndex = await getRowIndexByTimestamp(id);
    if (!rowIndex) return { success: false, message: 'Row tidak ditemukan' };
    const url = `${GOOGLE_SHEET_API_URL}/${rowIndex}`;
    const options = {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SHEETSON_API_KEY}`,
            'X-Spreadsheet-Id': SHEETSON_SPREADSHEET_ID
        },
        body: JSON.stringify({ Gambar: imageUrl })
    };
    try {
        const response = await fetch(url, options);
        if (!response.ok) return { success: false, message: response.statusText };
        return { success: true };
    } catch (e) {
        return { success: false, message: e.toString() };
    }
}

async function deleteTransactionFromCloud(id) {
    const rowIndex = await getRowIndexByTimestamp(id);
    if (!rowIndex) return { success: false, message: 'Row tidak ditemukan' };
    const url = `${GOOGLE_SHEET_API_URL}/${rowIndex}`;
    const options = {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${SHEETSON_API_KEY}`,
            'X-Spreadsheet-Id': SHEETSON_SPREADSHEET_ID
        }
    };
    try {
        const response = await fetch(url, options);
        if (!response.ok) return { success: false, message: `Gagal HTTP: ${response.status}` };
        return { success: true };
    } catch (error) { return { success: false, message: error.toString() }; }
}


// --- FUNGSI UTAMA (SUBMIT) ---
financialForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const date = document.getElementById('date').value;
    const type = document.querySelector('input[name="type"]:checked').value;
    const category = categorySelect.value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value;

    if (!category || !amount || amount <= 0) {
        Swal.fire('Gagal!', 'Mohon isi Kategori dan Jumlah uang dengan benar.', 'warning');
        return;
    }

    let imageUrl = '';
    if (receiptInput && receiptInput.files && receiptInput.files[0]) {
        const editedBase64 = await openImageEditor(receiptInput.files[0]);
        if (editedBase64) {
            const uploadRes = await uploadImageToImgbb(editedBase64);
            if (uploadRes.success) { imageUrl = uploadRes.url; } else {
                Swal.fire('Gagal Upload', uploadRes.message || 'Tidak dapat mengunggah struk.', 'error');
                return;
            }
        } else {
            const uploadRes = await handleImageUpload(receiptInput.files[0]);
            if (uploadRes.success) { imageUrl = uploadRes.url; } else {
                Swal.fire('Gagal Upload', uploadRes.message || 'Tidak dapat mengunggah struk.', 'error');
                return;
            }
        }
    }

    const newTransaction = {
        Timestamp: new Date().toISOString(), 
        Tanggal: date,
        Jenis: type,
        Kategori: category,
        Jumlah: amount,
        Deskripsi: description || '',
        Gambar: imageUrl || ''
    };
    
    const submitButton = financialForm.querySelector('button[type="submit"]');
    submitButton.textContent = 'Menyimpan...';
    submitButton.disabled = true;

    const result = await saveTransactionToCloud(newTransaction);
    
    submitButton.textContent = 'Simpan Transaksi';
    submitButton.disabled = false;

    if (result.success) {
        Swal.fire('Berhasil!', 'Transaksi berhasil disimpan ke cloud!', 'success');
        
        transactions = await loadTransactionsFromCloud(); 
        filterAndRenderTransactions(); 

        financialForm.reset();
        goToStep1(); 
    } else {
        Swal.fire('Gagal!', `Pesan error: ${result.message}`, 'error');
    }
});

// Logika Saat Tombol Hapus Diklik
window.deleteTransaction = async function(id) {
    const transactionToDelete = transactions.find(t => t.id === id);
    if (!transactionToDelete) { Swal.fire('Gagal!', "ID transaksi tidak ditemukan di daftar.", 'error'); return; }

    const confirmResult = await Swal.fire({
        title: 'Konfirmasi Hapus',
        text: `Yakin ingin menghapus transaksi "${transactionToDelete.kategori}" ini secara permanen?`,
        icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#dc3545', cancelButtonColor: '#6c757d', confirmButtonText: 'Ya, Hapus!'
    });

    if (confirmResult.isConfirmed) {
        const result = await deleteTransactionFromCloud(id);
        if (result.success) {
            Swal.fire('Terhapus!', 'Transaksi berhasil dihapus dari Cloud.', 'success');
            transactions = await loadTransactionsFromCloud();
            filterAndRenderTransactions();
        } else {
            Swal.fire('Gagal Hapus!', `Pesan error: ${result.message}`, 'error');
        }
    }
};


// --- FUNGSI RENDERING & FILTER ---

function populateYearFilter() {
    const currentYear = new Date().getFullYear();
    const futureYear = currentYear + 50;
    filterYearSelect.innerHTML = '';
    let allOption = document.createElement('option');
    allOption.value = 'all'; allOption.textContent = 'Semua Tahun'; filterYearSelect.appendChild(allOption);
    for (let year = currentYear; year <= futureYear; year++) {
        let option = document.createElement('option');
        option.value = year.toString(); option.textContent = year.toString(); filterYearSelect.appendChild(option);
    }
    filterYearSelect.value = currentYear.toString();
}

function populateMonthFilter() {
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    filterMonthSelect.innerHTML = '';
    MONTH_NAMES.forEach(month => {
        let option = document.createElement('option');
        option.value = month.value; option.textContent = month.label; filterMonthSelect.appendChild(option);
    });
    filterMonthSelect.value = currentMonth;
}

window.filterAndRenderTransactions = function() {
    const searchTerm = searchBox.value.toLowerCase().trim();
    const selectedYear = filterYearSelect.value;
    const selectedMonth = filterMonthSelect.value;
    let filteredList = transactions;

    if (searchTerm) {
        filteredList = filteredList.filter(t => (t.deskripsi && t.deskripsi.toLowerCase().includes(searchTerm)) || (t.kategori && t.kategori.toLowerCase().includes(searchTerm)));
    }
    if (selectedYear !== 'all') {
        filteredList = filteredList.filter(t => t.tanggal && t.tanggal.startsWith(selectedYear));
    }
    if (selectedMonth !== 'all') {
        if (selectedYear !== 'all') {
            const monthPrefix = `${selectedYear}-${selectedMonth}`; filteredList = filteredList.filter(t => t.tanggal && t.tanggal.startsWith(monthPrefix));
        } else {
            const monthSegment = `-${selectedMonth}-`; filteredList = filteredList.filter(t => t.tanggal && t.tanggal.includes(monthSegment));
        }
    }
    currentFilteredList = filteredList;
    renderTransactions(currentFilteredList);
}

function renderTransactions(listToRender) {
    transactionListBody.innerHTML = ''; 
    listToRender.sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal)); 
    
    if (listToRender.length === 0) {
        const row = transactionListBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 5; 
        cell.style.cssText = 'border: none; padding: 0;';
        cell.innerHTML = `
            <div class="no-data-message" style="border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 12px; text-align: center; font-weight: bold; box-sizing: border-box; width: 100%;">
                Tidak ada transaksi ditemukan untuk kriteria ini.
            </div>
        `;
    } else {
        listToRender.forEach((t) => {
            const row = transactionListBody.insertRow();
            const typeClass = t.jenis === 'Pendapatan' ? 'income' : 'expense';
            
            row.insertCell().textContent = t.tanggal;
            row.insertCell().innerHTML = `<span class="${typeClass}">${t.jenis}</span>`;
            row.insertCell().textContent = t.kategori;
            row.insertCell().textContent = formatRupiah(t.jumlah);
            
            const actionCell = row.insertCell();
            
            // 1. Tombol RINCIAN 
            const detailBtn = document.createElement('button');
            detailBtn.textContent = 'Rincian'; 
            detailBtn.className = 'btn detail';
            detailBtn.onclick = () => showDetails(t.id); 
            actionCell.appendChild(detailBtn);
            
            // 2. Tombol HAPUS 
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Hapus'; 
            deleteBtn.className = 'btn delete';
            deleteBtn.onclick = () => deleteTransaction(t.id);
            actionCell.appendChild(deleteBtn);
        });
    }
    calculateAndRenderSummary(listToRender); 
}

// FUNGSI LAINNYA
window.goToStep2 = function() {
    const selectedType = document.querySelector('input[name="type"]:checked');
    const dateInput = document.getElementById('date').value;
    if (!selectedType || !dateInput) { 
        Swal.fire('Gagal!', 'Mohon isi Tanggal dan Jenis Transaksi.', 'warning');
        return; 
    }
    const type = selectedType.value;
    categorySelect.innerHTML = '<option value="">-- Pilih Kategori --</option>';
    KATEGORI[type].forEach(cat => {
        const option = document.createElement('option');
        option.value = cat; option.textContent = cat; categorySelect.appendChild(option);
    });
    step1.style.display = 'none'; step2.style.display = 'block';
}

window.goToStep1 = function() { step1.style.display = 'block'; step2.style.display = 'none'; }

async function fetchImageUrlByTimestamp(id) {
    try {
        const rowIndex = await getRowIndexByTimestamp(id);
        if (!rowIndex) return '';
        const res = await fetch(`${GOOGLE_SHEET_API_URL}/${rowIndex}`, {
            headers: {
                'Authorization': `Bearer ${SHEETSON_API_KEY}`,
                'X-Spreadsheet-Id': SHEETSON_SPREADSHEET_ID
            }
        });
        if (!res.ok) return '';
        const v = await res.json();
        let url = v.Gambar || v.gambar || v['Gambar '] || v['gambar '] || '';
        if (typeof url === 'string' && url.includes('HYPERLINK(')) {
            const m = url.match(/HYPERLINK\(\s*"([^"]+)"/i);
            if (m && m[1]) url = m[1];
        }
        return typeof url === 'string' ? url.trim() : '';
    } catch { return ''; }
}

window.showDetails = async function(id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;
    const rawImg = transaction.gambar || transaction.Gambar || transaction['Gambar '] || transaction['gambar'] || '';
    let imgUrl = typeof rawImg === 'string' ? rawImg.trim() : '';
    if (!imgUrl) { imgUrl = await fetchImageUrlByTimestamp(transaction.id); }
    let imgSection = imgUrl ? `<div style="margin-top:10px"><img src="${encodeURI(imgUrl)}" alt="Struk" referrerpolicy="no-referrer" crossorigin="anonymous" style="max-width:100%;height:auto;border:1px solid #ddd;border-radius:6px"/></div>` : `<div style="margin-top:10px;color:#666">Belum ada foto struk.</div>`;
    let actionButtons = imgUrl
        ? `<div style="margin-top:12px;text-align:center"><a id="openPhotoBtn" href="${encodeURI(imgUrl)}" target="_blank" rel="noopener" class="btn detail">Buka Gambar</a> <button id="replacePhotoBtn" class="btn primary">Ganti Gambar</button></div>`
        : `<div style="margin-top:12px;text-align:center"><button id="addPhotoBtn" class="btn primary">Tambah Foto</button></div>`;
    let detailsText = `
        <div style="text-align: left;">
            <strong>Tanggal:</strong> ${transaction.tanggal}<br>
            <strong>Jenis:</strong> ${transaction.jenis}<br>
            <strong>Kategori:</strong> ${transaction.kategori}<br>
            <strong>Jumlah:</strong> ${formatRupiah(transaction.jumlah)}<br>
            <strong>Deskripsi:</strong> ${transaction.deskripsi || '(Tidak ada)'}
        </div>
        ${imgSection}
        ${actionButtons}
    `;
    Swal.fire({
        title: 'Rincian Transaksi',
        html: detailsText,
        icon: 'info',
        confirmButtonText: 'Tutup',
        didOpen: () => {
            const addBtn = document.getElementById('addPhotoBtn');
            if (addBtn) {
                addBtn.addEventListener('click', async () => {
                    const { value: file } = await Swal.fire({
                        title: 'Pilih foto struk',
                        input: 'file',
                        inputAttributes: { accept: 'image/*' },
                        confirmButtonText: 'Unggah',
                        showCancelButton: true
                    });
                    if (file) {
                        Swal.showLoading();
                        const editedBase64 = await openImageEditor(file);
                        Swal.close();
                        let finalUrl = '';
                        if (editedBase64) {
                            const upRes = await uploadImageToImgbb(editedBase64);
                            if (upRes.success) finalUrl = upRes.url; else {
                                Swal.fire('Gagal Upload', upRes.message || 'Tidak dapat mengunggah struk.', 'error');
                                return;
                            }
                        } else {
                            const uploadRes = await handleImageUpload(file);
                            if (uploadRes.success) finalUrl = uploadRes.url; else {
                                Swal.fire('Gagal Upload', uploadRes.message || 'Tidak dapat mengunggah struk.', 'error');
                                return;
                            }
                        }
                        if (finalUrl) {
                            const upd = await updateTransactionImageInCloud(transaction.id, finalUrl);
                            if (upd.success) {
                                transactions = await loadTransactionsFromCloud();
                                filterAndRenderTransactions();
                                Swal.fire('Berhasil', 'Foto struk berhasil ditambahkan.', 'success');
                            } else {
                                Swal.fire('Gagal', upd.message || 'Tidak dapat menyimpan URL gambar.', 'error');
                            }
                        }
                    }
                });
            }
            const replaceBtn = document.getElementById('replacePhotoBtn');
            if (replaceBtn) {
                replaceBtn.addEventListener('click', async () => {
                    const { value: file } = await Swal.fire({
                        title: 'Pilih foto pengganti',
                        input: 'file',
                        inputAttributes: { accept: 'image/*' },
                        confirmButtonText: 'Unggah',
                        showCancelButton: true
                    });
                    if (file) {
                        Swal.showLoading();
                        const editedBase64 = await openImageEditor(file);
                        Swal.close();
                        let finalUrl = '';
                        if (editedBase64) {
                            const upRes = await uploadImageToImgbb(editedBase64);
                            if (upRes.success) finalUrl = upRes.url; else {
                                Swal.fire('Gagal Upload', upRes.message || 'Tidak dapat mengunggah struk.', 'error');
                                return;
                            }
                        } else {
                            const uploadRes = await handleImageUpload(file);
                            if (uploadRes.success) finalUrl = uploadRes.url; else {
                                Swal.fire('Gagal Upload', uploadRes.message || 'Tidak dapat mengunggah struk.', 'error');
                                return;
                            }
                        }
                        if (finalUrl) {
                            const upd = await updateTransactionImageInCloud(transaction.id, finalUrl);
                            if (upd.success) {
                                transactions = await loadTransactionsFromCloud();
                                filterAndRenderTransactions();
                                Swal.fire('Berhasil', 'Foto struk berhasil diganti.', 'success');
                            } else {
                                Swal.fire('Gagal', upd.message || 'Tidak dapat menyimpan URL gambar baru.', 'error');
                            }
                        }
                    }
                });
            }
        }
    });
}

// --- INISIALISASI APLIKASI saat dimuat ---
document.addEventListener('DOMContentLoaded', async () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
    
    // Memuat data pertama kali dari Cloud
    transactions = await loadTransactionsFromCloud(); 
    
    populateYearFilter();
    populateMonthFilter();
    
    filterAndRenderTransactions(); 

    // Wire Download PDF button (if present)
    if (downloadPdfBtn) downloadPdfBtn.addEventListener('click', downloadPdf);
});


// --- EXPORT TO PDF ---
async function downloadPdf() {
    // Always use currentFilteredList which respects active filters (period, search, etc.)
    const listToExport = currentFilteredList && Array.isArray(currentFilteredList) ? currentFilteredList : [];
    if (!listToExport || listToExport.length === 0) {
        Swal.fire('Kosong', 'Tidak ada transaksi untuk diekspor.', 'info');
        return;
    }

    if (typeof html2pdf === 'undefined') {
        Swal.fire('Library hilang', 'Library html2pdf belum dimuat. Pastikan koneksi internet aktif.', 'error');
        return;
    }

    const container = document.createElement('div');
    container.style.fontFamily = 'Arial, Helvetica, sans-serif';
    container.style.color = '#222';
    container.style.padding = '12px';

    const title = document.createElement('h2');
    title.textContent = 'Rekapan Keuangan';
    container.appendChild(title);

    const meta = document.createElement('p');
    meta.textContent = `Dibuat: ${new Date().toLocaleString()}`;
    container.appendChild(meta);

    const summaryDiv = document.createElement('div');
    summaryDiv.innerHTML = `
        <p>Total Pendapatan: <strong>${document.getElementById('totalIncome').textContent}</strong></p>
        <p>Total Pengeluaran: <strong>${document.getElementById('totalExpense').textContent}</strong></p>
        <p>Saldo Bersih: <strong>${document.getElementById('netBalance').textContent}</strong></p>
        <hr>
    `;
    container.appendChild(summaryDiv);

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = '12px';

    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th style="border:1px solid #ddd;padding:6px;text-align:left">Tanggal</th>
            <th style="border:1px solid #ddd;padding:6px;text-align:left">Jenis</th>
            <th style="border:1px solid #ddd;padding:6px;text-align:left">Kategori</th>
            <th style="border:1px solid #ddd;padding:6px;text-align:right">Jumlah (Rp)</th>
            <th style="border:1px solid #ddd;padding:6px;text-align:left">Deskripsi</th>
        </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    listToExport.forEach(t => {
        const tr = document.createElement('tr');
        // Untuk Pendapatan: rata kanan pada kolom Jumlah; untuk Pengeluaran: normal
        const isIncome = t.jenis === 'Pendapatan';
        const jumlahStyle = isIncome ? 'text-align:right;font-weight:bold;color:#28a745' : 'text-align:right';
        tr.innerHTML = `
            <td style="border:1px solid #ddd;padding:6px">${t.tanggal || ''}</td>
            <td style="border:1px solid #ddd;padding:6px">${t.jenis || ''}</td>
            <td style="border:1px solid #ddd;padding:6px">${t.kategori || ''}</td>
            <td style="border:1px solid #ddd;padding:6px;${jumlahStyle}">${formatRupiah(t.jumlah || 0)}</td>
            <td style="border:1px solid #ddd;padding:6px">${t.deskripsi || ''}</td>
        `;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // Generate filename berdasarkan filter periode yang aktif
    const selectedYear = filterYearSelect.value;
    const selectedMonth = filterMonthSelect.value;
    
    let filename = 'Rekap_Keuangan';
    if (selectedMonth !== 'all') {
        const monthLabel = MONTH_NAMES.find(m => m.value === selectedMonth)?.label || selectedMonth;
        filename += `_${monthLabel}_${selectedYear}`;
    } else if (selectedYear !== 'all') {
        filename += `_${selectedYear}`;
    } else {
        // Jika tidak ada filter (semua data), gunakan tanggal sekarang
        const now = new Date();
        filename += `_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`;
    }
    filename += '.pdf';

    const opt = {
        margin:       10,
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        await html2pdf().set(opt).from(container).save();
    } catch (e) {
        console.error('Gagal membuat PDF:', e);
        Swal.fire('Gagal', 'Terjadi kesalahan saat membuat PDF. Lihat konsol untuk detail.', 'error');
    }
}

function compressImage(file, maxWidth = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                const base64 = dataUrl.split(',')[1];
                resolve(base64);
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function uploadImageToImgbb(base64) {
    const fd = new FormData();
    fd.append('image', base64);
    try {
        const res = await fetch(IMGBB_API, { method: 'POST', body: fd });
        if (!res.ok) return { success: false, message: res.statusText };
        const json = await res.json();
        const url = (json && json.data && (json.data.display_url || (json.data.image && json.data.image.url) || json.data.url)) || '';
        if (!url) return { success: false, message: 'URL kosong dari IMGBB' };
        return { success: true, url };
    } catch (e) {
        return { success: false, message: e.toString() };
    }
}

async function handleImageUpload(file) {
    try {
        const base64 = await compressImage(file);
        const up = await uploadImageToImgbb(base64);
        return up;
    } catch (e) {
        return { success: false, message: e.toString() };
    }
}

async function openImageEditor(file, maxWidth = 1200, quality = 0.7) {
    try {
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = dataUrl;
        });
        let angle = 0;
        const result = await Swal.fire({
            title: 'Edit Foto',
            html: `
                <div style="display:flex;flex-direction:column;gap:10px;align-items:center">
                    <canvas id="imgEditorCanvas" style="max-width:100%;border:1px solid #ddd;border-radius:6px"></canvas>
                    <div>
                        <button id="rotLeft" class="btn secondary">⟲</button>
                        <button id="rotRight" class="btn secondary">⟳</button>
                        <button id="rotReset" class="btn">Reset</button>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Simpan',
            didOpen: () => {
                const canvas = document.getElementById('imgEditorCanvas');
                const ctx = canvas.getContext('2d');
                function render() {
                    const rotated = Math.abs(angle % 180) === 90;
                    const srcW = img.width;
                    const srcH = img.height;
                    const baseW = rotated ? srcH : srcW;
                    const scale = Math.min(1, maxWidth / baseW);
                    canvas.width = Math.round((rotated ? srcH : srcW) * scale);
                    canvas.height = Math.round((rotated ? srcW : srcH) * scale);
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.save();
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate((angle * Math.PI) / 180);
                    ctx.drawImage(
                        img,
                        -Math.round((srcW * scale) / 2),
                        -Math.round((srcH * scale) / 2),
                        Math.round(srcW * scale),
                        Math.round(srcH * scale)
                    );
                    ctx.restore();
                }
                render();
                document.getElementById('rotLeft').addEventListener('click', () => { angle -= 90; render(); });
                document.getElementById('rotRight').addEventListener('click', () => { angle += 90; render(); });
                document.getElementById('rotReset').addEventListener('click', () => { angle = 0; render(); });
            },
            preConfirm: () => {
                const canvas = document.getElementById('imgEditorCanvas');
                const out = canvas.toDataURL('image/jpeg', quality);
                return out.split(',')[1];
            }
        });
        return result.isConfirmed ? result.value : null;
    } catch (e) {
        return null;
    }
}
