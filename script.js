const DB_KEY = 'primal_ledger_v3';
const apiKey = ""; 
let borrowers = [];
let activeBorrowerId = null;
let activeSMSId = null;
let showAll = false;

function init() {
    try {
        const raw = localStorage.getItem(DB_KEY);
        if (raw) borrowers = JSON.parse(raw) || [];
    } catch (e) { borrowers = []; }
    if(!Array.isArray(borrowers)) borrowers = [];
    filterHomeList(); updateDashboard(); startClock();
    if(document.getElementById('dc_start')) document.getElementById('dc_start').valueAsDate = new Date();
}

function safeSave() {
    try {
        if(!borrowers) borrowers = [];
        borrowers.sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));
        localStorage.setItem(DB_KEY, JSON.stringify(borrowers));
        updateDashboard(); filterHomeList();
    } catch (e) { if(e.name.includes('Quota')) alert("Storage Full!"); }
}

function calculateLoan() {
    const P = parseFloat(document.getElementById('lc_principal').value);
    const R = parseFloat(document.getElementById('lc_rate').value);
    const D = parseFloat(document.getElementById('lc_duration').value);
    const termsMap = { "1": "Daily", "7": "Weekly", "15": "Kinsenas", "30": "Monthly" };
    const T_val = document.getElementById('lc_terms').value;
    const T_days = parseInt(T_val);

    if (!P || !R || !D) { alert("Please fill all fields."); return; }

    const totalInterest = P * (R / 100);
    const totalAmount = P + totalInterest;
    const installmentCount = Math.ceil(D / T_days);
    const perInstallment = totalAmount / installmentCount;

    const resDiv = document.getElementById('lc_result');
    resDiv.style.display = 'block';
    resDiv.innerHTML = `<b>Total Interest:</b> ₱${totalInterest.toLocaleString()}<br><b>Total Amount:</b> ₱${totalAmount.toLocaleString()}<br><b>Payment Schedule:</b> ${termsMap[T_val]}<br><b>Hulog (${installmentCount}x):</b> ₱${perInstallment.toLocaleString(undefined, {maximumFractionDigits:2})}`;
}

function calculateDate() {
    const startStr = document.getElementById('dc_start').value;
    const add = parseInt(document.getElementById('dc_add').value);
    const unit = document.getElementById('dc_unit').value;
    if (!startStr || !add) { alert("Please enter date and duration."); return; }
    const date = new Date(startStr);
    if (unit === 'days') date.setDate(date.getDate() + add);
    if (unit === 'weeks') date.setDate(date.getDate() + (add * 7));
    if (unit === 'months') date.setMonth(date.getMonth() + add);
    const resDiv = document.getElementById('dc_result');
    resDiv.style.display = 'block';
    resDiv.innerHTML = date.toDateString();
}

function openCollectionModal() { openModal('collectionListModal'); generateCollectionList(); }
function generateCollectionList() {
    const today = new Date(); today.setHours(0,0,0,0);
    let list = "📋 COLLECTION LIST (" + today.toLocaleDateString() + ")\n\n";
    let count = 0;
    borrowers.forEach(b => {
        const bal = getBal(b);
        if (bal > 0 && b.dueDate) {
            const due = new Date(b.dueDate); due.setHours(0,0,0,0);
            if (due <= today) {
                count++;
                const status = due < today ? "[OVERDUE]" : "[DUE TODAY]";
                list += `${count}. ${b.name} - ₱${bal.toLocaleString()} ${status}\n`;
            }
        }
    });
    if (count === 0) list += "No collections scheduled for today.";
    document.getElementById('cl_output').value = list;
}
function copyCollectionList() {
    const txt = document.getElementById('cl_output'); txt.select();
    navigator.clipboard.writeText(txt.value); showToast("List Copied!");
}

function getBal(b) {
    if(!b.transactions) return 0;
    const l = b.transactions.filter(t=>t.type==='Loan').reduce((a,c)=>a+c.amount,0);
    const p = b.transactions.filter(t=>t.type==='Payment').reduce((a,c)=>a+c.amount,0);
    return l-p;
}

