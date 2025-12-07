// --- KONSTANTA & INISIALISASI ---
const SUPABASE_URL = 'https://blrmoljtggbcwzeylapx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJscm1vbGp0Z2diY3d6ZXlsYXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyOTgyOTIsImV4cCI6MjA3ODg3NDI5Mn0.Z93qHy9bUeDOBUtryt8XVX3E4frxkuWCeGPJ5k1XOE4';
let supabaseClient = null;
async function ensureSupabase() { if (supabaseClient) return supabaseClient; const m = await import('https://esm.sh/@supabase/supabase-js'); supabaseClient = m.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); return supabaseClient; }

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
const filterStartDateInput = document.getElementById('filterStartDate');
const filterEndDateInput = document.getElementById('filterEndDate');
const searchBox = document.getElementById('searchBox');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const receiptInput = document.getElementById('receipt');

// --- FUNGSI UTILITIES ---

function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
}

function calculateSummaryData(listToRender) {
    let totalIncome = 0; let totalExpense = 0;
    let incomeCash = 0; let incomeATM = 0;
    let expenseCash = 0; let expenseATM = 0;

    listToRender.forEach(t => {
        const amount = Number(t.jumlah) || 0;
        const isCash = (t.metode || 'Cash') === 'Cash';

        if (t.jenis === 'Pendapatan') {
            totalIncome += amount;
            if (isCash) incomeCash += amount; else incomeATM += amount;
        } else {
            totalExpense += amount;
            if (isCash) expenseCash += amount; else expenseATM += amount;
        }
    });
    return {
        totalIncome, totalExpense, netBalance: totalIncome - totalExpense,
        incomeCash, incomeATM, expenseCash, expenseATM,
        balanceCash: incomeCash - expenseCash,
        balanceATM: incomeATM - expenseATM
    };
}

function calculateAndRenderSummary(listToRender) {
    const summary = calculateSummaryData(listToRender);

    document.getElementById('totalIncome').textContent = formatRupiah(summary.totalIncome);
    document.getElementById('totalExpense').textContent = formatRupiah(summary.totalExpense);

    const netBalanceEl = document.getElementById('netBalance');
    netBalanceEl.textContent = formatRupiah(summary.netBalance);
    netBalanceEl.style.color = summary.netBalance >= 0 ? '#007bff' : '#dc3545';

    // Update Cash/ATM summary
    document.getElementById('incomeCash').textContent = formatRupiah(summary.incomeCash);
    document.getElementById('expenseCash').textContent = formatRupiah(summary.expenseCash);
    const balCashEl = document.getElementById('balanceCash');
    balCashEl.textContent = formatRupiah(summary.balanceCash);
    balCashEl.style.color = summary.balanceCash >= 0 ? '#28a745' : '#dc3545';

    document.getElementById('incomeATM').textContent = formatRupiah(summary.incomeATM);
    document.getElementById('expenseATM').textContent = formatRupiah(summary.expenseATM);
    const balATMEl = document.getElementById('balanceATM');
    balATMEl.textContent = formatRupiah(summary.balanceATM);
    balATMEl.style.color = summary.balanceATM >= 0 ? '#28a745' : '#dc3545';
}

// --- FUNGSI CLOUD (SUPABASE) ---

async function loadTransactionsFromCloud() {
    try {
        transactionListBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Memuat data dari Cloud...</td></tr>';
        const supabase = await ensureSupabase();

        let data, error;
        try {
            // Try sorting by urutan first
            const result = await supabase.from('transaksi').select('*').order('tanggal', { ascending: true }).order('urutan', { ascending: true });
            data = result.data;
            error = result.error;
            if (error) throw error;
        } catch (e) {
            console.warn("Sorting by 'urutan' failed, falling back to date only.", e);
            // Fallback: sort only by date
            const result = await supabase.from('transaksi').select('*').order('tanggal', { ascending: true });
            data = result.data;
            error = result.error;
        }

        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        return rows.map(r => ({
            id: String(r.id ?? ''),
            tanggal: r.tanggal || '',
            jenis: r.jenis || '',
            metode: r.metode || 'Cash',
            kategori: r.kategori || '',
            jumlah: Number(r.jumlah) || 0,
            deskripsi: r.deskripsi || '',
            gambar: r.gambar || '',
            urutan: Number(r.urutan) || 0
        })).filter(t => t.id);
    } catch (error) {
        console.error(error);
        Swal.fire('Gagal Memuat!', 'Terjadi masalah saat memuat data dari cloud.', 'error');
        return [];
    }
}

