// ============================================================
//  LendTrack — App Logic (Firebase Auth + Firestore edition)
// ============================================================

class MoneyTrackerApp {
    constructor() {
        this.records = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.currentUser  = null;
        this.unsubscribeFirestore = null; // real-time listener cleanup
        this.autoRemindEnabled = localStorage.getItem('lendtrack_autoremind') !== 'false';

        this.initElements();
        this.initTheme();
        this.bindEvents(); // Bind events once on load to prevent duplicate listeners
        this.initAuth();
    }

    // =========================================================
    //  AUTH
    // =========================================================

    initAuth() {
        auth.onAuthStateChanged(user => {
            if (user) {
                this.currentUser = user;
                this.showApp(user);
            } else {
                this.currentUser = null;
                this.showLoginScreen();
            }
        });

        const signInBtn = document.getElementById('googleSignInBtn');
        if (signInBtn) {
            signInBtn.addEventListener('click', () => this.signInWithGoogle());
        }
    }

    async signInWithGoogle() {
        try {
            const signInBtn = document.getElementById('googleSignInBtn');
            if (signInBtn) signInBtn.disabled = true;
            await auth.signInWithPopup(googleProvider);
            // onAuthStateChanged will handle the rest
        } catch (err) {
            const errEl = document.getElementById('loginError');
            if (errEl) {
                errEl.textContent = 'Sign-in failed: ' + err.message;
                errEl.style.display = 'block';
            }
            const signInBtn = document.getElementById('googleSignInBtn');
            if (signInBtn) signInBtn.disabled = false;
        }
    }

    signOut() {
        if (this.unsubscribeFirestore) this.unsubscribeFirestore();
        auth.signOut();
    }