function filterHomeList() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const filter = document.getElementById('filterSelect').value;
    const container = document.getElementById('homeListContent');
    const seeMoreBtn = document.getElementById('seeMoreBtn');
    container.innerHTML = '';

    let filtered = borrowers.filter(b => b.name.toLowerCase().includes(query));
    if (filter === 'due') filtered = filtered.filter(b => { const bal=getBal(b); if(bal<=0)return false; const d=Math.ceil((new Date(b.dueDate)-new Date())/86400000); return d<=5 && d>=0; });
    else if (filter === 'overdue') filtered = filtered.filter(b => { const bal=getBal(b); if(bal<=0)return false; return (new Date(b.dueDate)-new Date())<0; });
    else if (filter === 'paid') filtered = filtered.filter(b => getBal(b)<=0);

    filtered.sort((a,b) => {
        if(getBal(a)>0 && getBal(b)>0) return new Date(a.dueDate) - new Date(b.dueDate);
        return new Date(b.lastUpdated) - new Date(a.lastUpdated);
    });

    const displayList = showAll ? filtered : filtered.slice(0, 4);
    if(displayList.length===0) { container.innerHTML='<div style="text-align:center;padding:30px;color:#999;font-size:0.9rem;">No profiles found.<br>Click + to create one.</div>'; seeMoreBtn.classList.add('hidden'); return; }

    displayList.forEach(b => {
        const bal = getBal(b);
        const isPaid = bal <= 0;
        let badge = isPaid ? '<span class="badge badge-paid">Paid</span>' : '<span class="badge badge-active">Active</span>';
        let alertHtml = '';
        if(!isPaid && b.dueDate) {
            const diff = Math.ceil((new Date(b.dueDate)-new Date())/86400000);
            if(diff<=5) alertHtml = `<button class="alert-btn" onclick="event.stopPropagation(); openSMS('${b.id}')">🔔</button>`;
            if(diff<0) badge = '<span class="badge badge-bad">Overdue</span>';
        }
        const div = document.createElement('div');
        div.className = 'borrower-card';
        div.onclick = () => openDetails(b.id);
        div.innerHTML = `<img src="${b.photo || 'https://ui-avatars.com/api/?background=random&name='+encodeURIComponent(b.name)}" class="avatar"><div class="info"><div class="name">${b.name}</div><div class="details">${b.terms} • Due: ${b.dueDate}</div><div class="balance">₱${bal.toLocaleString()} ${badge}</div></div>${alertHtml}`;
        container.appendChild(div);
    });
    if(filtered.length>4 && !showAll) seeMoreBtn.classList.remove('hidden'); else seeMoreBtn.classList.add('hidden');
}