async function saveTransactionToCloud(newTransaction) {
    try {
        const supabase = await ensureSupabase();
        let nextUrutan = 1;

        try {
            // Get max urutan for the date to append at the end
            const { data: maxData } = await supabase.from('transaksi').select('urutan').eq('tanggal', newTransaction.tanggal).order('urutan', { ascending: false }).limit(1);
            nextUrutan = (maxData && maxData.length > 0) ? (maxData[0].urutan + 1) : 1;
        } catch (e) {
            console.warn("Could not fetch max urutan, defaulting to 1", e);
        }

        const payload = {
            tanggal: newTransaction.tanggal,
            jenis: newTransaction.jenis,
            metode: newTransaction.metode,
            kategori: newTransaction.kategori,
            jumlah: newTransaction.jumlah,
            deskripsi: newTransaction.deskripsi || '',
            gambar: newTransaction.gambar || ''
        };

        // Only add urutan if we successfully calculated it (implying column likely exists or we just try)
        // Actually, better to try inserting with urutan, if fail, try without.

        let error;
        try {
            const res = await supabase.from('transaksi').insert([{ ...payload, urutan: nextUrutan }]);
            error = res.error;
            if (error) throw error;
        } catch (e) {
            console.warn("Insert with urutan failed, trying without.", e);
            const res = await supabase.from('transaksi').insert([payload]);
            error = res.error;
        }

        if (error) return { success: false, message: error.message || 'Gagal insert' };
        return { success: true };
    } catch (error) { return { success: false, message: error.toString() }; }
}

async function updateTransactionImageInCloud(id, imageUrl) {
    try { const supabase = await ensureSupabase(); const { error } = await supabase.from('transaksi').update({ gambar: imageUrl }).eq('id', id); if (error) return { success: false, message: error.message || 'Gagal update' }; return { success: true }; } catch (e) { return { success: false, message: e.toString() }; }
}

async function deleteTransactionFromCloud(id) {
    try { const supabase = await ensureSupabase(); const { error } = await supabase.from('transaksi').delete().eq('id', id); if (error) return { success: false, message: error.message || 'Gagal hapus' }; return { success: true }; } catch (error) { return { success: false, message: error.toString() }; }
}


// --- FUNGSI UTAMA (SUBMIT) ---
async function handleSubmit(e) {
    e.preventDefault();

    const date = document.getElementById('date').value;
    const type = document.querySelector('input[name="type"]:checked').value;
    const category = categorySelect.value;
    const method = document.getElementById('method').value;
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
            const uploadRes = await uploadImageToSupabase(editedBase64);
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

    const newTransaction = { tanggal: date, jenis: type, metode: method, kategori: category, jumlah: amount, deskripsi: description || '', gambar: imageUrl || '' };

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
}

financialForm.addEventListener('submit', handleSubmit);

