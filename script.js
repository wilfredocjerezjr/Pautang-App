const app = {
    data: {
        borrowers: [],
        transactions: []
    },
    currentBookTab: 'receipts',
    showingFullList: false,
    activeBorrowerId: null,
    activeLoanId: null, 
    pendingTransType: null,
    tempPhoto: null,
    isEditing: false,
    isAddingLoan: false, 

    init() {
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then(granted => console.log("Persistence Granted:", granted));
        }

        const stored = localStorage.getItem('omega_pautang_db_v5');
        if (stored) {
            this.data = JSON.parse(stored);
            // Migration for legacy data structure
            this.data.borrowers.forEach(b => {
                if (!b.loans) {
                    b.loans = [{
                        id: Date.now() + Math.random(),
                        date: b.date || new Date().toISOString().split('T')[0],
                        principal: b.balance, 
                        terms: b.terms,
                        interestRate: 0,
                        penaltyRate: 0,
                        payments: []
                    }];
                }
            });
        }

        document.getElementById('nb-date').valueAsDate = new Date();
        this.calculateNextDue();

        setInterval(() => {
            document.getElementById('system-time').innerText = new Date().toLocaleTimeString('en-US', { hour12: true });
        }, 1000);

        this.renderHome();
        this.updateStats();
    },

    saveToStorage() {
        try {
            localStorage.setItem('omega_pautang_db_v5', JSON.stringify(this.data));
            this.updateStats();
        } catch (e) {
            alert("Storage Error: Your phone is full. Please clear some space!");
        }
    },

    showToast(msg) {
        const t = document.getElementById('toast');
        t.innerText = msg;
        t.style.opacity = '1';
        setTimeout(() => t.style.opacity = '0', 3500);
    },

    /* --- CALCULATIONS (TIME-TRAVEL LOGIC) --- */
    calculateLoanDetails(loan) {
        const principal = parseFloat(loan.principal) || 0;
        const interestRate = parseFloat(loan.interestRate) || 0;
        const penaltyRate = parseFloat(loan.penaltyRate) || 0;
        
        // Determine Due Date
        const loanDate = new Date(loan.date);
        const dueDate = new Date(loanDate);
        let termDays = 30; // default month
        if (loan.terms === 'daily') termDays = 1;
        if (loan.terms === 'weekly') termDays = 7;
        
        if (loan.terms === 'daily') dueDate.setDate(dueDate.getDate() + 1);
        if (loan.terms === 'weekly') dueDate.setDate(dueDate.getDate() + 7);
        if (loan.terms === 'monthly') dueDate.setMonth(dueDate.getMonth() + 1);
        
        // Check Overdue and Days Elapsed
        const today = new Date();
        today.setHours(0,0,0,0);
        dueDate.setHours(0,0,0,0);
        
        const timeDiff = today - loanDate;
        const daysElapsed = Math.ceil(timeDiff / (1000 * 3600 * 24));
        const safeDays = daysElapsed > 0 ? daysElapsed : 0;
        
        const isOverdue = today > dueDate;

        // Calculate Amounts: Interest accrues based on Time Elapsed / Term
        const interestAmt = (principal * (interestRate/100)) * (safeDays / termDays);
        
        let penaltyAmt = 0;
        if (safeDays > termDays) {
            const overdueDays = safeDays - termDays;
            penaltyAmt = (principal * (penaltyRate/100)) * overdueDays;
        }

        const totalDue = principal + interestAmt + penaltyAmt;
        
        // Calculate Paid
        const totalPaid = (loan.payments || []).reduce((sum, p) => sum + p.amount, 0);
        const remaining = totalDue - totalPaid;

        return {
            dueDateStr: dueDate.toISOString().split('T')[0],
            isOverdue,
            interestAmt,
            penaltyAmt,
            totalDue,
            totalPaid,
            remaining: remaining > 0 ? remaining : 0 
        };
    },

    getBorrowerTotalBalance(b) {
        return b.loans.reduce((sum, loan) => sum + this.calculateLoanDetails(loan).remaining, 0);
    },

    /* --- HOME & LIST LOGIC --- */
    renderHome() {
        const list = document.getElementById('borrower-list');
        const empty = document.getElementById('empty-state');
        const filter = document.getElementById('filter-select').value;
        const search = document.getElementById('search-input').value.toLowerCase();
        const seeMoreBtn = document.getElementById('btn-see-more');
        const listTitle = document.getElementById('home-list-title');

        list.innerHTML = '';
        
        if (this.data.borrowers.length === 0) {
            empty.style.display = 'block'; list.style.display = 'none'; seeMoreBtn.style.display = 'none';
            return;
        }

        empty.style.display = 'none'; list.style.display = 'block';

        let processedList = this.data.borrowers.map(b => {
            const totalBalance = this.getBorrowerTotalBalance(b);
            let urgency = 3;
            let nextDueStr = "No active loans";
            let minDiff = 999;

            b.loans.forEach(loan => {
                const details = this.calculateLoanDetails(loan);
                if (details.remaining > 0) {
                    const diffDays = Math.ceil((new Date(details.dueDateStr) - new Date().setHours(0,0,0,0)) / (86400000));
                    if (diffDays < minDiff) {
                        minDiff = diffDays;
                        nextDueStr = details.dueDateStr;
                    }
                    if (diffDays < 0) urgency = 1; // Late
                    else if (diffDays <= 3 && urgency > 2) urgency = 2; // Near
                }
            });

            if (totalBalance === 0) urgency = 4; // Paid

            return { ...b, totalBalance, urgency, nextDue: nextDueStr, diffDays: minDiff };
        });

        // Filtering
        processedList = processedList.filter(b => {
            if (filter === 'active' && b.totalBalance <= 0) return false;
            if (filter === 'paid' && b.totalBalance > 0) return false;
            if (!b.name.toLowerCase().includes(search)) return false;
            return true;
        });

        processedList.sort((a, b) => (a.urgency - b.urgency) || (a.diffDays - b.diffDays));

        const criticalCount = processedList.filter(b => b.urgency <= 2).length;
        const badge = document.getElementById('notif-count');
        badge.innerText = criticalCount;
        badge.style.display = criticalCount > 0 ? 'flex' : 'none';

        let displayList = processedList;
        if (!this.showingFullList && processedList.length > 4) {
            displayList = processedList.slice(0, 4);
            seeMoreBtn.style.display = 'block';
            listTitle.innerText = "PRIORITY 4 LIST";
        } else {
            seeMoreBtn.style.display = 'none';
            listTitle.innerText = "ALL BORROWERS";
        }

        displayList.forEach(b => {
            const el = document.createElement('div');
            let priorityClass = '', iconHtml = '', dueText = b.nextDue;
            
            if (b.totalBalance > 0) {
                if (b.urgency === 1) {
                    priorityClass = 'priority-high';
                    iconHtml = `<i class="ph-fill ph-warning text-red alert-icon"></i>`;
                    dueText = `<span class="text-red">LATE (${Math.abs(b.diffDays)} days)</span>`;
                } else if (b.urgency === 2) {
                    priorityClass = 'priority-med';
                    iconHtml = `<i class="ph-fill ph-envelope-simple text-warning alert-icon"></i>`;
                    dueText = `<span class="text-warning">DUE SOON (${b.diffDays} days)</span>`;
                }
            } else {
                dueText = "<span style='color:var(--success)'>Fully Paid</span>";
            }

            el.className = `glass-card borrower-card ${priorityClass}`;
            el.onclick = () => this.openBorrowerDetails(b.id);
            
            let avatarHtml = b.photo ? `<div class="b-avatar" style="background-image: url('${b.photo}')"></div>` : `<div class="b-avatar">${b.name.charAt(0)}</div>`;

            el.innerHTML = `
                <div style="display:flex; align-items:center;">
                    ${avatarHtml}
                    <div>
                        <div style="font-weight:700; font-size:15px; color:var(--text-dark);">${b.name} ${iconHtml}</div>
                        <div style="font-size:11px; color:var(--text-gray);">${dueText}</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:800; font-size:15px; color:${b.totalBalance > 0 ? 'var(--danger)' : 'var(--success)'}">₱${b.totalBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    <div style="font-size:10px; color:var(--text-gray); font-weight:600;">BALANCE</div>
                </div>
            `;
            list.appendChild(el);
        });
    },
               /* --- NAVIGATION & MODALS --- */
    navTo(viewId, btn) {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        document.getElementById('view-' + viewId).classList.add('active');
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('fab').style.display = viewId === 'home' ? 'flex' : 'none';
        if (viewId === 'books') this.setBookTab(this.currentBookTab);
    },

    toggleModal(id, show) {
        const el = document.getElementById(id);
        if (show) el.classList.add('open');
        else el.classList.remove('open');
    },

    showFullList() {
        this.showingFullList = true;
        this.renderHome();
    },

    /* --- BORROWER DETAILS & LOAN LIST --- */
    openBorrowerDetails(id) {
        this.activeBorrowerId = id;
        const b = this.data.borrowers.find(x => x.id === id);
        if (!b) return;

        document.getElementById('bd-name').innerText = b.name;
        const avatarEl = document.getElementById('bd-avatar');
        if (b.photo) {
            avatarEl.innerText = ''; avatarEl.style.backgroundImage = `url('${b.photo}')`;
        } else {
            avatarEl.style.backgroundImage = ''; avatarEl.innerText = b.name.charAt(0);
        }

        const totalBal = this.getBorrowerTotalBalance(b);
        document.getElementById('bd-balance').innerText = '₱' + totalBal.toLocaleString(undefined, {minimumFractionDigits: 2});

        const listEl = document.getElementById('bd-loan-list');
        listEl.innerHTML = '';
        
        const loans = b.loans.sort((l1, l2) => {
            const r1 = this.calculateLoanDetails(l1).remaining;
            const r2 = this.calculateLoanDetails(l2).remaining;
            return r2 - r1; 
        });

        loans.forEach((loan, index) => {
            const details = this.calculateLoanDetails(loan);
            const card = document.createElement('div');
            card.className = 'loan-list-card';
            
            let statusHtml = '';
            if(details.remaining <= 0) statusHtml = `<span class="loan-status status-active" style="background:#e2e8f0; color:#475569;">PAID</span>`;
            else if(details.isOverdue) statusHtml = `<span class="loan-status status-overdue">OVERDUE</span>`;
            else statusHtml = `<span class="loan-status status-active">ACTIVE</span>`;

            const payButtonHtml = details.remaining > 0 
                ? `<button class="btn-pay-small" onclick="app.preparePayLoan(${loan.id})">PAY LOAN</button>`
                : '';

            card.innerHTML = `
                <div class="loan-header">
                    <span style="font-weight:700; font-size:13px; color:var(--text-dark);">Loan #${index+1} (${loan.date})</span>
                    ${statusHtml}
                </div>
                <div class="loan-details">
                    Principal: ₱${parseFloat(loan.principal).toLocaleString()}<br>
                    Interest (${loan.interestRate}%): ₱${details.interestAmt.toLocaleString(undefined, {minimumFractionDigits: 2})}<br>
                    Penalty (${details.isOverdue ? loan.penaltyRate : 0}%): <span style="color:${details.isOverdue?'var(--danger)':'gray'}">₱${details.penaltyAmt.toLocaleString(undefined, {minimumFractionDigits: 2})}</span><br>
                    <strong>Paid: <span style="color:var(--success)">₱${details.totalPaid.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></strong>
                </div>
                <div class="loan-total">
                    Due: ₱${details.remaining.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </div>
                <div class="loan-actions">
                    ${payButtonHtml}
                </div>
            `;
            listEl.appendChild(card);
        });

        this.toggleModal('modal-borrower-details', true);
    },

    /* --- TRANSACTION LOGIC --- */
    prepareTransaction(type) {
        if(type === 'disbursement') {
            this.pendingTransType = 'disbursement';
            this.isAddingLoan = true;
            this.isEditing = false;
            
            document.getElementById('modal-new-borrower-title').innerText = 'Add New Loan';
            const b = this.data.borrowers.find(x => x.id === this.activeBorrowerId);
            const nameInput = document.getElementById('nb-name');
            nameInput.value = b ? b.name : '';
            nameInput.disabled = true;
            
            document.getElementById('nb-amount').value = '';
            document.getElementById('nb-interest').value = '5';
            document.getElementById('nb-penalty').value = '2';
            document.getElementById('nb-date').valueAsDate = new Date();
            
            document.getElementById('group-amount').style.display = 'block';
            document.getElementById('group-rates').style.display = 'grid';
            document.getElementById('group-date').style.display = 'block';
            document.getElementById('group-nextdue').style.display = 'block';
            
            this.toggleModal('modal-borrower-details', false);
            this.toggleModal('modal-new-borrower', true);
            this.calculateNextDue();
            return;
        }
    },

    preparePayLoan(loanId) {
        this.activeLoanId = loanId;
        this.pendingTransType = 'receipt';
        document.getElementById('transact-title').innerText = 'Pay Specific Loan';
        document.getElementById('transact-amount').value = '';
        this.toggleModal('modal-transact', true);
    },

    executeTransaction() {
        const amtVal = parseFloat(document.getElementById('transact-amount').value);
        if (!amtVal || amtVal <= 0) return alert("Invalid amount");

        const b = this.data.borrowers.find(x => x.id === this.activeBorrowerId);
        
        if (this.pendingTransType === 'receipt') {
            const loan = b.loans.find(l => l.id === this.activeLoanId);
            if(loan) {
                if(!loan.payments) loan.payments = [];
                loan.payments.push({ date: new Date().toISOString().split('T')[0], amount: amtVal });
                
                const ref = 'OR-' + Math.floor(Math.random() * 10000);
                this.data.transactions.push({
                    date: new Date().toISOString().split('T')[0],
                    payer: b.name,
                    ref: ref,
                    amount: amtVal,
                    type: 'receipt'
                });

                this.showReceipt(b.name, amtVal, ref, this.getBorrowerTotalBalance(b) - amtVal);
            }
        } else {
            // New Loan logic handled in saveBorrower now
        }

        this.saveToStorage();
        this.toggleModal('modal-transact', false);
        this.openBorrowerDetails(this.activeBorrowerId);
        this.renderHome();
    },

    showReceipt(name, amount, ref, remaining) {
        const now = new Date();
        document.getElementById('rcpt-amount').innerText = '₱' + amount.toLocaleString(undefined, {minimumFractionDigits: 2});
        document.getElementById('rcpt-date').innerText = now.toLocaleDateString();
        document.getElementById('rcpt-time').innerText = now.toLocaleTimeString();
        document.getElementById('rcpt-name').innerText = name;
        document.getElementById('rcpt-ref').innerText = ref;
        document.getElementById('rcpt-bal').innerText = '₱' + remaining.toLocaleString(undefined, {minimumFractionDigits: 2});
        this.toggleModal('modal-receipt', true);
    },

    /* --- NEW/EDIT BORROWER LOGIC --- */
    openCreateModal() {
        this.isEditing = false;
        this.isAddingLoan = false;
        this.activeBorrowerId = null;
        
        document.getElementById('modal-new-borrower-title').innerText = 'New Borrower / Loan';
        const nameInput = document.getElementById('nb-name');
        nameInput.value = '';
        nameInput.disabled = false;
        
        document.getElementById('nb-mobile').value = '';
        document.getElementById('nb-amount').value = '';
        document.getElementById('nb-interest').value = '5';
        document.getElementById('nb-penalty').value = '2';
        
        document.getElementById('group-amount').style.display = 'block';
        document.getElementById('group-rates').style.display = 'grid';
        document.getElementById('group-date').style.display = 'block';
        document.getElementById('group-nextdue').style.display = 'block';
        
        document.getElementById('nb-photo-preview').style.backgroundImage = '';
        this.tempPhoto = null;
        this.toggleModal('modal-new-borrower', true);
        this.calculateNextDue();
    },

    editBorrower() {
        const b = this.data.borrowers.find(x => x.id === this.activeBorrowerId);
        if (!b) return;
        this.isEditing = true;
        this.isAddingLoan = false;
        
        document.getElementById('modal-new-borrower-title').innerText = 'Edit Profile Info';
        const nameInput = document.getElementById('nb-name');
        nameInput.value = b.name;
        nameInput.disabled = false;
        document.getElementById('nb-mobile').value = b.mobile || '';
        
        document.getElementById('group-amount').style.display = 'none';
        document.getElementById('group-rates').style.display = 'none';
        document.getElementById('group-date').style.display = 'none';
        document.getElementById('group-nextdue').style.display = 'none';

        if (b.photo) document.getElementById('nb-photo-preview').style.backgroundImage = `url('${b.photo}')`;
        
        this.toggleModal('modal-borrower-details', false);
        this.toggleModal('modal-new-borrower', true);
    },

    handleImageUpload(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.tempPhoto = e.target.result;
                document.getElementById('nb-photo-preview').style.backgroundImage = `url('${e.target.result}')`;
            };
            reader.readAsDataURL(input.files[0]);
        }
    },
    
    calculateNextDue() {
        const dateVal = document.getElementById('nb-date').value;
        const term = document.getElementById('nb-terms').value;
        if (!dateVal) return;
        const date = new Date(dateVal);
        if (term === 'daily') date.setDate(date.getDate() + 1);
        if (term === 'weekly') date.setDate(date.getDate() + 7);
        if (term === 'monthly') date.setMonth(date.getMonth() + 1);
        document.getElementById('nb-nextdue').value = date.toISOString().split('T')[0];
    },

    saveBorrower() {
        const name = document.getElementById('nb-name').value;
        if (!name) return alert('Name is required');

        // CASE 1: ADDING A NEW LOAN
        if (this.isAddingLoan && this.activeBorrowerId) {
            const b = this.data.borrowers.find(x => x.id === this.activeBorrowerId);
            if (b) {
                const amt = parseFloat(document.getElementById('nb-amount').value);
                if(amt > 0) {
                        b.loans.push({
                        id: Date.now(),
                        date: document.getElementById('nb-date').value,
                        principal: amt,
                        terms: document.getElementById('nb-terms').value,
                        interestRate: document.getElementById('nb-interest').value,
                        penaltyRate: document.getElementById('nb-penalty').value,
                        payments: []
                    });
                    this.data.transactions.push({
                        date: new Date().toISOString().split('T')[0],
                        payer: name,
                        ref: 'LN-' + Math.floor(Math.random() * 1000),
                        amount: amt,
                        type: 'disbursement'
                    });
                    this.saveToStorage();
                    this.toggleModal('modal-new-borrower', false);
                    this.openBorrowerDetails(this.activeBorrowerId);
                    this.renderHome();
                    this.showToast("Loan Added Successfully.");
                } else {
                    alert("Please enter a valid loan amount.");
                }
            }
        } 
        // CASE 2: EDITING PROFILE
        else if (this.isEditing && this.activeBorrowerId) {
            const b = this.data.borrowers.find(x => x.id === this.activeBorrowerId);
            if (b) {
                b.name = name;
                b.mobile = document.getElementById('nb-mobile').value;
                if (this.tempPhoto) b.photo = this.tempPhoto;
                this.saveToStorage();
                this.toggleModal('modal-new-borrower', false);
                this.openBorrowerDetails(this.activeBorrowerId);
                this.renderHome();
                this.showToast("Profile Updated.");
            }
        } 
        // CASE 3: NEW BORROWER
        else {
            const amt = parseFloat(document.getElementById('nb-amount').value) || 0;
            const newB = {
                id: Date.now(),
                name: name,
                mobile: document.getElementById('nb-mobile').value,
                photo: this.tempPhoto || null,
                loans: []
            };
            if (amt > 0) {
                newB.loans.push({
                    id: Date.now() + 1,
                    date: document.getElementById('nb-date').value,
                    principal: amt,
                    terms: document.getElementById('nb-terms').value,
                    interestRate: document.getElementById('nb-interest').value,
                    penaltyRate: document.getElementById('nb-penalty').value,
                    payments: []
                });
                this.data.transactions.push({
                    date: new Date().toISOString().split('T')[0],
                    payer: name,
                    ref: 'LN-' + Math.floor(Math.random() * 1000),
                    amount: amt,
                    type: 'disbursement'
                });
            }
            this.data.borrowers.push(newB);
            this.saveToStorage();
            this.toggleModal('modal-new-borrower', false);
            this.renderHome();
            this.showToast("Profile Created.");
        }
    },

    deleteBorrower() {
        this.toggleModal('modal-delete-confirm', true);
    },

    executeDelete() {
        this.data.borrowers = this.data.borrowers.filter(b => b.id != this.activeBorrowerId);
        this.saveToStorage();
        this.toggleModal('modal-delete-confirm', false);
        this.toggleModal('modal-borrower-details', false);
        this.renderHome();
        this.showToast("Profile Deleted.");
    },

    /* --- BOOKS, EXPORT, CALC --- */
    setBookTab(tab) {
        this.currentBookTab = tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const btns = Array.from(document.querySelectorAll('.tab-btn'));
        if(tab === 'receipts') btns[0].classList.add('active');
        if(tab === 'disbursements') btns[1].classList.add('active');
        if(tab === 'general') btns[2].classList.add('active');
        this.renderBooks();
    },

    renderBooks() {
        const tbody = document.getElementById('books-table-body');
        tbody.innerHTML = '';
        let list = this.data.transactions;
        if (this.currentBookTab === 'receipts') list = list.filter(t => t.type === 'receipt');
        if (this.currentBookTab === 'disbursements') list = list.filter(t => t.type === 'disbursement');
        list.sort((a,b) => new Date(b.date) - new Date(a.date));

        list.forEach(t => {
            const row = document.createElement('div');
            row.className = 'book-row';
            const color = t.type === 'receipt' ? 'var(--success)' : 'var(--danger)';
            row.innerHTML = `<div>${t.date}</div><div>${t.payer}</div><div>${t.ref}</div><div style="font-weight:700; color:${color}">₱${t.amount.toLocaleString()}</div>`;
            tbody.appendChild(row);
        });
    },

    updateStats() {
        let totalRec = 0;
        this.data.borrowers.forEach(b => totalRec += this.getBorrowerTotalBalance(b));
        const collected = this.data.transactions.filter(t => t.type === 'receipt').reduce((acc, t) => acc + t.amount, 0);
        document.getElementById('dash-receivables').innerText = '₱' + totalRec.toLocaleString(undefined, {minimumFractionDigits: 2});
        document.getElementById('dash-collected').innerText = '₱' + collected.toLocaleString(undefined, {minimumFractionDigits: 2});
    },

    exportBackup() {
        try {
            const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Pautang_Backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } catch (e) { alert("Backup Error"); }
    },

    importBackup(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.data = JSON.parse(e.target.result);
                this.saveToStorage();
                alert("Restored!");
                location.reload();
            } catch(err) { alert("Invalid File"); }
        };
        reader.readAsText(file);
    },

    exportCSV() {
        try {
            let csv = "Date,Name,Reference,Type,Amount\n";
            this.data.transactions.forEach(t => csv += `${t.date},${t.payer},${t.ref},${t.type},${t.amount}\n`);
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "records.csv";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } catch(e) {}
    },
    
    runCalculator() {
        const p = parseFloat(document.getElementById('calc-p').value) || 0;
        const r = parseFloat(document.getElementById('calc-r').value) || 0;
        const d = parseFloat(document.getElementById('calc-d').value) || 0;
        const interest = (p * (r / 100)) * (d / 30);
        document.getElementById('calc-result-interest').innerText = "₱" + interest.toLocaleString(undefined, {minimumFractionDigits: 2});
        document.getElementById('calc-result-total').innerText = "₱" + (p + interest).toLocaleString(undefined, {minimumFractionDigits: 2});
    }
};

window.onload = () => app.init();
                
