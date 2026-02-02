const DB_KEY = 'primal_ledger_v3';
let borrowers = [];
let activeBorrowerId = null;
let activeSMSId = null;
let showAll = false;
let activeBook = 'crj'; 
let deferredPrompt;
const apiKey = ""; 

// --- INITIALIZATION ---
async function init() {
    // 1. Request Persistent Storage (Anti-Delete)
    if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        console.log(`Persisted: ${isPersisted}`);
    }

    // 2. Load Data
    try {
        const raw = localStorage.getItem(DB_KEY);
        if (raw) {
            borrowers = JSON.parse(raw);
            if (!Array.isArray(borrowers)) borrowers = [];
        }
    } catch (e) { borrowers = []; }
    
    // 3. UI Init
    filterHomeList(); 
    updateDashboard(); 
    startClock(); 
    generateBooks('crj'); 
    
    // 4. Default Date
    const loanDateInput = document.getElementById('p_loanDate');
    if(loanDateInput) loanDateInput.valueAsDate = new Date();
}

// --- PWA INSTALL HANDLER ---
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const card = document.getElementById('installAppCard');
    if(card) card.style.display = 'flex';
});

async function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('installAppCard').style.display = 'none';
        }
        deferredPrompt = null;
    }
}

// --- CORE SAVE SYSTEM ---
function safeSave() {
    try {
        if(!borrowers) borrowers = [];
        // Sort: Latest updated first
        borrowers.sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));
        localStorage.setItem(DB_KEY, JSON.stringify(borrowers));
        
        updateDashboard(); 
        filterHomeList(); 
        
        // Refresh active book
        const activeTab = document.querySelector('.book-tab.active');
        if(activeTab) {
            const onclick = activeTab.getAttribute('onclick');
            if(onclick) generateBooks(onclick.split("'")[1]);
        }
        
    } catch (e) { 
        if(e.name.includes('Quota')) alert("Storage Full! Please backup and delete old records."); 
    }
}

// --- AUTOMATIC DUE DATE LOGIC ---
function getNextDate(startDate, terms) {
    let date = new Date(startDate);
    if (terms === 'Daily') date.setDate(date.getDate() + 1);
    else if (terms === 'Weekly') date.setDate(date.getDate() + 7);
    else if (terms === 'Kinsenas') date.setDate(date.getDate() + 15);
    else if (terms === 'Monthly') date.setMonth(date.getMonth() + 1);
    return date.toISOString().split('T')[0];
}

function autoCalcDueDateInForm() {
    const terms = document.getElementById('p_terms').value;
    const loanDate = document.getElementById('p_loanDate').value;
    const display = document.getElementById('p_dueDateDisplay');
    if(loanDate && terms) {
        display.value = getNextDate(loanDate, terms);
    }
}