// Logika Saat Tombol Hapus Diklik
window.deleteTransaction = async function (id) {
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

window.filterAndRenderTransactions = function () {
    const searchTerm = searchBox.value.toLowerCase().trim();
    const selectedYear = filterYearSelect.value;
    const selectedMonth = filterMonthSelect.value;
    const startDate = filterStartDateInput.value;
    const endDate = filterEndDateInput.value;
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
    // Filter by date range if startDate and/or endDate are set
    if (startDate) {
        filteredList = filteredList.filter(t => t.tanggal && t.tanggal >= startDate);
    }
    if (endDate) {
        filteredList = filteredList.filter(t => t.tanggal && t.tanggal <= endDate);
    }
    currentFilteredList = filteredList;
    renderTransactions(currentFilteredList);
}

function renderTransactions(listToRender) {
    transactionListBody.innerHTML = '';
    // Sort by Date then by Urutan then by ID (for stability)
    listToRender.sort((a, b) => {
        const dateA = new Date(a.tanggal);
        const dateB = new Date(b.tanggal);
        if (dateA - dateB !== 0) return dateA - dateB;

        const urutanDiff = (a.urutan || 0) - (b.urutan || 0);
        if (urutanDiff !== 0) return urutanDiff;

        // Fallback to ID for stable sort if urutan is same (e.g. 0)
        return String(a.id).localeCompare(String(b.id));
    });

    if (listToRender.length === 0) {
        const row = transactionListBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6;
        cell.style.cssText = 'border: none; padding: 0;';
        cell.innerHTML = `
            <div class="no-data-message" style="border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 12px; text-align: center; font-weight: bold; box-sizing: border-box; width: 100%;">
                Tidak ada transaksi ditemukan untuk kriteria ini.
            </div>
        `;
    } else {
        listToRender.forEach((t) => {
            const row = transactionListBody.insertRow();
            row.dataset.id = t.id; // Store ID for drag and drop
            row.dataset.date = t.tanggal; // Store Date for drag and drop validation
            const typeClass = t.jenis === 'Pendapatan' ? 'income' : 'expense';

            // Format tanggal ke DD/MM/YYYY
            const dateParts = t.tanggal.split('-');
            const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : t.tanggal;

            // Add drag handle icon
            const dateCell = row.insertCell();
            dateCell.innerHTML = `<span style="cursor:grab;margin-right:5px;color:#888">☰</span> ${formattedDate}`;

            row.insertCell().innerHTML = `<span class="${typeClass}">${t.jenis}</span>`;
            row.insertCell().textContent = t.metode || 'Cash';
            row.insertCell().textContent = t.kategori;
            row.insertCell().textContent = formatRupiah(t.jumlah);

            const actionCell = row.insertCell();

            // 1. Tombol RINCIAN
            const detailBtn = document.createElement('button');
            detailBtn.textContent = 'Rincian';
            detailBtn.className = 'btn detail';
            detailBtn.onclick = () => showDetails(t.id);
            actionCell.appendChild(detailBtn);

            // 2. Tombol EDIT
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'btn secondary';
            editBtn.onclick = () => editTransaction(t.id);
            actionCell.appendChild(editBtn);

            // 3. Tombol HAPUS
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Hapus';
            deleteBtn.className = 'btn delete';
            deleteBtn.onclick = () => deleteTransaction(t.id);
            actionCell.appendChild(deleteBtn);
        });
    }
    calculateAndRenderSummary(listToRender);
}

// --- DRAG AND DROP LOGIC ---
let sortableInstance = null;

function initSortable() {
    if (sortableInstance) sortableInstance.destroy();

    const el = document.getElementById('transactionList');
    sortableInstance = new Sortable(el, {
        animation: 150,
        handle: 'span[style*="cursor:grab"]', // Drag handle
        onEnd: async function (evt) {
            const itemEl = evt.item;
            const newIndex = evt.newIndex;
            const oldIndex = evt.oldIndex;

            if (newIndex === oldIndex) return;

            const id = itemEl.dataset.id;
            const date = itemEl.dataset.date;

            // Get all rows to determine new order
            const rows = Array.from(el.querySelectorAll('tr'));

            // Filter rows that have the same date (we only reorder within same date usually, but here we reorder globally in the list)
            // Ideally, we should check if the user dragged across dates, which might be confusing. 
            // For simplicity, we will just update the 'urutan' of ALL items in the list based on their new visual order.
            // However, to be efficient, we should only update items with the SAME DATE.

            // Let's verify if the user dragged into a different date group.
            // If the list is sorted by date, dragging an item to a position surrounded by different dates is weird.
            // But assuming the user sorts by "Semua Bulan" or specific month, the list is by date.

            // Strategy: Re-assign 'urutan' for ALL items of the SAME DATE as the moved item.
            // 1. Identify the date of the moved item.
            // 2. Find all items in the current list (DOM) that have that same date.
            // 3. Update their 'urutan' based on their visual order index.

            const sameDateRows = rows.filter(r => r.dataset.date === date);

            // Prepare updates
            const updates = sameDateRows.map((row, index) => ({
                id: row.dataset.id,
                urutan: index + 1
            }));

            // Optimistic update locally
            updates.forEach(u => {
                const t = transactions.find(tr => tr.id === u.id);
                if (t) t.urutan = u.urutan;
            });

            // Send to Cloud
            await updateOrderInCloud(updates);
        }
    });
}

async function updateOrderInCloud(updates) {
    const supabase = await ensureSupabase();
    // Batch update is not directly supported in one query easily without RPC, so we loop.
    // For small number of items per day, this is fine.
    for (const update of updates) {
        await supabase.from('transaksi').update({ urutan: update.urutan }).eq('id', update.id);
    }
    // No need to reload, we updated locally.
}

// FUNGSI LAINNYA
window.goToStep2 = function () {
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

window.goToStep1 = function () { step1.style.display = 'block'; step2.style.display = 'none'; }

window.editTransaction = function (id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;

    // Populate form with existing data
    document.getElementById('date').value = transaction.tanggal;

    // Set radio button
    const typeRadio = document.querySelector(`input[name="type"][value="${transaction.jenis}"]`);
    if (typeRadio) typeRadio.checked = true;

    // Populate categories (synchronous)
    goToStep2();

    // Set other fields immediately
    document.getElementById('category').value = transaction.kategori;
    document.getElementById('method').value = transaction.metode || 'Cash';
    document.getElementById('amount').value = transaction.jumlah;
    document.getElementById('description').value = transaction.deskripsi || '';

    // Change submit button text and add edit mode
    const submitBtn = financialForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Update Transaksi';
    submitBtn.dataset.editId = id;

    // Change form submit handler for edit mode
    financialForm.removeEventListener('submit', handleSubmit);
    financialForm.addEventListener('submit', handleEditSubmit);

    // Scroll to form to ensure user sees it
    financialForm.scrollIntoView({ behavior: 'smooth' });
}

async function handleEditSubmit(e) {
    e.preventDefault();

    const editId = financialForm.querySelector('button[type="submit"]').dataset.editId;
    const date = document.getElementById('date').value;
    const type = document.querySelector('input[name="type"]:checked').value;
    const category = document.getElementById('category').value;
    const method = document.getElementById('method').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value;

    if (!category || !amount || amount <= 0) {
        Swal.fire('Gagal!', 'Mohon isi Kategori dan Jumlah uang dengan benar.', 'warning');
        return;
    }

    const updatedTransaction = {
        tanggal: date,
        jenis: type,
        metode: method,
        kategori: category,
        jumlah: amount,
        deskripsi: description || ''
    };

    await updateTransactionInCloud(editId, updatedTransaction);
}

async function updateTransactionInCloud(id, updatedTransaction) {
    try {
        const supabase = await ensureSupabase();
        const { error } = await supabase.from('transaksi').update({
            tanggal: updatedTransaction.tanggal,
            jenis: updatedTransaction.jenis,
            metode: updatedTransaction.metode,
            kategori: updatedTransaction.kategori,
            jumlah: updatedTransaction.jumlah,
            deskripsi: updatedTransaction.deskripsi
        }).eq('id', id);

        if (error) {
            Swal.fire('Gagal!', `Pesan error: ${error.message}`, 'error');
            return;
        }

        Swal.fire('Berhasil!', 'Transaksi berhasil diperbarui!', 'success');

        // Reset form
        financialForm.reset();
        const submitBtn = financialForm.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Simpan Transaksi';
        delete submitBtn.dataset.editId;

        // Change back to normal submit handler
        financialForm.removeEventListener('submit', handleEditSubmit);
        financialForm.addEventListener('submit', handleSubmit);

        // Reload data
        transactions = await loadTransactionsFromCloud();
        filterAndRenderTransactions();
        goToStep1();

    } catch (error) {
        Swal.fire('Gagal!', `Terjadi kesalahan: ${error.toString()}`, 'error');
    }
}

window.showDetails = function (id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;
    let imgSection = transaction.gambar ? `<div style="margin-top:10px"><img src="${transaction.gambar}" alt="Struk" style="max-width:100%;height:auto;border:1px solid #ddd;border-radius:6px"/></div>` : `<div style="margin-top:10px;color:#666">Belum ada foto struk.</div>`;
    let actionButtons = `<div style="margin-top:12px;text-align:center"><button id="addPhotoBtn" class="btn primary">Tambah Foto</button>${transaction.gambar ? ' <button id="editPhotoBtn" class="btn secondary">Edit Foto</button>' : ''}</div>`;
    let detailsText = `
        <div style="text-align: left;">
            <strong>Tanggal:</strong> ${transaction.tanggal}<br>
            <strong>Jenis:</strong> ${transaction.jenis}<br>
            <strong>Metode:</strong> ${transaction.metode || 'Cash'}<br>
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
                            const upRes = await uploadImageToSupabase(editedBase64);
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
            const editBtn = document.getElementById('editPhotoBtn');
            if (editBtn) {
                editBtn.addEventListener('click', async () => {
                    const editResult = await openImageEditorForExisting(transaction.gambar);
                    if (editResult) {
                        if (editResult.action === 'save') {
                            const upRes = await uploadImageToSupabase(editResult.base64);
                            if (upRes.success) {
                                const upd = await updateTransactionImageInCloud(transaction.id, upRes.url);
                                if (upd.success) {
                                    transactions = await loadTransactionsFromCloud();
                                    filterAndRenderTransactions();
                                    Swal.fire('Berhasil', 'Foto struk berhasil diperbarui.', 'success');
                                } else {
                                    Swal.fire('Gagal', upd.message || 'Tidak dapat menyimpan foto baru.', 'error');
                                }
                            } else {
                                Swal.fire('Gagal Upload', upRes.message || 'Tidak dapat mengunggah foto baru.', 'error');
                            }
                        } else if (editResult.action === 'delete') {
                            const upd = await updateTransactionImageInCloud(transaction.id, '');
                            if (upd.success) {
                                transactions = await loadTransactionsFromCloud();
                                filterAndRenderTransactions();
                                Swal.fire('Terhapus', 'Foto struk berhasil dihapus.', 'success');
                            } else {
                                Swal.fire('Gagal', upd.message || 'Tidak dapat menghapus foto.', 'error');
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
    initSortable(); // Initialize SortableJS

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

    const summary = calculateSummaryData(listToExport);

    const summaryDiv = document.createElement('div');
    summaryDiv.innerHTML = `
        <div style="margin-bottom: 10px;">
            <p style="margin: 5px 0;">Total Pendapatan: <strong>${formatRupiah(summary.totalIncome)}</strong></p>
            <p style="margin: 5px 0;">Total Pengeluaran: <strong>${formatRupiah(summary.totalExpense)}</strong></p>
            <p style="margin: 5px 0;">Saldo Bersih: <strong>${formatRupiah(summary.netBalance)}</strong></p>
        </div>
        
        <div style="margin-bottom: 20px;">
            <div style="margin-bottom: 15px;">
                <h3 style="margin: 0 0 5px 0; font-size: 14px; text-decoration: underline;">Rincian ATM</h3>
                <p style="margin: 2px 0;">Masuk: <span style="color: #28a745; font-weight: bold;">${formatRupiah(summary.incomeATM)}</span></p>
                <p style="margin: 2px 0;">Keluar: <span style="color: #dc3545; font-weight: bold;">${formatRupiah(summary.expenseATM)}</span></p>
                <p style="margin: 2px 0;">Saldo: <span style="color: ${summary.balanceATM >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">${formatRupiah(summary.balanceATM)}</span></p>
            </div>

            <div style="margin-bottom: 15px;">
                <h3 style="margin: 0 0 5px 0; font-size: 14px; text-decoration: underline;">Rincian Cash</h3>
                <p style="margin: 2px 0;">Masuk: <span style="color: #28a745; font-weight: bold;">${formatRupiah(summary.incomeCash)}</span></p>
                <p style="margin: 2px 0;">Keluar: <span style="color: #dc3545; font-weight: bold;">${formatRupiah(summary.expenseCash)}</span></p>
                <p style="margin: 2px 0;">Saldo: <span style="color: ${summary.balanceCash >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold;">${formatRupiah(summary.balanceCash)}</span></p>
            </div>
        </div>
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
            <th style="border:1px solid #ddd;padding:6px;text-align:left">Metode</th>
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
            <td style="border:1px solid #ddd;padding:6px">${t.metode || 'Cash'}</td>
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
        filename += `_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    filename += '.pdf';

    const opt = {
        margin: 10,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        await html2pdf().set(opt).from(container).save();
    } catch (e) {
        console.error('Gagal membuat PDF:', e);
        Swal.fire('Gagal', 'Terjadi kesalahan saat membuat PDF. Lihat konsol untuk detail.', 'error');
    }
}

function compressImage(file, maxWidth = 1200, maxSizeKB = 200) {
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

                let quality = 0.9;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                let base64 = dataUrl.split(',')[1];
                let sizeKB = (base64.length * 3) / 4 / 1024; // approximate size

                // Loop turunkan quality sampai <= maxSizeKB
                while (sizeKB > maxSizeKB && quality > 0.1) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                    base64 = dataUrl.split(',')[1];
                    sizeKB = (base64.length * 3) / 4 / 1024;
                }

                resolve(base64);
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function uploadImageToSupabase(base64) {
    try {
        // Convert base64 → Blob
        const response = await fetch(`data:image/jpeg;base64,${base64}`);
        if (!response.ok) {
            throw new Error(`Failed to create blob: ${response.statusText}`);
        }
        const blob = await response.blob();

        // Buat nama file unik
        const fileName = `img_${Date.now()}.jpg`;

        // Upload ke bucket "bukti_transaksi"
        const supabase = await ensureSupabase();
        const { data, error } = await supabase.storage

            .from("bukti_transaksi")
            .upload(fileName, blob);

        if (error) {
            return { success: false, message: error.message };
        }

        // Ambil public URL
        const { data: publicUrlData } = supabase.storage
            .from("bukti_transaksi")
            .getPublicUrl(fileName);

        if (!publicUrlData || !publicUrlData.publicUrl) {
            return { success: false, message: "URL kosong dari Supabase" };
        }

        return { success: true, url: publicUrlData.publicUrl };

    } catch (e) {
        return { success: false, message: e.toString() };
    }
}

async function handleImageUpload(file) {
    try {
        const base64 = await compressImage(file);
        const up = await uploadImageToSupabase(base64);
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

async function openImageEditorForExisting(imageUrl, maxWidth = 1200, quality = 0.7) {
    try {
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.crossOrigin = 'anonymous'; // untuk CORS jika perlu
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = imageUrl;
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
        if (result.isConfirmed) {
            return { action: 'save', base64: result.value };
        } else if (result.dismiss === 'delete') {
            return { action: 'delete' };
        } else {
            return null;
        }
    } catch (e) {
        return null;
    }
}