    showLoginScreen() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appShell').style.display = 'none';
    }

    showApp(user) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appShell').style.display = 'block';

        // Fill user chip
        const avatar = document.getElementById('userAvatar');
        const nameEl = document.getElementById('userName');
        if (avatar && user.photoURL) avatar.src = user.photoURL;
        if (nameEl) nameEl.textContent = user.displayName ? user.displayName.split(' ')[0] : user.email;

        this.updateAutoRemindUI();

        // Migrate any old localStorage data and load from Firestore
        this.migrateLocalStorage();
        this.subscribeToRecords();

        // Auto-send check every 60 seconds
        // Clear any existing interval to prevent duplicates
        if (this.autoRemindInterval) clearInterval(this.autoRemindInterval);
        this.autoRemindInterval = setInterval(() => this.checkAndAutoSendReminders(), 60000);
    }

    // =========================================================
    //  FIRESTORE
    // =========================================================

    recordsCollection() {
        return db.collection('users').doc(this.currentUser.uid).collection('records');
    }

    subscribeToRecords() {
        const loadingEl = document.getElementById('firestoreLoading');
        if (loadingEl) loadingEl.style.display = 'flex';

        if (this.unsubscribeFirestore) this.unsubscribeFirestore();

        this.unsubscribeFirestore = this.recordsCollection()
            .orderBy('createdAt', 'desc')
            .onSnapshot(snapshot => {
                if (loadingEl) loadingEl.style.display = 'none';
                this.records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.checkOverdue();
                this.checkAndAutoSendReminders();
                this.render();
                this.renderHistory();
            }, err => {
                if (loadingEl) loadingEl.style.display = 'none';
                console.error('Firestore error:', err);
                this.showToast('Could not sync data. Check connection.', 'error');
            });
    }

    async saveRecordToFirestore(record) {
        const { id, ...data } = record;
        data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        if (!data.createdAt) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await this.recordsCollection().doc(id).set(data, { merge: true });
    }

    async deleteRecordFromFirestore(id) {
        await this.recordsCollection().doc(id).delete();
    }

    // Migrate old localStorage data to Firestore on first sign-in
    async migrateLocalStorage() {
        const old = JSON.parse(localStorage.getItem('moneyTrackerRecords') || '[]');
        if (!old.length) return;

        const batch = db.batch();
        old.forEach(r => {
            const ref = this.recordsCollection().doc(r.id || Date.now().toString());
            const { id, ...data } = r;
            data.createdAt = data.createdAt || firebase.firestore.FieldValue.serverTimestamp();
            data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            batch.set(ref, data, { merge: true });
        });
        await batch.commit();
        localStorage.removeItem('moneyTrackerRecords');
        this.showToast(`✅ Migrated ${old.length} existing record(s) to cloud!`, 'success');
    }

    // =========================================================
    //  INIT ELEMENTS
    // =========================================================

    initElements() {
        this.modal          = document.getElementById('modal');
        this.modalTitle     = document.getElementById('modalTitle');
        this.lendingForm    = document.getElementById('lendingForm');
        this.closeModalBtn  = document.getElementById('closeModal');
        this.addBtn         = document.getElementById('addBtn');

        this.personName  = document.getElementById('personName');
        this.personPhone = document.getElementById('personPhone');
        this.lendAmount  = document.getElementById('lendAmount');
        this.dateLent    = document.getElementById('dateLent');
        this.repayDate   = document.getElementById('repayDate');
        this.notes       = document.getElementById('notes');
        this.recordId    = document.getElementById('recordId');

        this.personPhoto   = document.getElementById('personPhoto');
        this.photoData     = document.getElementById('photoData');
        this.photoPreview  = document.getElementById('photoPreview');
        this.removePhotoBtn = document.getElementById('removePhotoBtn');

        this.totalLentEl      = document.getElementById('totalLent');
        this.totalRecoveredEl = document.getElementById('totalRecovered');
        this.totalPendingEl   = document.getElementById('totalPending');
        this.overdueCountEl   = document.getElementById('overdueCount');

        this.borrowersList       = document.getElementById('borrowersList');
        this.searchInput         = document.getElementById('searchInput');
        this.filterBtnsContainer = document.getElementById('filterBtns');
        this.emptyState          = document.getElementById('emptyState');

        this.toastContainer = document.getElementById('toastContainer');

        this.confirmModal   = document.getElementById('confirmModal');
        this.confirmMessage = document.getElementById('confirmMessage');
        this.confirmYesBtn  = document.getElementById('confirmYes');
        this.confirmNoBtn   = document.getElementById('confirmNo');

        this.themeToggleBtn     = document.getElementById('themeToggleBtn');
        this.iconSun            = document.querySelector('.icon-sun');
        this.iconMoon           = document.querySelector('.icon-moon');
        this.autoRemindToggleBtn = document.getElementById('autoRemindToggleBtn');
        this.autoRemindStatusText = document.getElementById('autoRemindStatusText');

        this.imageViewerModal   = document.getElementById('imageViewerModal');
        this.viewerImage        = document.getElementById('viewerImage');
        this.closeImageViewerBtn = document.getElementById('closeImageViewer');

        const today = new Date().toISOString().split('T')[0];
        if (this.dateLent) this.dateLent.value = today;
    }

    // =========================================================
    //  THEME
    // =========================================================

    initTheme() {
        this.theme = localStorage.getItem('lendtrack_theme') || 'dark';
        if (this.theme === 'light') {
            document.body.classList.add('light-theme');
            if (this.iconSun)  this.iconSun.style.display = 'block';
            if (this.iconMoon) this.iconMoon.style.display = 'none';
        } else {
            if (this.iconSun)  this.iconSun.style.display = 'none';
            if (this.iconMoon) this.iconMoon.style.display = 'block';
        }
    }

    toggleTheme() {
        if (document.body.classList.contains('light-theme')) {
            document.body.classList.remove('light-theme');
            if (this.iconSun)  this.iconSun.style.display = 'none';
            if (this.iconMoon) this.iconMoon.style.display = 'block';
            localStorage.setItem('lendtrack_theme', 'dark');
            this.theme = 'dark';
        } else {
            document.body.classList.add('light-theme');
            if (this.iconSun)  this.iconSun.style.display = 'block';
            if (this.iconMoon) this.iconMoon.style.display = 'none';
            localStorage.setItem('lendtrack_theme', 'light');
            this.theme = 'light';
        }
    }

    // =========================================================
    //  BIND EVENTS
    // =========================================================

    bindEvents() {
        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        }
        if (this.autoRemindToggleBtn) {
            this.autoRemindToggleBtn.addEventListener('click', () => this.toggleAutoRemind());
        }

        // Sign out
        const signOutBtn = document.getElementById('signOutBtn');
        if (signOutBtn) signOutBtn.addEventListener('click', () => this.signOut());

        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.getAttribute('data-tab')));
        });

        // Export button
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportHistoryCSV());

        if (this.addBtn) this.addBtn.addEventListener('click', () => this.openModal());

        const addBtnEmpty = document.getElementById('addBtnEmpty');
        if (addBtnEmpty) addBtnEmpty.addEventListener('click', () => this.openModal());

        const remindAllBtn = document.getElementById('remindAllBtn');
        if (remindAllBtn) remindAllBtn.addEventListener('click', () => this.sendReminderToAll());

        if (this.closeModalBtn) this.closeModalBtn.addEventListener('click', () => this.closeModal());

        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeModal());

        if (this.modal) {
            this.modal.addEventListener('click', e => { if (e.target === this.modal) this.closeModal(); });
        }
        if (this.confirmModal) {
            this.confirmModal.addEventListener('click', e => { if (e.target === this.confirmModal) this.closeConfirmModal(); });
        }
        
        // Payment modal events
        const closePaymentModalBtn = document.getElementById('closePaymentModal');
        if (closePaymentModalBtn) closePaymentModalBtn.addEventListener('click', () => this.closePaymentModal());
        
        const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
        if (cancelPaymentBtn) cancelPaymentBtn.addEventListener('click', () => this.closePaymentModal());
        
        const savePaymentBtn = document.getElementById('savePaymentBtn');
        if (savePaymentBtn) savePaymentBtn.addEventListener('click', () => this.handleSavePayment());
        
        const paymentModal = document.getElementById('paymentModal');
        if (paymentModal) {
            paymentModal.addEventListener('click', e => { if (e.target === paymentModal) this.closePaymentModal(); });
        }

        if (this.closeImageViewerBtn) {
            this.closeImageViewerBtn.addEventListener('click', () => this.closeImageViewer());
        }
        if (this.imageViewerModal) {
            this.imageViewerModal.addEventListener('click', e => { if (e.target === this.imageViewerModal) this.closeImageViewer(); });
        }
        if (this.lendingForm) {
            this.lendingForm.addEventListener('submit', e => this.handleFormSubmit(e));
        }
        if (this.photoPreview) {
            this.photoPreview.addEventListener('click', () => { if (this.personPhoto) this.personPhoto.click(); });
        }
        if (this.personPhoto) {
            this.personPhoto.addEventListener('change', e => this.handlePhotoUpload(e));
        }
        if (this.removePhotoBtn) {
            this.removePhotoBtn.addEventListener('click', () => this.clearPhoto());
        }
        if (this.searchInput) {
            this.searchInput.addEventListener('input', e => {
                this.searchQuery = e.target.value.toLowerCase();
                this.render();
            });
        }
        if (this.filterBtnsContainer) {
            this.filterBtnsContainer.addEventListener('click', e => {
                const btn = e.target.closest('button[data-filter]');
                if (!btn) return;
                Array.from(this.filterBtnsContainer.children).forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.getAttribute('data-filter');
                this.render();
            });
        }
        if (this.borrowersList) {
            this.borrowersList.addEventListener('click', e => this.handleCardActions(e));
        }
        if (this.confirmNoBtn) {
            this.confirmNoBtn.addEventListener('click', () => this.closeConfirmModal());
        }
    }

    // =========================================================
    //  TAB NAVIGATION
    // =========================================================

    switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');

        document.getElementById('tabTracker').style.display = tab === 'tracker' ? 'block' : 'none';
        document.getElementById('tabHistory').style.display  = tab === 'history'  ? 'block' : 'none';

        if (tab === 'history') this.renderHistory();
    }

    // =========================================================
    //  OVERDUE CHECK
    // =========================================================

    checkOverdue() {
        const today = new Date();
        today.setHours(0,0,0,0);
        let changed = false;

        this.records.forEach(record => {
            if (record.status === 'pending') {
                const repay = new Date(record.repayDate);
                repay.setHours(0,0,0,0);
                if (repay < today) {
                    record.status = 'overdue';
                    changed = true;
                }
            }
        });

        // Persist status changes for overdue records
        if (changed) {
            this.records.filter(r => r.status === 'overdue').forEach(r => {
                this.saveRecordToFirestore(r).catch(console.error);
            });
        }
    }

    // =========================================================
    //  MODAL (Add / Edit)
    // =========================================================

    openModal(record = null) {
        if (record) {
            this.modalTitle.textContent = 'Edit Record';
            this.recordId.value  = record.id;
            this.personName.value  = record.name;
            this.personPhone.value = record.phone;
            this.lendAmount.value  = record.amount;
            this.dateLent.value    = record.dateLent;
            this.repayDate.value   = record.repayDate;
            this.notes.value       = record.notes || '';
            if (record.photo) {
                this.photoData.value = record.photo;
                this.photoPreview.innerHTML = `<img src="${record.photo}" alt="Preview">`;
                this.removePhotoBtn.style.display = 'inline-block';
            } else {
                this.clearPhoto();
            }
        } else {
            this.modalTitle.textContent = 'Add New Lending Record';
            this.lendingForm.reset();
            this.recordId.value = '';
            this.dateLent.value = new Date().toISOString().split('T')[0];
            this.clearPhoto();
        }
        this.modal.classList.add('active');
        this.modal.style.display = 'flex';
    }

    closeModal() {
        this.modal.classList.remove('active');
        this.modal.style.display = 'none';
        this.lendingForm.reset();
        this.clearPhoto();
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        const submitBtn = this.lendingForm.querySelector('button[type="submit"]');
        let originalBtnHtml = '';
        if (submitBtn) {
            originalBtnHtml = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Saving...</span>';
        }

        const id = this.recordId.value || Date.now().toString();
        const existing = this.records.find(r => r.id === id);

        const newRecord = {
            id,
            name:      this.personName.value.trim(),
            phone:     this.personPhone.value.trim(),
            amount:    parseFloat(this.lendAmount.value),
            dateLent:  this.dateLent.value,
            repayDate: this.repayDate.value,
            notes:     this.notes.value.trim(),
            photo:     this.photoData.value || null,
            status:    existing ? existing.status : 'pending',
            datePaid:  existing ? (existing.datePaid || null) : null,
            lastAutoRemindedDate: existing ? (existing.lastAutoRemindedDate || null) : null,
            amountPaid: existing ? (existing.amountPaid || 0) : 0
        };

        try {
            await this.saveRecordToFirestore(newRecord);
            this.showToast(existing ? 'Record updated ✅' : 'New record added ✅', 'success');
            this.closeModal(); // Close only on success
        } catch (err) {
            this.showToast('Save failed: ' + err.message, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
            }
        }
    }

    // =========================================================
    //  PHOTO
    // =========================================================

    handlePhotoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 300;
                let { width, height } = img;
                if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX; } }
                else { if (height > MAX) { width *= MAX / height; height = MAX; } }
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                if (this.photoData)    this.photoData.value = dataUrl;
                if (this.photoPreview) this.photoPreview.innerHTML = `<img src="${dataUrl}" alt="Preview">`;
                if (this.removePhotoBtn) this.removePhotoBtn.style.display = 'inline-block';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    clearPhoto() {
        if (this.personPhoto)  this.personPhoto.value = '';
        if (this.photoData)    this.photoData.value = '';
        if (this.photoPreview) {
            this.photoPreview.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                </svg>
                <span>Tap to take/choose photo</span>
            `;
        }
        if (this.removePhotoBtn) this.removePhotoBtn.style.display = 'none';
    }

    // =========================================================
    //  CARD ACTIONS
    // =========================================================

    handleCardActions(e) {
        const card = e.target.closest('.borrower-card');
        if (!card) return;
        const id = card.getAttribute('data-id');
        const record = this.records.find(r => r.id === id);
        if (!record) return;

        if (e.target.classList.contains('borrower-avatar')) {
            this.openImageViewer(record.photo);
            return;
        }
        if (e.target.closest('.edit-btn')) {
            this.openModal(record);
        } else if (e.target.closest('.delete-btn')) {
            this.openConfirmModal('Are you sure you want to delete this record? (It will still appear in History)', async () => {
                try {
                    // Soft delete: keep in history, remove from main views
                    record.status = 'deleted';
                    await this.saveRecordToFirestore(record);
                    this.showToast('Record deleted (Moved to History)', 'success');
                } catch (err) {
                    this.showToast('Delete failed: ' + err.message, 'error');
                }
            });
        } else if (e.target.closest('.mark-paid-btn')) {
            this.openPaymentModal(record);
        } else if (e.target.closest('.remind-btn')) {
            this.sendReminder(record);
        }
    }

    // =========================================================
    //  PAYMENT MODAL
    // =========================================================

    openPaymentModal(record) {
        this.currentPaymentRecord = record;
        const remaining = record.amount - (record.amountPaid || 0);
        
        const modal = document.getElementById('paymentModal');
        const amountInput = document.getElementById('paymentAmount');
        const remainingText = document.getElementById('paymentRemainingText');
        
        if (remainingText) remainingText.textContent = this.formatCurrency(remaining);
        if (amountInput) amountInput.value = remaining; // Default to full remaining
        
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
    }

    closePaymentModal() {
        const modal = document.getElementById('paymentModal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
        this.currentPaymentRecord = null;
    }

    async handleSavePayment() {
        if (!this.currentPaymentRecord) return;
        
        const saveBtn = document.getElementById('savePaymentBtn');
        let origText = '';
        if (saveBtn) {
            origText = saveBtn.textContent;
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }
        
        const amountInput = document.getElementById('paymentAmount');
        const paymentAmount = parseFloat(amountInput.value);
        
        if (!paymentAmount || paymentAmount <= 0) {
            this.showToast('Please enter a valid amount', 'warning');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = origText;
            }
            return;
        }

        const record = this.currentPaymentRecord;
        const prevPaid = record.amountPaid || 0;
        const newTotalPaid = prevPaid + paymentAmount;
        
        record.amountPaid = newTotalPaid;
        
        if (newTotalPaid >= record.amount) {
            // Fully paid
            record.status = 'paid';
            record.datePaid = new Date().toISOString().split('T')[0];
            this.showToast('Fully paid! 💰', 'success');
        } else {
            // Partially paid
            this.showToast(`Partial payment of ${this.formatCurrency(paymentAmount)} recorded!`, 'success');
        }

        try {
            await this.saveRecordToFirestore(record);
            this.closePaymentModal();
        } catch (err) {
            this.showToast('Payment save failed: ' + err.message, 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = origText;
            }
        }
    }

    // =========================================================
    //  IMAGE VIEWER
    // =========================================================

    openImageViewer(src) {
        if (!src || !this.imageViewerModal) return;
        this.viewerImage.src = src;
        this.imageViewerModal.classList.add('active');
        this.imageViewerModal.style.display = 'flex';
    }

    closeImageViewer() {
        if (!this.imageViewerModal) return;
        this.imageViewerModal.classList.remove('active');
        setTimeout(() => {
            this.imageViewerModal.style.display = 'none';
            if (this.viewerImage) this.viewerImage.src = '';
        }, 300);
    }

    // =========================================================
    //  AUTO-REMIND
    // =========================================================

    toggleAutoRemind() {
        this.autoRemindEnabled = !this.autoRemindEnabled;
        localStorage.setItem('lendtrack_autoremind', this.autoRemindEnabled);
        this.updateAutoRemindUI();
        if (this.autoRemindEnabled) {
            this.requestNotificationPermission();
            this.checkAndAutoSendReminders();
            this.showToast('Automatic messaging ON — triggers when day limit is reached', 'success');
        } else {
            this.showToast('Automatic messaging OFF', 'warning');
        }
    }

    updateAutoRemindUI() {
        if (!this.autoRemindToggleBtn) return;
        if (this.autoRemindEnabled) {
            this.autoRemindToggleBtn.classList.add('active');
            if (this.autoRemindStatusText) this.autoRemindStatusText.textContent = 'Auto-Send: ON';
        } else {
            this.autoRemindToggleBtn.classList.remove('active');
            if (this.autoRemindStatusText) this.autoRemindStatusText.textContent = 'Auto-Send: OFF';
        }
    }

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    checkAndAutoSendReminders() {
        if (!this.autoRemindEnabled) return;
        const todayStr = new Date().toISOString().split('T')[0];
        const today = new Date(); today.setHours(0,0,0,0);
        let sentCount = 0;

        this.records.forEach((record, index) => {
            if (record.status === 'paid' || !record.phone) return;
            const repayDate = new Date(record.repayDate); repayDate.setHours(0,0,0,0);
            if (repayDate <= today && record.lastAutoRemindedDate !== todayStr) {
                record.lastAutoRemindedDate = todayStr;
                sentCount++;
                setTimeout(() => this.sendReminder(record, true), index * 400);
            }
        });

        if (sentCount > 0) {
            this.records.filter(r => r.lastAutoRemindedDate === todayStr).forEach(r => {
                this.saveRecordToFirestore(r).catch(console.error);
            });
        }
    }

    sendReminder(record, isAuto = false) {
        if (!record.phone) {
            if (!isAuto) this.showToast('No phone number provided', 'error');
            return;
        }
        const formattedAmount = this.formatCurrency(record.amount);
        const formattedRepayDate = this.formatDate(record.repayDate);
        const formattedLentDate = this.formatDate(record.dateLent);
        const message = `Hi ${record.name}, this is a friendly reminder about the ${formattedAmount} you borrowed on ${formattedLentDate}. The repayment was due on ${formattedRepayDate}. Please arrange the payment at your earliest convenience. Thank you!`;
        const phone = record.phone.replace(/[^\d+]/g, '');
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

        if (isAuto) {
            this.showToast(`⚡ Auto-Message: ${record.name} reached day limit!`, 'success');
            if ('Notification' in window && Notification.permission === 'granted') {
                try {
                    new Notification(`🚨 Day Limit: ${record.name}`, {
                        body: `${record.name} owes ${formattedAmount} (due: ${formattedRepayDate}). WhatsApp reminder sent!`,
                        icon: record.photo || undefined
                    });
                } catch(e) {}
            }
        }

        window.open(url, '_blank');
    }

    sendReminderToAll() {
        const unpaid = this.records.filter(r => (r.status === 'pending' || r.status === 'overdue') && r.phone);
        if (!unpaid.length) { this.showToast('No pending/overdue records with phone numbers', 'warning'); return; }
        this.openConfirmModal(`Send WhatsApp to all ${unpaid.length} borrower(s)?`, () => {
            unpaid.forEach((record, i) => setTimeout(() => this.sendReminder(record), i * 300));
            this.showToast(`✅ Opened WhatsApp for all ${unpaid.length} borrower(s)!`, 'success');
        });
    }

    // =========================================================
    //  CONFIRM MODAL
    // =========================================================

    openConfirmModal(message, onConfirm) {
        if (!this.confirmModal) { if (window.confirm(message)) onConfirm(); return; }
        if (this.confirmMessage) this.confirmMessage.textContent = message;
        this.confirmModal.classList.add('active');
        this.confirmModal.style.display = 'flex';
        if (this.confirmYesBtn) {
            const newBtn = this.confirmYesBtn.cloneNode(true);
            this.confirmYesBtn.parentNode.replaceChild(newBtn, this.confirmYesBtn);
            this.confirmYesBtn = newBtn;
            this.confirmYesBtn.addEventListener('click', () => { onConfirm(); this.closeConfirmModal(); });
        }
    }

    closeConfirmModal() {
        if (this.confirmModal) {
            this.confirmModal.classList.remove('active');
            this.confirmModal.style.display = 'none';
        }
    }

    // =========================================================
    //  RENDER — TRACKER
    // =========================================================

    calculateStats() {
        let totalLent = 0, totalRecovered = 0, totalPending = 0, overdueCount = 0;
        this.records.forEach(r => {
            if (r.status === 'deleted') return; // Skip deleted from stats

            totalLent += r.amount;
            const paid = r.amountPaid || 0;
            totalRecovered += paid;
            
            if (r.status !== 'paid') {
                totalPending += (r.amount - paid);
                if (r.status === 'overdue') overdueCount++;
            }
        });
        if (this.totalLentEl)      this.totalLentEl.textContent      = this.formatCurrency(totalLent);
        if (this.totalRecoveredEl) this.totalRecoveredEl.textContent = this.formatCurrency(totalRecovered);
        if (this.totalPendingEl)   this.totalPendingEl.textContent   = this.formatCurrency(totalPending);
        if (this.overdueCountEl)   this.overdueCountEl.textContent   = overdueCount;
    }

    render() {
        this.calculateStats();
        if (!this.borrowersList) return;

        let filtered = this.records.filter(r => {
            if (r.status === 'deleted') return false; // Never show deleted in tracker
            
            return r.name.toLowerCase().includes(this.searchQuery)
                && (this.currentFilter === 'all' || r.status === this.currentFilter);
        });

        filtered.sort((a, b) => ({ overdue: 0, pending: 1, paid: 2 }[a.status] - { overdue: 0, pending: 1, paid: 2 }[b.status]));

        if (!filtered.length) {
            this.borrowersList.innerHTML = '';
            if (this.emptyState) this.emptyState.style.display = 'flex';
        } else {
            if (this.emptyState) this.emptyState.style.display = 'none';
            this.borrowersList.innerHTML = filtered.map(r => this.createCardHTML(r)).join('');
        }
    }

    createCardHTML(record) {
        const isPaid    = record.status === 'paid';
        const isOverdue = record.status === 'overdue';
        const statusClass = isPaid ? 'status-paid' : (isOverdue ? 'status-overdue' : 'status-pending');
        const statusText  = record.status.charAt(0).toUpperCase() + record.status.slice(1);

        const todayStr    = new Date().toISOString().split('T')[0];
        const autoTagHTML = record.lastAutoRemindedDate === todayStr
            ? `<span class="auto-tag">⚡ Auto-Sent</span>` : '';

        const avatarHTML = record.photo
            ? `<img src="${record.photo}" class="borrower-avatar" alt="${record.name}">`
            : `<div class="avatar-placeholder">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                   <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                   <circle cx="12" cy="7" r="4"></circle>
                 </svg>
               </div>`;

        const amountPaid = record.amountPaid || 0;
        const remaining = record.amount - amountPaid;
        
        const displayAmount = isPaid ? this.formatCurrency(record.amount) : this.formatCurrency(remaining);
        const amountLabel = isPaid ? '' : `<span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500; margin-left: 6px;">left to pay</span>`;
        
        return `
            <div class="borrower-card ${statusClass}" data-id="${record.id}">
                <div class="card-header">
                    <div class="card-title-area">
                        ${avatarHTML}
                        <h3 class="borrower-name">${record.name}</h3>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.4rem;">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        ${autoTagHTML}
                    </div>
                </div>
                <div class="card-body">
                    <div class="amount" style="display:flex; align-items:baseline;">${displayAmount}${amountLabel}</div>
                    <div class="details">
                        <p><strong>Total Lent:</strong> ${this.formatCurrency(record.amount)} &nbsp;|&nbsp; <strong>Paid:</strong> ${this.formatCurrency(amountPaid)}</p>
                        <p><strong>Phone:</strong> ${record.phone || 'N/A'}</p>
                        <p><strong>Lent on:</strong> ${this.formatDate(record.dateLent)}</p>
                        <p><strong>Due by:</strong> ${this.formatDate(record.repayDate)}</p>
                        ${isPaid ? `<p><strong>Paid on:</strong> ${this.formatDate(record.datePaid)}</p>` : ''}
                        ${record.notes ? `<p class="notes"><strong>Notes:</strong> ${record.notes}</p>` : ''}
                    </div>
                </div>
                <div class="card-actions">
                    ${!isPaid ? `
                        <button class="action-btn mark-paid-btn" title="Add Payment">✓ Pay</button>
                        <button class="action-btn remind-btn" title="Send WhatsApp Reminder">WhatsApp</button>
                    ` : ''}
                    <button class="action-btn edit-btn" title="Edit">Edit</button>
                    <button class="action-btn delete-btn" title="Delete">Delete</button>
                </div>
            </div>
        `;
    }

    // =========================================================
    //  HISTORY
    // =========================================================

    renderHistory() {
        const historyList  = document.getElementById('historyList');
        const historyEmpty = document.getElementById('historyEmpty');
        if (!historyList) return;

        const sorted = [...this.records].sort((a, b) => {
            const aTime = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
            const bTime = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
            return bTime - aTime;
        });

        if (!sorted.length) {
            historyList.innerHTML = '';
            if (historyEmpty) historyEmpty.style.display = 'flex';
            return;
        }

        if (historyEmpty) historyEmpty.style.display = 'none';

        historyList.innerHTML = sorted.map(r => {
            const isPaid    = r.status === 'paid';
            const isOverdue = r.status === 'overdue';
            const isDeleted = r.status === 'deleted';
            
            let statusClass = isPaid ? 'status-paid' : (isOverdue ? 'status-overdue' : 'status-pending');
            if (isDeleted) statusClass = 'status-deleted'; // Custom grey style
            
            const statusText  = r.status.charAt(0).toUpperCase() + r.status.slice(1);

            const createdDate = r.createdAt && r.createdAt.toDate
                ? this.formatDate(r.createdAt.toDate().toISOString().split('T')[0])
                : 'Unknown';

            return `
                <div class="history-row ${isDeleted ? 'deleted-row' : ''}">
                    <div class="history-row-avatar">
                        ${r.photo
                            ? `<img src="${r.photo}" class="history-avatar" alt="${r.name}">`
                            : `<div class="history-avatar-placeholder"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`
                        }
                    </div>
                    <div class="history-row-info">
                        <strong>${r.name}</strong>
                        <span class="history-meta">Added: ${createdDate} &nbsp;·&nbsp; Due: ${this.formatDate(r.repayDate)}</span>
                        ${r.phone ? `<span class="history-meta">📞 ${r.phone}</span>` : ''}
                    </div>
                    <div class="history-row-amount">${this.formatCurrency(r.amount)}</div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
            `;
        }).join('');
    }

    // =========================================================
    //  EXPORT CSV
    // =========================================================

    exportHistoryCSV() {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        oneWeekAgo.setHours(0,0,0,0);

        const exportable = this.records.filter(r => {
            if (!r.createdAt) return true; // include if no timestamp
            const created = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
            return created <= oneWeekAgo;
        });

        if (!exportable.length) {
            this.showToast('No records older than 7 days to export yet.', 'warning');
            return;
        }

        const headers = ['Name', 'Phone', 'Amount (₹)', 'Date Lent', 'Repay Date', 'Status', 'Date Paid', 'Notes', 'Auto-Reminded'];
        const rows = exportable.map(r => [
            `"${r.name}"`,
            `"${r.phone || ''}"`,
            r.amount,
            r.dateLent || '',
            r.repayDate || '',
            r.status || '',
            r.datePaid || '',
            `"${(r.notes || '').replace(/"/g, '""')}"`,
            r.lastAutoRemindedDate || ''
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `lendtrack-history-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast(`✅ Exported ${exportable.length} record(s) to CSV!`, 'success');
    }

    // =========================================================
    //  TOAST
    // =========================================================

    showToast(message, type = 'success') {
        if (!this.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = 'transition:all 0.3s ease;opacity:0;transform:translateY(20px);margin-bottom:10px;';
        this.toastContainer.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
        setTimeout(() => {
            toast.style.opacity = '0'; toast.style.transform = 'translateY(20px)';
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
        }, 3500);
    }

    // =========================================================
    //  HELPERS
    // =========================================================

    formatCurrency(amount) {
        return '₹' + parseFloat(amount).toLocaleString('en-IN');
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const opts = { year: 'numeric', month: 'short', day: 'numeric' };
        return new Date(dateString).toLocaleDateString('en-US', opts);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MoneyTrackerApp();
});