// --- BOOKS OF ACCOUNTS ---
function switchBook(type, btn) {
    activeBook = type;
    document.querySelectorAll('.book-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    generateBooks(type);
}

function generateBooks(type) {
    const table = document.getElementById('bookTableContent');
    let html = '';
    let allTrans = [];
    
    // Flatten transactions
    borrowers.forEach(b => {
        (b.transactions || []).forEach(t => {
            allTrans.push({ ...t, name: b.name });
        });
    });
    
    // Sort Date Descending
    allTrans.sort((a,b) => new Date(b.date) - new Date(a.date));

    if (type === 'crj') {
        // Cash Receipts
        html = `<thead><tr><th>Date</th><th>Payer</th><th>Ref</th><th>Debit (Cash)</th><th>Credit (AR)</th></tr></thead><tbody>`;
        allTrans.filter(t => t.type === 'Payment').forEach(t => {
            html += `<tr class="crj-row">
                <td>${new Date(t.date).toLocaleDateString()}</td>
                <td>${t.name}</td>
                <td>${t.notes || '-'}</td>
                <td>${t.amount.toLocaleString()}</td>
                <td>${t.amount.toLocaleString()}</td>
            </tr>`;
        });
        html += `</tbody>`;
        
    } else if (type === 'cdj') {
        // Cash Disbursements
        html = `<thead><tr><th>Date</th><th>Payee</th><th>Ref</th><th>Debit (AR)</th><th>Credit (Cash)</th></tr></thead><tbody>`;
        allTrans.filter(t => t.type === 'Loan').forEach(t => {
            html += `<tr class="cdj-row">
                <td>${new Date(t.date).toLocaleDateString()}</td>
                <td>${t.name}</td>
                <td>${t.notes || '-'}</td>
                <td>${t.amount.toLocaleString()}</td>
                <td>${t.amount.toLocaleString()}</td>
            </tr>`;
        });
        html += `</tbody>`;
        
    } else if (type === 'gj') {
        // General Journal
         html = `<thead><tr><th>Date</th><th>Account Title</th><th>Ref</th><th>Debit</th><th>Credit</th></tr></thead><tbody>`;
         allTrans.forEach(t => {
            let debit = t.type === 'Loan' ? 'Accounts Receivable' : 'Cash';
            let credit = t.type === 'Loan' ? 'Cash' : 'Accounts Receivable';
            
            html += `<tr class="gj-row">
                <td>${new Date(t.date).toLocaleDateString()}</td>
                <td>${debit}</td>
                <td>${t.notes || '-'}</td>
                <td>${t.amount.toLocaleString()}</td>
                <td>-</td>
            </tr>
            <tr class="gj-row">
                <td></td>
                <td style="padding-left:20px;">${credit}</td>
                <td></td>
                <td>-</td>
                <td>${t.amount.toLocaleString()}</td>
            </tr>`;
         });
         html += `</tbody>`;
         
    } else if (type === 'gl') {
        // General Ledger
        let totalCash = 0; 
        let totalAR = 0;
        
        allTrans.forEach(t => {
            if(t.type === 'Payment') { 
                totalCash += t.amount; 
                totalAR -= t.amount; 
            } else { 
                totalCash -= t.amount; 
                totalAR += t.amount; 
            }
        });
        
        html = `<thead><tr><th>Account Title</th><th>Debit Balance</th><th>Credit Balance</th><th>Net Balance</th></tr></thead><tbody>
            <tr>
                <td>Cash on Hand</td>
                <td>${totalCash > 0 ? totalCash.toLocaleString() : 0}</td>
                <td>${totalCash < 0 ? Math.abs(totalCash).toLocaleString() : 0}</td>
                <td style="font-weight:bold">${totalCash.toLocaleString()}</td>
            </tr>
            <tr>
                <td>Loans Receivable (AR)</td>
                <td>${totalAR > 0 ? totalAR.toLocaleString() : 0}</td>
                <td>${totalAR < 0 ? Math.abs(totalAR).toLocaleString() : 0}</td>
                <td style="font-weight:bold">${totalAR.toLocaleString()}</td>
            </tr>
        </tbody>`;
    }
    table.innerHTML = html;
}

// --- EXPORT LOGIC ---
function openExportModal() { openModal('exportModal'); }

function runExport() {
    const type = document.getElementById('export_type').value;
    const startVal = document.getElementById('exp_start').value;
    const endVal = document.getElementById('exp_end').value;
    const start = startVal ? new Date(startVal) : null;
    const end = endVal ? new Date(endVal) : null;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    let allTrans = [];
    
    borrowers.forEach(b => { 
        (b.transactions || []).forEach(t => { 
            allTrans.push({ ...t, name: b.name }); 
        }); 
    });
    
    if(start) allTrans = allTrans.filter(t => new Date(t.date) >= start);
    if(end) allTrans = allTrans.filter(t => new Date(t.date) <= end);

    if (type === 'CRJ') {
        csvContent += "Date,Payer,Reference,Debit(Cash),Credit(AR)\n";
        allTrans.filter(t => t.type === 'Payment').forEach(t => { 
            csvContent += `${new Date(t.date).toLocaleDateString()},${t.name},${t.notes||''},${t.amount},${t.amount}\n`; 
        });
    } else if (type === 'CDJ') {
        csvContent += "Date,Payee,Reference,Debit(AR),Credit(Cash)\n";
        allTrans.filter(t => t.type === 'Loan').forEach(t => { 
            csvContent += `${new Date(t.date).toLocaleDateString()},${t.name},${t.notes||''},${t.amount},${t.amount}\n`; 
        });
    } else {
        csvContent += "Date,Account,Type,Amount,Notes\n";
        allTrans.forEach(t => { 
            csvContent += `${new Date(t.date).toLocaleDateString()},${t.name},${t.type},${t.amount},${t.notes||''}\n`; 
        });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Pautang_${type}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    closeModal('exportModal');
}

// --- HOME LIST FILTERS ---
function filterHomeList() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const filter = document.getElementById('filterSelect').value;
    const container = document.getElementById('homeListContent');
    const seeMoreBtn = document.getElementById('seeMoreBtn');
    
    container.innerHTML = '';
    
    // EMPTY STATE: Show Restore Button
    if(borrowers.length === 0) { 
        container.innerHTML = `
            <div style="text-align:center; padding:30px; color:#999;">
                <p style="margin-bottom:20px;">Walang laman. Nag-clear cache ka ba?</p>
                <button class="btn-block btn-primary" onclick="triggerRestore()" style="background:#22c55e;">
                    🔄 RESTORE FROM BACKUP
                </button>
            </div>
        `; 
        if(seeMoreBtn) seeMoreBtn.classList.add('hidden'); 
        return; 
    }
    
    let filtered = borrowers.filter(b => b.name.toLowerCase().includes(query));
    
    if (filter === 'due') {
        filtered = filtered.filter(b => {
            const bal = getBal(b);
            if(bal <= 0) return false;
            const diff = Math.ceil((new Date(b.dueDate) - new Date())/86400000);
            return diff <= 5 && diff >= 0;
        });
    } else if (filter === 'overdue') {
        filtered = filtered.filter(b => (getBal(b) > 0 && new Date(b.dueDate) < new Date()));
    } else if (filter === 'paid') {
        filtered = filtered.filter(b => getBal(b) <= 0);
    }
    
    // Sort
    filtered.sort((a,b) => {
        if(getBal(a) > 0 && getBal(b) > 0) return new Date(a.dueDate) - new Date(b.dueDate);
        return new Date(b.lastUpdated) - new Date(a.lastUpdated);
    });
    
    const displayList = showAll ? filtered : filtered.slice(0, 4);
    
    if(displayList.length === 0 && borrowers.length > 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">Walang nakitang resulta.</p>';
    }

    displayList.forEach(b => {
        const bal = getBal(b);
        let badge = bal <= 0 ? '<span class="badge badge-paid">Paid</span>' : '<span class="badge badge-active">Active</span>';
        let alertHtml = ''; 
        
        const diff = Math.ceil((new Date(b.dueDate) - new Date())/86400000);
        if(bal > 0 && b.dueDate && diff <= 5) {
            alertHtml = `<button class="alert-btn" onclick="event.stopPropagation(); openSMS('${b.id}')">🔔</button>`;
            if(diff < 0) badge = '<span class="badge badge-bad">Overdue</span>';
        }
        
        const div = document.createElement('div');
        div.className = 'borrower-card';
        div.onclick = () => openDetails(b.id);
        
        const imgUrl = b.photo || `https://ui-avatars.com/api/?background=random&name=${encodeURIComponent(b.name)}`;
        
        div.innerHTML = `
            <img src="${imgUrl}" class="avatar">
            <div class="info">
                <div class="name">${b.name}</div>
                <div class="details">${b.terms} • Due: ${b.dueDate}</div>
                <div class="balance">₱${bal.toLocaleString()} ${badge}</div>
            </div>
            ${alertHtml}
        `;
        container.appendChild(div);
    });
    
    if(filtered.length > 4 && !showAll) seeMoreBtn.classList.remove('hidden'); 
    else seeMoreBtn.classList.add('hidden');
}

function showAllProfiles() { showAll = true; filterHomeList(); }

// --- PROFILE & TRANSACTIONS ---
function handleSaveProfile() {
    const id = document.getElementById('p_id').value || Date.now().toString();
    const name = document.getElementById('p_name').value;
    const phone = document.getElementById('p_phone').value;
    
    if(!name || !phone) { alert("Please fill Name and Phone."); return; }

    const terms = document.getElementById('p_terms').value;
    const loanDate = document.getElementById('p_loanDate').value;
    
    const isNew = !document.getElementById('p_id').value;
    let tx = [];
    if(!isNew) {
        const old = borrowers.find(b => b.id === id);
        if(old) tx = old.transactions;
    }

    const data = {
        id, 
        name, 
        phone,
        address: document.getElementById('p_address').value,
        age: document.getElementById('p_age').value,
        terms,
        dueDate: getNextDate(loanDate, terms),
        photo: document.getElementById('p_photo_base64').value,
        transactions: tx,
        lastUpdated: new Date().toISOString()
    };

    if(isNew) borrowers.push(data);
    else {
        const idx = borrowers.findIndex(b => b.id === id);
        if(idx !== -1) borrowers[idx] = data;
    }
    
    safeSave();
    closeModal('profileModal');
    if(!isNew && activeBorrowerId === id) openDetails(id);
    showToast("Profile Saved!");
}

function handleAddTransaction() {
    if(!activeBorrowerId) return;
    const idx = borrowers.findIndex(b => b.id === activeBorrowerId);
    if(idx === -1) return;

    const amtVal = document.getElementById('t_amount').value;
    if(!amtVal) { alert("Enter amount"); return; }
    
    const amt = parseFloat(amtVal);
    const type = document.getElementById('t_type').value;
    const note = document.getElementById('t_notes').value;
    const b = borrowers[idx];

    if(!borrowers[idx].transactions) borrowers[idx].transactions = [];

    // Auto-update due date on new loan
    if(type === 'Loan') {
        borrowers[idx].dueDate = getNextDate(new Date(), borrowers[idx].terms);
    }

    borrowers[idx].transactions.push({
        type, 
        amount: amt, 
        notes: note, 
        date: new Date().toISOString() 
    });
    
    borrowers[idx].lastUpdated = new Date().toISOString();
    document.getElementById('t_amount').value = '';
    document.getElementById('t_notes').value = '';

    safeSave();
    openDetails(activeBorrowerId);
    
    if(type === 'Payment') {
        // Show Receipt
        document.getElementById('r_date').innerText = new Date().toLocaleDateString();
        document.getElementById('r_name').innerText = borrowers[idx].name;
        document.getElementById('r_amount').innerText = '₱' + amt.toLocaleString();
        document.getElementById('r_balance').innerText = '₱' + getBal(borrowers[idx]).toLocaleString();
        closeModal('detailsModal');
        openModal('receiptModal');
    }
    showToast("Transaction Added!");
}

// --- UTILS & CALCULATORS ---
function getBal(b) {
    const l = (b.transactions || []).filter(t=>t.type === 'Loan').reduce((a,c)=>a + c.amount, 0);
    const p = (b.transactions || []).filter(t=>t.type === 'Payment').reduce((a,c)=>a + c.amount, 0);
    return l - p;
}

function openDetails(id) {
    activeBorrowerId = id;
    const b = borrowers.find(x => x.id === id);
    if(!b) return;

    document.getElementById('d_name').innerText = b.name;
    document.getElementById('d_phone').innerText = b.phone;
    document.getElementById('d_avatar').src = b.photo || `https://ui-avatars.com/api/?background=random&name=${encodeURIComponent(b.name)}`;
    document.getElementById('d_balance').innerText = '₱' + getBal(b).toLocaleString();
    
    const tbody = document.querySelector('#historyTable tbody');
    tbody.innerHTML = '';
    
    (b.transactions || []).slice().reverse().forEach(t => {
        tbody.innerHTML += `
            <tr>
                <td>${new Date(t.date).toLocaleDateString().slice(0,5)}</td>
                <td>${t.type}</td>
                <td>₱${t.amount.toLocaleString()}</td>
            </tr>
        `;
    });
    
    openModal('detailsModal');
}

function exportData() {
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(borrowers));
    a.download = "pautang_backup_" + new Date().toISOString().slice(0,10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("Backup Saved to Downloads!");
}

function triggerRestore() {
    document.getElementById('restoreFile').click();
}

function handleRestore(input) {
    const file = input.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if(Array.isArray(data)) {
                if(confirm("I-replace ang current data gamit ang backup?")) {
                    borrowers = data;
                    safeSave();
                    location.reload();
                }
            } else {
                alert("Maling file format. Dapat .json backup file.");
            }
        } catch(err) {
            alert("Corrupted ang file.");
        }
    };
    reader.readAsText(file);
    input.value = '';
}

