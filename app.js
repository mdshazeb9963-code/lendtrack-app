class MoneyTrackerApp {
    constructor() {
        this.records = JSON.parse(localStorage.getItem('moneyTrackerRecords')) || [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        
        this.initElements();
        this.initTheme();
        this.bindEvents();
        this.checkOverdue();
        this.render();
    }

    initElements() {
        // Modal
        this.modal = document.getElementById('modal');
        this.modalTitle = document.getElementById('modalTitle');
        this.lendingForm = document.getElementById('lendingForm');
        this.closeModalBtn = document.getElementById('closeModal');
        this.addBtn = document.getElementById('addBtn');
        
        // Form Inputs
        this.personName = document.getElementById('personName');
        this.personPhone = document.getElementById('personPhone');
        this.lendAmount = document.getElementById('lendAmount');
        this.dateLent = document.getElementById('dateLent');
        this.repayDate = document.getElementById('repayDate');
        this.notes = document.getElementById('notes');
        this.recordId = document.getElementById('recordId');
        
        // Photo Elements
        this.personPhoto = document.getElementById('personPhoto');
        this.photoData = document.getElementById('photoData');
        this.photoPreview = document.getElementById('photoPreview');
        this.removePhotoBtn = document.getElementById('removePhotoBtn');
        
        // Dashboard Stats
        this.totalLentEl = document.getElementById('totalLent');
        this.totalRecoveredEl = document.getElementById('totalRecovered');
        this.totalPendingEl = document.getElementById('totalPending');
        this.overdueCountEl = document.getElementById('overdueCount');
        
        // List & Controls
        this.borrowersList = document.getElementById('borrowersList');
        this.searchInput = document.getElementById('searchInput');
        this.filterBtnsContainer = document.getElementById('filterBtns');
        this.emptyState = document.getElementById('emptyState');
        
        // Toasts
        this.toastContainer = document.getElementById('toastContainer');
        
        // Confirm Modal
        this.confirmModal = document.getElementById('confirmModal');
        this.confirmMessage = document.getElementById('confirmMessage');
        this.confirmYesBtn = document.getElementById('confirmYes');
        this.confirmNoBtn = document.getElementById('confirmNo');
        
        // Theme Toggle
        this.themeToggleBtn = document.getElementById('themeToggleBtn');
        this.iconSun = document.querySelector('.icon-sun');
        this.iconMoon = document.querySelector('.icon-moon');
        
        // Image Viewer
        this.imageViewerModal = document.getElementById('imageViewerModal');
        this.viewerImage = document.getElementById('viewerImage');
        this.closeImageViewerBtn = document.getElementById('closeImageViewer');
        
        // Default date for new records
        const today = new Date().toISOString().split('T')[0];
        if (this.dateLent) this.dateLent.value = today;
    }

    initTheme() {
        this.theme = localStorage.getItem('lendtrack_theme') || 'dark';
        if (this.theme === 'light') {
            document.body.classList.add('light-theme');
            if (this.iconSun) this.iconSun.style.display = 'block';
            if (this.iconMoon) this.iconMoon.style.display = 'none';
        } else {
            if (this.iconSun) this.iconSun.style.display = 'none';
            if (this.iconMoon) this.iconMoon.style.display = 'block';
        }
    }

    bindEvents() {
        // Theme toggle
        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        }

        // Modal events
        if (this.addBtn) {
            this.addBtn.addEventListener('click', () => this.openModal());
        }
        
        // Empty state add button
        const addBtnEmpty = document.getElementById('addBtnEmpty');
        if (addBtnEmpty) {
            addBtnEmpty.addEventListener('click', () => this.openModal());
        }
        
        // Remind All button
        const remindAllBtn = document.getElementById('remindAllBtn');
        if (remindAllBtn) {
            remindAllBtn.addEventListener('click', () => this.sendReminderToAll());
        }
        
        if (this.closeModalBtn) {
            this.closeModalBtn.addEventListener('click', () => this.closeModal());
        }
        
        // Cancel button in form
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeModal());
        }
        
        // Click outside modal to close
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) this.closeModal();
            });
        }
        if (this.confirmModal) {
            this.confirmModal.addEventListener('click', (e) => {
                if (e.target === this.confirmModal) this.closeConfirmModal();
            });
        }
        
        // Image viewer events
        if (this.closeImageViewerBtn) {
            this.closeImageViewerBtn.addEventListener('click', () => this.closeImageViewer());
        }
        if (this.imageViewerModal) {
            this.imageViewerModal.addEventListener('click', (e) => {
                if (e.target === this.imageViewerModal) this.closeImageViewer();
            });
        }
        
        // Form submit
        if (this.lendingForm) {
            this.lendingForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Photo events
        if (this.photoPreview) {
            this.photoPreview.addEventListener('click', () => {
                if (this.personPhoto) this.personPhoto.click();
            });
        }
        if (this.personPhoto) {
            this.personPhoto.addEventListener('change', (e) => this.handlePhotoUpload(e));
        }
        if (this.removePhotoBtn) {
            this.removePhotoBtn.addEventListener('click', () => this.clearPhoto());
        }
        
        // Search & Filter
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.render();
            });
        }
        
        if (this.filterBtnsContainer) {
            this.filterBtnsContainer.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.hasAttribute('data-filter')) {
                    const btn = e.target.closest('button') || e.target;
                    const filter = btn.getAttribute('data-filter');
                    if (filter) {
                        // Update active state
                        Array.from(this.filterBtnsContainer.children).forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        this.currentFilter = filter;
                        this.render();
                    }
                }
            });
        }
        
        // Event delegation for cards
        if (this.borrowersList) {
            this.borrowersList.addEventListener('click', (e) => this.handleCardActions(e));
        }
        
        // Confirm Modal
        if (this.confirmNoBtn) {
            this.confirmNoBtn.addEventListener('click', () => this.closeConfirmModal());
        }
    }

    checkOverdue() {
        let changed = false;
        const today = new Date();
        today.setHours(0,0,0,0);
        
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
        
        if (changed) this.saveRecords();
    }

    saveRecords() {
        localStorage.setItem('moneyTrackerRecords', JSON.stringify(this.records));
    }

    openModal(record = null) {
        if (record) {
            this.modalTitle.textContent = 'Edit Record';
            this.recordId.value = record.id;
            this.personName.value = record.name;
            this.personPhone.value = record.phone;
            this.lendAmount.value = record.amount;
            this.dateLent.value = record.dateLent;
            this.repayDate.value = record.repayDate;
            this.notes.value = record.notes || '';
            
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
        this.modal.style.display = 'flex'; // Ensure display if not handled by class
    }

    closeModal() {
        this.modal.classList.remove('active');
        this.modal.style.display = 'none';
        this.lendingForm.reset();
        this.clearPhoto();
    }

    handleFormSubmit(e) {
        e.preventDefault();
        
        const id = this.recordId.value;
        const newRecord = {
            id: id || Date.now().toString(),
            name: this.personName.value.trim(),
            phone: this.personPhone.value.trim(),
            amount: parseFloat(this.lendAmount.value),
            dateLent: this.dateLent.value,
            repayDate: this.repayDate.value,
            notes: this.notes.value.trim(),
            photo: this.photoData.value || null,
            status: 'pending',
            datePaid: null
        };

        if (id) {
            const index = this.records.findIndex(r => r.id === id);
            if (index !== -1) {
                // Preserve original status if not changing
                newRecord.status = this.records[index].status;
                newRecord.datePaid = this.records[index].datePaid;
                this.records[index] = newRecord;
                this.showToast('Record updated successfully', 'success');
            }
        } else {
            this.records.push(newRecord);
            this.showToast('New record added', 'success');
        }

        this.saveRecords();
        this.checkOverdue(); // Recheck since dates might have changed
        this.closeModal();
        this.render();
    }

    handlePhotoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Resize image to max 300x300 for LocalStorage efficiency
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 300;
                const MAX_HEIGHT = 300;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                if (this.photoData) this.photoData.value = dataUrl;
                if (this.photoPreview) this.photoPreview.innerHTML = `<img src="${dataUrl}" alt="Preview">`;
                if (this.removePhotoBtn) this.removePhotoBtn.style.display = 'inline-block';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    clearPhoto() {
        if (this.personPhoto) this.personPhoto.value = '';
        if (this.photoData) this.photoData.value = '';
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

    handleCardActions(e) {
        const target = e.target;
        const card = target.closest('.borrower-card');
        if (!card) return;
        
        const id = card.getAttribute('data-id');
        const record = this.records.find(r => r.id === id);
        
        // Avatar Click (View Image)
        if (target.classList.contains('borrower-avatar')) {
            this.openImageViewer(record.photo);
            return;
        }
        
        if (target.closest('.edit-btn')) {
            this.openModal(record);
        } else if (target.closest('.delete-btn')) {
            this.openConfirmModal('Are you sure you want to delete this record?', () => {
                this.records = this.records.filter(r => r.id !== id);
                this.saveRecords();
                this.showToast('Record deleted', 'success');
                this.render();
            });
        } else if (target.closest('.mark-paid-btn')) {
            record.status = 'paid';
            record.datePaid = new Date().toISOString().split('T')[0];
            this.saveRecords();
            this.showToast('Marked as paid!', 'success');
            this.render();
        } else if (target.closest('.remind-btn')) {
            this.sendReminder(record);
        }
    }
    
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
    
    toggleTheme() {
        if (document.body.classList.contains('light-theme')) {
            document.body.classList.remove('light-theme');
            if (this.iconSun) this.iconSun.style.display = 'none';
            if (this.iconMoon) this.iconMoon.style.display = 'block';
            localStorage.setItem('lendtrack_theme', 'dark');
            this.theme = 'dark';
        } else {
            document.body.classList.add('light-theme');
            if (this.iconSun) this.iconSun.style.display = 'block';
            if (this.iconMoon) this.iconMoon.style.display = 'none';
            localStorage.setItem('lendtrack_theme', 'light');
            this.theme = 'light';
        }
    }
    
    sendReminder(record) {
        if (!record.phone) {
            this.showToast('No phone number provided', 'error');
            return;
        }
        const formattedAmount = this.formatCurrency(record.amount);
        const formattedLentDate = this.formatDate(record.dateLent);
        const formattedRepayDate = this.formatDate(record.repayDate);
        
        const message = `Hi ${record.name}, this is a friendly reminder about the ${formattedAmount} you borrowed on ${formattedLentDate}. The repayment was due on ${formattedRepayDate}. Please arrange the payment at your earliest convenience. Thank you!`;
        
        const encodedMessage = encodeURIComponent(message);
        
        // Remove non-numeric characters from phone number for URL (except + if they added it)
        const phone = record.phone.replace(/[^\d+]/g, '');
        const url = `https://wa.me/${phone}?text=${encodedMessage}`;
        
        window.open(url, '_blank');
    }

    sendReminderToAll() {
        const unpaidRecords = this.records.filter(
            r => (r.status === 'pending' || r.status === 'overdue') && r.phone
        );
        
        if (unpaidRecords.length === 0) {
            this.showToast('No pending or overdue records with phone numbers', 'warning');
            return;
        }
        
        this.openConfirmModal(
            `Send WhatsApp reminders to all ${unpaidRecords.length} borrower(s) at once?`,
            () => {
                let sent = 0;
                
                unpaidRecords.forEach((record, index) => {
                    // Small stagger (300ms) to prevent browser popup blockers, but much faster than before
                    setTimeout(() => {
                        const formattedAmount = this.formatCurrency(record.amount);
                        const formattedLentDate = this.formatDate(record.dateLent);
                        const formattedRepayDate = this.formatDate(record.repayDate);
                        
                        const message = `Hi ${record.name}, this is a friendly reminder about the ${formattedAmount} you borrowed on ${formattedLentDate}. The repayment was due on ${formattedRepayDate}. Please arrange the payment at your earliest convenience. Thank you!`;
                        
                        const phone = record.phone.replace(/[^\d+]/g, '');
                        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
                        window.open(url, '_blank');
                        
                        sent++;
                        if (sent === unpaidRecords.length) {
                            this.showToast(`✅ Opened WhatsApp for all ${sent} borrower(s)!`, 'success');
                        }
                    }, index * 300);
                });
            }
        );
    }

    openConfirmModal(message, onConfirm) {
        if (!this.confirmModal) {
            // Fallback to basic window.confirm if confirm modal is not in DOM
            if (window.confirm(message)) {
                onConfirm();
            }
            return;
        }
        
        if (this.confirmMessage) this.confirmMessage.textContent = message;
        this.confirmModal.classList.add('active');
        this.confirmModal.style.display = 'flex';
        
        // Remove old listeners by cloning
        if (this.confirmYesBtn) {
            const newYesBtn = this.confirmYesBtn.cloneNode(true);
            this.confirmYesBtn.parentNode.replaceChild(newYesBtn, this.confirmYesBtn);
            this.confirmYesBtn = newYesBtn;
            
            this.confirmYesBtn.addEventListener('click', () => {
                onConfirm();
                this.closeConfirmModal();
            });
        }
    }

    closeConfirmModal() {
        if (this.confirmModal) {
            this.confirmModal.classList.remove('active');
            this.confirmModal.style.display = 'none';
        }
    }

    showToast(message, type = 'success') {
        if (!this.toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        // basic styles if missing in CSS
        toast.style.transition = 'all 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.marginBottom = '10px';
        
        this.toastContainer.appendChild(toast);
        
        // Animate in
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3000);
    }

    formatCurrency(amount) {
        return '₹' + parseFloat(amount).toLocaleString('en-IN');
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return new Date(dateString).toLocaleDateString('en-US', options);
    }

    calculateStats() {
        let totalLent = 0;
        let totalRecovered = 0;
        let totalPending = 0;
        let overdueCount = 0;

        this.records.forEach(record => {
            totalLent += record.amount;
            if (record.status === 'paid') {
                totalRecovered += record.amount;
            } else {
                totalPending += record.amount;
                if (record.status === 'overdue') {
                    overdueCount++;
                }
            }
        });

        if (this.totalLentEl) this.totalLentEl.textContent = this.formatCurrency(totalLent);
        if (this.totalRecoveredEl) this.totalRecoveredEl.textContent = this.formatCurrency(totalRecovered);
        if (this.totalPendingEl) this.totalPendingEl.textContent = this.formatCurrency(totalPending);
        if (this.overdueCountEl) this.overdueCountEl.textContent = overdueCount;
    }

    render() {
        this.calculateStats();
        
        if (!this.borrowersList) return;

        let filteredRecords = this.records.filter(r => {
            const matchesSearch = r.name.toLowerCase().includes(this.searchQuery);
            const matchesFilter = this.currentFilter === 'all' || r.status === this.currentFilter;
            return matchesSearch && matchesFilter;
        });

        // Sort: overdue first, then pending, then paid
        filteredRecords.sort((a, b) => {
            const order = { 'overdue': 0, 'pending': 1, 'paid': 2 };
            return order[a.status] - order[b.status];
        });

        if (filteredRecords.length === 0) {
            this.borrowersList.innerHTML = '';
            if (this.emptyState) this.emptyState.style.display = 'flex';
        } else {
            if (this.emptyState) this.emptyState.style.display = 'none';
            this.borrowersList.innerHTML = filteredRecords.map(record => this.createCardHTML(record)).join('');
        }
    }

    createCardHTML(record) {
        const isPaid = record.status === 'paid';
        const isOverdue = record.status === 'overdue';
        const statusClass = isPaid ? 'status-paid' : (isOverdue ? 'status-overdue' : 'status-pending');
        const statusText = record.status.charAt(0).toUpperCase() + record.status.slice(1);
        
        const avatarHTML = record.photo 
            ? `<img src="${record.photo}" class="borrower-avatar" alt="${record.name}">`
            : `<div class="avatar-placeholder">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                   <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                   <circle cx="12" cy="7" r="4"></circle>
                 </svg>
               </div>`;
        
        return `
            <div class="borrower-card ${statusClass}" data-id="${record.id}">
                <div class="card-header">
                    <div class="card-title-area">
                        ${avatarHTML}
                        <h3 class="borrower-name">${record.name}</h3>
                    </div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="card-body">
                    <div class="amount">${this.formatCurrency(record.amount)}</div>
                    <div class="details">
                        <p><strong>Phone:</strong> ${record.phone || 'N/A'}</p>
                        <p><strong>Lent on:</strong> ${this.formatDate(record.dateLent)}</p>
                        <p><strong>Due by:</strong> ${this.formatDate(record.repayDate)}</p>
                        ${isPaid ? `<p><strong>Paid on:</strong> ${this.formatDate(record.datePaid)}</p>` : ''}
                        ${record.notes ? `<p class="notes"><strong>Notes:</strong> ${record.notes}</p>` : ''}
                    </div>
                </div>
                <div class="card-actions">
                    ${!isPaid ? `
                        <button class="action-btn mark-paid-btn" title="Mark as Paid">✓ Paid</button>
                        <button class="action-btn remind-btn" title="Send Reminder">WhatsApp</button>
                    ` : ''}
                    <button class="action-btn edit-btn" title="Edit">Edit</button>
                    <button class="action-btn delete-btn" title="Delete">Delete</button>
                </div>
            </div>
        `;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MoneyTrackerApp();
});
