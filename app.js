// --- KONSTANTA & INISIALISASI ---
const GOOGLE_SHEET_API_URL = 'https://sheetdb.io/api/v1/wzjx9cz1ks5h1';

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
        
        const response = await fetch(GOOGLE_SHEET_API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (Array.isArray(data)) {
            return data.map((t) => ({
                id: t.Timestamp, 
                tanggal: t.Tanggal, 
                jenis: t.Jenis,     
                kategori: t.Kategori,
                jumlah: parseFloat(String(t.Jumlah).replace(/[^0-9.]/g, '')) || 0, 
                deskripsi: t.Deskripsi || '' 
            })).filter(t => t.id);
        }
        return [];

    } catch (error) {
        console.error("Gagal memuat transaksi dari SheetDB:", error);
        // KUNCI PERBAIKAN: SweetAlert untuk notifikasi gagal
        Swal.fire('Gagal Memuat!', 'Terjadi masalah saat memuat data dari cloud. Cek koneksi atau konfigurasi SheetDB Anda.', 'error');
        return [];
    }
}

async function saveTransactionToCloud(newTransaction) {
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: [newTransaction] })
    };

    try {
        const response = await fetch(GOOGLE_SHEET_API_URL, options);
        if (!response.ok) throw new Error(response.statusText);
        const result = await response.json(); 
        
        if (result.created === 1) {
            return { success: true };
        } else {
             console.error("SheetDB Error:", result);
             return { success: false, message: "SheetDB menolak data." };
        }
    } catch (error) {
        console.error("Gagal menyimpan transaksi ke SheetDB:", error);
        return { success: false, message: error.toString() };
    }
}

async function deleteTransactionFromCloud(id) {
    const url = `${GOOGLE_SHEET_API_URL}/Timestamp/${encodeURIComponent(id)}`;

    const options = { method: 'DELETE', headers: { 'Content-Type': 'application/json' } };

    try {
        const response = await fetch(url, options);
        if (response.status === 200) {
            const rawResponse = await response.text(); 
            if (rawResponse.includes('{"deleted":1}')) { return { success: true }; } 
            else { console.error("SheetDB DELETE GAGAL. Respons:", rawResponse); return { success: false, message: "Akses DITOLAK: Respon tidak valid." }; }
        } else if (response.status === 404) { return { success: false, message: "ID transaksi tidak ditemukan di Sheet." }; } 
        else { return { success: false, message: `Gagal HTTP: ${response.status}. Cek log konsol.` }; }
        
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

    const newTransaction = {
        Timestamp: new Date().toISOString(), 
        Tanggal: date,
        Jenis: type,
        Kategori: category,
        Jumlah: amount,
        Deskripsi: description || ''
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

window.showDetails = function(id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;
    let detailsText = `
        <div style="text-align: left;">
            <strong>Tanggal:</strong> ${transaction.tanggal}<br>
            <strong>Jenis:</strong> ${transaction.jenis}<br>
            <strong>Kategori:</strong> ${transaction.kategori}<br>
            <strong>Jumlah:</strong> ${formatRupiah(transaction.jumlah)}<br>
            <strong>Deskripsi:</strong> ${transaction.deskripsi || '(Tidak ada)'}
        </div>
    `;
    Swal.fire({
        title: 'Rincian Transaksi',
        html: detailsText,
        icon: 'info',
        confirmButtonText: 'Tutup'
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