function calculateLoan() {
    const P = parseFloat(document.getElementById('lc_principal').value);
    const R = parseFloat(document.getElementById('lc_rate').value);
    const D = parseInt(document.getElementById('lc_duration').value);
    if(!P || !R || !D) return;
    const tot = P + (P * (R / 100));
    const res = document.getElementById('lc_result');
    res.style.display = 'block';
    res.innerHTML = `Total: ₱${tot.toLocaleString()}`;
}

function calculateDate() {
    const startVal = document.getElementById('dc_start').value;
    const addVal = parseInt(document.getElementById('dc_add').value);
    if(!startVal || !addVal) return;
    const d = new Date(startVal);
    d.setDate(d.getDate() + addVal);
    const res = document.getElementById('dc_result');
    res.style.display = 'block';
    res.innerText = d.toDateString();
}

function openCollectionModal() {
    openModal('collectionListModal');
    let s = "📋 LIST:\n";
    borrowers.forEach(b => {
        if(getBal(b) > 0) s += `- ${b.name}: ₱${getBal(b).toLocaleString()}\n`;
    });
    document.getElementById('cl_output').value = s;
}

function copyCollectionList() {
    const t = document.getElementById('cl_output');
    t.select();
    document.execCommand('copy');
    showToast("Copied!");
}