function showAllProfiles() { showAll = true; filterHomeList(); }
function handleAddTransaction(e) {
    e.preventDefault();
    if(!activeBorrowerId) return;
    const idx = borrowers.findIndex(b=>b.id===activeBorrowerId);
    const amt = parseFloat(document.getElementById('t_amount').value);
    const type = document.getElementById('t_type').value;
    const note = document.getElementById('t_notes').value;
    if(!borrowers[idx].transactions) borrowers[idx].transactions = [];
    borrowers[idx].transactions.push({ type, amount: amt, notes: note, date: new Date().toISOString() });
    borrowers[idx].lastUpdated = new Date().toISOString();
    document.getElementById('t_amount').value=''; document.getElementById('t_notes').value='';
    safeSave(); openDetails(activeBorrowerId);
    if(type==='Payment') {
        const b = borrowers[idx];
        document.getElementById('r_date').innerText=new Date().toLocaleDateString();
        document.getElementById('r_name').innerText=b.name;
        document.getElementById('r_amount').innerText='₱'+amt.toLocaleString();
        document.getElementById('r_balance').innerText='₱'+getBal(b).toLocaleString();
        closeModal('detailsModal'); openModal('receiptModal');
    }
}
function closeReceipt() { closeModal('receiptModal'); }
function openDetails(id) {
    activeBorrowerId = id; const b = borrowers.find(x=>x.id===id);
    document.getElementById('d_name').innerText = b.name;
    document.getElementById('d_phone').innerText = b.phone;
    document.getElementById('d_avatar').src = b.photo || `https://ui-avatars.com/api/?background=random&name=${encodeURIComponent(b.name)}`;
    document.getElementById('d_balance').innerText = '₱'+getBal(b).toLocaleString();
    document.getElementById('aiAnalysisResult').style.display='none';
    const tbody = document.querySelector('#historyTable tbody'); tbody.innerHTML='';
    (b.transactions||[]).slice().reverse().forEach(t=>{ tbody.innerHTML+=`<tr><td>${new Date(t.date).toLocaleDateString()}</td><td>${t.type}</td><td style="font-size:0.8rem">${t.notes}</td><td class="${t.type==='Payment'?'amount-pos':'amount-neg'}">${t.type==='Payment'?'-':'+'}${t.amount}</td></tr>`; });
    openModal('detailsModal');
}
function switchView(v, el) {
    document.querySelectorAll('.view-section').forEach(e=>e.classList.remove('active'));
    document.getElementById('view-'+v).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(e=>e.classList.remove('active'));
    el.classList.add('active');
    if(v!=='home') { showAll=false; filterHomeList(); }
}
function switchTutTab(id, el) {
    document.querySelectorAll('.tut-content').forEach(c=>c.classList.remove('active'));
    document.getElementById('tut-'+id).classList.add('active');
    document.querySelectorAll('.tut-tab').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function openProfileModal() { openModal('profileModal'); document.getElementById('profileForm').reset(); document.getElementById('p_id').value=''; document.getElementById('p_preview').style.display='none'; }
function handleImageUpload(i) {
    if(i.files[0]) { const r=new FileReader(); r.onload=e=>{ const img=new Image(); img.onload=()=>{ const c=document.createElement('canvas'); const ctx=c.getContext('2d'); let w=img.width,h=img.height; if(w>250){h*=250/w;w=250;} c.width=w;c.height=h; ctx.drawImage(img,0,0,w,h); const d=c.toDataURL('image/jpeg',0.5); document.getElementById('p_preview').src=d; document.getElementById('p_preview').style.display='block'; document.getElementById('p_photo_base64').value=d; }; img.src=e.target.result; }; r.readAsDataURL(i.files[0]); }
}
function handleSaveProfile(e) {
    e.preventDefault(); const id=document.getElementById('p_id').value||Date.now().toString(); const isNew=!document.getElementById('p_id').value;
    let tx=[]; if(!isNew) { const old=borrowers.find(b=>b.id===id); if(old) tx=old.transactions; }
    const data={ id, name:document.getElementById('p_name').value, phone:document.getElementById('p_phone').value, address:document.getElementById('p_address').value, age:document.getElementById('p_age').value, terms:document.getElementById('p_terms').value, dueDate:document.getElementById('p_dueDate').value, photo:document.getElementById('p_photo_base64').value, transactions:tx, lastUpdated:new Date().toISOString() };
    if(isNew) borrowers.push(data); else { const idx=borrowers.findIndex(b=>b.id===id); if(idx!==-1) borrowers[idx]=data; }
    safeSave(); closeModal('profileModal'); if(!isNew && activeBorrowerId===id) openDetails(id);
}
async function callGemini(p) { return null; }
async function generateAISMS() { calculateSMS(); }
async function analyzeBorrower() { alert("AI requires internet."); }
function openSMS(id) { activeSMSId=id; const b=borrowers.find(x=>x.id===id); document.getElementById('s_name').innerText=b.name; document.getElementById('s_balance').value=getBal(b); calculateSMS(); openModal('smsModal'); }
function calculateSMS() {
    const b = borrowers.find(x=>x.id===activeSMSId);
    const bal = parseFloat(document.getElementById('s_balance').value);
    const pen = parseFloat(document.getElementById('s_penalty').value)||0;
    const tot = bal+(bal*(pen/100));
    document.getElementById('s_total').value = '₱'+tot.toLocaleString();
    document.getElementById('s_message').value = `Hi ${b.name}, Balance: ₱${bal.toLocaleString()}. Total: ₱${tot.toLocaleString()}.`;
}
function safeOpenSMS() {
    const b = borrowers.find(x => x.id === activeSMSId);
    const msg = document.getElementById('s_message').value;
    const phone = b.phone.replace(/[^0-9+]/g,'');
    safeSave(); setTimeout(() => { window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`; }, 200);
}
function copySMS() { navigator.clipboard.writeText(document.getElementById('s_message').value); showToast("Copied!"); }
function updateDashboard() {
    let tr=0, tc=0; borrowers.forEach(b=>{ (b.transactions||[]).forEach(t=>{ if(t.type==='Loan')tr+=t.amount; else{tr-=t.amount;tc+=t.amount;} }); });
    document.getElementById('totalReceivables').innerText = '₱'+tr.toLocaleString(); document.getElementById('totalCollected').innerText = '₱'+tc.toLocaleString();
}
function startClock() { setInterval(() => document.getElementById('liveClock').innerText = new Date().toLocaleTimeString(), 1000); }
function showToast(msg) { const t = document.getElementById('toast'); t.innerText=msg; t.className='show'; setTimeout(()=>t.className='',2000); }
function exportData() { const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(borrowers)); a.download = "backup.json"; a.click(); }
function triggerRestore() { document.getElementById('restoreFile').click(); }
function handleRestore(i) { const r = new FileReader(); r.onload=e=>{ borrowers=JSON.parse(e.target.result); safeSave(); location.reload(); }; r.readAsText(i.files[0]); }
function deleteCurrentProfile() { if(confirm("Delete?")) { borrowers=borrowers.filter(b=>b.id!==activeBorrowerId); safeSave(); closeModal('detailsModal'); } }
function editCurrentProfile() { closeModal('detailsModal'); const b = borrowers.find(x => x.id === activeBorrowerId); document.getElementById('p_id').value = b.id; document.getElementById('p_name').value = b.name; document.getElementById('p_phone').value = b.phone; document.getElementById('p_address').value = b.address; document.getElementById('p_age').value = b.age; document.getElementById('p_terms').value = b.terms; document.getElementById('p_dueDate').value = b.dueDate; document.getElementById('p_photo_base64').value = b.photo||''; openProfileModal(); }
function openTutorialModal() { openModal('tutorialModal'); }

init();
                                                                                                                            