// --- STANDARD FUNCTIONS ---
function switchView(v, el) {
    document.querySelectorAll('.view-section').forEach(e => e.classList.remove('active'));
    document.getElementById('view-' + v).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    if(v !== 'home') { showAll = false; filterHomeList(); }
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeReceipt() { closeModal('receiptModal'); filterHomeList(); }

function switchTutTab(id, el) {
    document.querySelectorAll('.tut-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tut-' + id).classList.add('active');
    document.querySelectorAll('.tut-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
}

function openTutorialModal() { openModal('tutorialModal'); }
function openProfileModal() { 
    openModal('profileModal'); 
    document.getElementById('profileForm').reset(); 
    document.getElementById('p_loanDate').valueAsDate = new Date(); 
    document.getElementById('p_dueDateDisplay').value = "";
    document.getElementById('p_preview').style.display = 'none';
}

function editCurrentProfile() {
    closeModal('detailsModal');
    const b = borrowers.find(x => x.id === activeBorrowerId);
    document.getElementById('p_id').value = b.id;
    document.getElementById('p_name').value = b.name;
    document.getElementById('p_phone').value = b.phone;
    document.getElementById('p_address').value = b.address;
    document.getElementById('p_age').value = b.age;
    document.getElementById('p_terms').value = b.terms;
    document.getElementById('p_dueDateDisplay').value = b.dueDate;
    document.getElementById('p_photo_base64').value = b.photo || '';
    if(b.photo) {
        document.getElementById('p_preview').src = b.photo;
        document.getElementById('p_preview').style.display = 'block';
    }
    openModal('profileModal');
}

function deleteCurrentProfile() {
    if(confirm("BURAHIN? Di na ito maibabalik.")) {
        borrowers = borrowers.filter(b => b.id !== activeBorrowerId);
        safeSave();
        closeModal('detailsModal');
    }
}

function handleImageUpload(i) {
    if (i.files[0]) {
        const r = new FileReader();
        r.onload = e => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                const ctx = c.getContext('2d');
                let w = img.width, h = img.height;
                // Compress logic
                if (w > 250) { h *= 250 / w; w = 250; }
                c.width = w; c.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                const d = c.toDataURL('image/jpeg', 0.5);
                document.getElementById('p_preview').src = d;
                document.getElementById('p_preview').style.display = 'block';
                document.getElementById('p_photo_base64').value = d;
            };
            img.src = e.target.result;
        };
        r.readAsDataURL(i.files[0]);
    }
}

function openSMS(id) {
    activeSMSId = id;
    const b = borrowers.find(x => x.id === id);
    document.getElementById('s_balance').value = getBal(b);
    calculateSMS();
    openModal('smsModal');
}

function calculateSMS() {
    const b = borrowers.find(x => x.id === activeSMSId);
    const bal = parseFloat(document.getElementById('s_balance').value);
    const pen = parseFloat(document.getElementById('s_penalty').value) || 0;
    const tot = bal + (bal * (pen / 100));
    document.getElementById('s_total').value = '₱' + tot.toLocaleString();
    document.getElementById('s_message').value = `Hi ${b.name}, Balance: ₱${bal.toLocaleString()}. Total: ₱${tot.toLocaleString()}.`;
}

function safeOpenSMS() {
    const b = borrowers.find(x => x.id === activeSMSId);
    const msg = document.getElementById('s_message').value;
    const phone = b.phone.replace(/[^0-9+]/g, '');
    window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;
}

function copySMS() {
    navigator.clipboard.writeText(document.getElementById('s_message').value);
    showToast("Copied!");
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.className = 'show';
    setTimeout(() => t.className = '', 2000);
}

function startClock() {
    setInterval(() => {
        if (document.getElementById('liveClock')) document.getElementById('liveClock').innerText = new Date().toLocaleTimeString();
    }, 1000);
}

function updateDashboard() {
    let tr = 0, tc = 0;
    borrowers.forEach(b => {
        (b.transactions || []).forEach(t => {
            if (t.type === 'Loan') tr += t.amount;
            else { tr -= t.amount; tc += t.amount; }
        });
    });
    document.getElementById('totalReceivables').innerText = '₱' + tr.toLocaleString();
    document.getElementById('totalCollected').innerText = '₱' + tc.toLocaleString();
}

async function analyzeBorrower() { alert("Connect to internet for AI features."); }
async function generateAISMS() { alert("Connect to internet for AI features."); }

window.onload = init;
