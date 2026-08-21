import Alpine from 'alpinejs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, setPersistence,
    browserLocalPersistence } from 'firebase/auth';
import { getFirestore, collection, query, orderBy, getDocs } from 'firebase/firestore';

// --- TYPE DEFINITIONS ---
interface Person {
    id: string;
    person_id?: string;
    name: string;
    dept: string;
    department?: string;
    role: string;
    posting: string;
    enrolled: boolean;
    status: 'Active' | 'Inactive';
    authorized?: boolean;
}

interface NewPerson {
    person_id: string;
    name: string;
    department: string;
    role: string;
    posting: string;
    authorized: boolean;
    photo: File | null;
}

interface NotificationState {
    show: boolean;
    type: 'success' | 'error' | 'warning';
    message: string;
}

interface StatsData {
    todayEntries: number;
    serverUptime: string;
}

interface LogData {
    id: string | number;
    name: string;
    person_id: string;
    role: string;
    department: string;
    dateStr: string;
    timeStr: string;
    type: string;
    result: string;
    rawDate?: Date;
}

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDf6Z_YHkKYFDwK-cPzYT6lGFLsi5VxPd4",
    authDomain: "facerec-80369.firebaseapp.com",
    projectId: "facerec-80369",
    storageBucket: "facerec-80369.firebasestorage.app",
    messagingSenderId: "823802374952",
    appId: "1:823802374952:web:dd821e28a2e466c7c27e1d",
    measurementId: "G-LYQYVRCZ7V"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
// Force Google to show account selection prompt cleanly
provider.setCustomParameters({
    prompt: 'select_account'
});
const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.error("Auth persistence error:", err);
});

// --- ALPINE COMPONENT LOGIC ---
Alpine.data('adminPanel', () => ({
    // STATE
    isLoggedIn: false,
    userEmail: '',
    userRole: 'Admin',
    userAvatar: '',
    view: 'dashboard',
    darkMode: localStorage.getItem('theme') === 'dark',
    serverRunning: true,
    API_BASE_URL: (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000',
    adminKey: '',

    searchQuery: '',
    personnel: [] as Person[],
    loadingPersonnel: false,
    personnelLoadError: '',

    showAddModal: false,
    addingPersonnel: false,

    // Load admin key specific to this Google user email
    loadUserAdminKey() {
        if (this.userEmail) {
            this.adminKey = localStorage.getItem(`admin_key_${this.userEmail}`) || '';
        }
    },

    // Save admin key whenever connected successfully
    saveUserAdminKey() {
        if (this.userEmail && this.adminKey.trim()) {
            localStorage.setItem(`admin_key_${this.userEmail}`, this.adminKey.trim());
        }
    },

    toggleDarkMode() {
        this.darkMode = !this.darkMode;
        localStorage.setItem('theme', this.darkMode ? 'dark' : 'light');
    },

    newPerson: {
        person_id: '',
        name: '',
        department: '',
        role: '',
        posting: '',
        authorized: true,
        photo: null
    } as NewPerson,

    showEditModal: false,
    updatingPersonnel: false,
    deletingPersonnel: false,

    editingPerson: {
        person_id: '',
        name: '',
        department: '',
        role: '',
        posting: '',
        authorized: true,
        photo: null
    } as NewPerson,

    notification: {
        show: false,
        type: 'success',
        message: ''
    } as NotificationState,

    logs: [] as LogData[],
    loadingLogs: false,
    stats: { todayEntries: 0, serverUptime: '0h' } as StatsData,
    loadingStats: false,
    reloadingRegistry: false,
    
    notificationTimer: null as ReturnType<typeof setTimeout> | null,

    // Health State
    checkingHealth: false,
    healthData: {
        proxy: 'UNKNOWN',
        backend: 'UNKNOWN'
    },

    // Health Fetch Method
    async checkHealth() {
        this.checkingHealth = true;
        try {
            const response = await fetch(`${this.API_BASE_URL}/health`, {
                method: 'GET'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.healthData = {
                proxy: data.proxy || 'ONLINE',
                backend: data.backend || 'ONLINE'
            };
            this.showNotification('Health check complete', 'success');
        } catch (error) {
            console.error('Health check error:', error);
            this.healthData = {
                proxy: 'OFFLINE',
                backend: 'OFFLINE'
            };
            this.showNotification('Backend health check failed', 'error');
        } finally {
            this.checkingHealth = false;
        }
    },

    init() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            this.userEmail = user.email || '';
            this.userRole = user.displayName || 'Admin';
            this.userAvatar = user.photoURL || '';
            this.isLoggedIn = true;

            this.loadUserAdminKey();
            this.fetchAccessLogs();
            
            setInterval(() => {
                if (this.view === 'dashboard' || this.view === 'system') {
                    this.fetchAccessLogs();
                }
            }, 10000);
        } else {
            this.isLoggedIn = false;
            this.userEmail = '';
            this.adminKey = '';
        }
    });

    if (this.view === 'system') {
        this.checkHealth();
    }
},

    // GETTERS
    get todayLogs(): LogData[] {
        const today = new Date();
        return this.logs.filter(log => {
            if (!log.rawDate) return false;
            return log.rawDate.getDate() === today.getDate() &&
                   log.rawDate.getMonth() === today.getMonth() &&
                   log.rawDate.getFullYear() === today.getFullYear();
        });
    },

    get filteredPersonnel(): Person[] {
        if (!this.searchQuery.trim()) {
            return this.personnel;
        }
        const q = this.searchQuery.toLowerCase();
        return this.personnel.filter((p: Person) => 
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.id && p.id.toLowerCase().includes(q)) ||
            (p.dept && p.dept.toLowerCase().includes(q)) ||
            (p.role && p.role.toLowerCase().includes(q))
        );
    },

    // METHODS
    async loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, provider);
        this.showNotification(`Welcome back, ${result.user.displayName || 'Admin'}`, 'success');
    } catch (error: any) {
        console.error("Firebase Auth Error:", error);
        if (error.code === 'auth/popup-blocked') {
            this.showNotification('Please allow popups in your address bar to log in.', 'warning');
        } else if (error.code === 'auth/unauthorized-domain') {
            this.showNotification('Domain not authorized in Firebase Console.', 'error');
        } else {
            this.showNotification(error.message, 'error');
        }
    }
},

    async logout() {
        try {
            await signOut(auth);
            this.isLoggedIn = false;
            this.userEmail = '';
            this.userAvatar = '';
        } catch (error) {
            this.isLoggedIn = false;
        }
    },

    toggleServer() {
        if (this.serverRunning) {
            if (confirm("CRITICAL: Stopping the authentication server will immediately shut down lab access.")) {
                this.serverRunning = false;
            }
        } else {
            this.serverRunning = true;
        }
    },

    apiHeaders(): Record<string, string> {
        if (!this.adminKey.trim()) {
            throw new Error('Enter the admin key first.');
        }
        return { 'X-Admin-Key': this.adminKey.trim() };
    },

    formatApiError(status: number, body: any): string {
        if (body?.detail && Array.isArray(body.detail)) return body.detail.map((e: any) => e.msg).join(', ');
        if (typeof body?.detail === 'string') return body.detail;
        if (status === 401) return 'The admin key is invalid.';
        if (status === 403) return 'You are not permitted to manage personnel.';
        if (status === 404) return 'The personnel API endpoint was not found.';
        if (status === 422) return 'The API rejected the request.';
        if (status >= 500) return 'The server could not complete this request.';
        return `Unable to load personnel (${status}).`;
    },

    normalizePerson(person: any): Person {
        return {
            id: person.person_id ?? person.id ?? '',
            name: person.name ?? '',
            dept: person.department ?? '',
            role: person.role ?? '',
            posting: person.posting ?? '',
            enrolled: person.enrolled ?? true,
            status: person.authorized ? 'Active' : 'Inactive'
        };
    },

    async fetchPersonnel() {
        if (!this.adminKey.trim()) {
            this.personnelLoadError = 'Please enter the admin key.';
            return;
        }

        this.loadingPersonnel = true;
        this.personnelLoadError = '';

        try {
            const response = await fetch(`${this.API_BASE_URL}/admin/people`, {
                method: 'GET',
                headers: {
                    'X-Admin-Key': this.adminKey.trim()
                }
            });

            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }

            const data = await response.json();
            const rawList: any[] = Array.isArray(data) ? data : (data.people || []);

            this.personnel = rawList.map((p: any) => ({
                id: p.id || p.person_id || '',
                person_id: p.id || p.person_id || '',
                name: p.name || '—',
                role: p.role || '—',
                dept: p.department || '—',
                department: p.department || '—',
                posting: p.posting || '',
                enrolled: Boolean(p.storage_path || p.enrolled || true),
                status: p.authorized ? 'Active' : 'Inactive',
                authorized: Boolean(p.authorized)
            }));

            this.saveUserAdminKey();
            this.showNotification(`Loaded ${this.personnel.length} personnel records`, 'success');
        } catch (error: any) {
            console.error('Personnel Fetch Error:', error);
            this.personnelLoadError = error.message || 'Failed to load personnel.';
            this.showNotification('Connection failed', 'error');
        } finally {
            this.loadingPersonnel = false;
        }
    },

    async fetchDashboardStats() {
        this.loadingStats = true;
        try {
            const response = await fetch(`${this.API_BASE_URL}/admin/stats`, { method: 'GET' });
            if (!response.ok) throw new Error('Failed to fetch stats');

            const data = await response.json();
            this.stats.todayEntries = data.today_entries || 0;
            this.stats.serverUptime = data.uptime || '0h';
        } catch (error) {
            console.error("Dashboard stats error:", error);
        } finally {
            this.loadingStats = false;
        }
    },

    async fetchAccessLogs() {
        this.loadingLogs = true;
        try {
            const logsRef = collection(db, 'access_logs');
            const q = query(logsRef, orderBy('timestamp', 'desc'));
            const querySnapshot = await getDocs(q);

            const fetchedLogs: LogData[] = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();

                let rawDate: Date | undefined = undefined;
                let dateStr = '—';
                let timeStr = '—';

                if (data.timestamp) {
                    if (typeof data.timestamp.toDate === 'function') {
                        rawDate = data.timestamp.toDate();
                    } else if (data.timestamp instanceof Date) {
                        rawDate = data.timestamp;
                    } else {
                        const parsed = new Date(data.timestamp);
                        if (!isNaN(parsed.getTime())) {
                            rawDate = parsed;
                        }
                    }

                    if (rawDate) {
                        dateStr = rawDate.toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                        });

                        timeStr = rawDate.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        });
                    }
                }

                fetchedLogs.push({
                    id: doc.id,
                    name: (data.name && data.name.trim() !== '') ? data.name : '—',
                    person_id: data.person_id || '—',
                    role: (data.role && data.role.trim() !== '') ? data.role : '—',
                    department: (data.department && data.department.trim() !== '') ? data.department : '—',
                    dateStr: dateStr,
                    timeStr: timeStr,
                    type: data.event || 'ENTRY',
                    result: data.status === 'PERMITTED' ? 'SUCCESS' : 'DENIED',
                    rawDate: rawDate
                });
            });

            this.logs = fetchedLogs;
        } catch (error) {
            console.error("Firestore Access Logs Error:", error);
        } finally {
            this.loadingLogs = false;
        }
    },

    openAddModal() {
        this.newPerson = { person_id: '', name: '', department: '', role: '', posting: '', authorized: true, photo: null };
        this.showAddModal = true;
    },

    async addPersonnel() {
        if (this.addingPersonnel) return;
        this.addingPersonnel = true;

        try {
            if (!this.newPerson.person_id.trim()) throw new Error('Personnel ID is required.');
            if (!this.newPerson.name.trim()) throw new Error('Personnel name is required.');
            if (!(this.newPerson.photo instanceof File)) throw new Error('A personnel photo is required.');

            const formData = new FormData();
            formData.append('person_id', this.newPerson.person_id.trim());
            formData.append('name', this.newPerson.name.trim());
            formData.append('department', this.newPerson.department.trim());
            formData.append('role', this.newPerson.role.trim());
            formData.append('posting', this.newPerson.posting.trim());
            formData.append('authorized', String(this.newPerson.authorized));
            formData.append('photo', this.newPerson.photo);

            const response = await fetch(`${this.API_BASE_URL}/admin/people`, {
                method: 'POST',
                headers: this.apiHeaders(),
                body: formData
            });

            const contentType = response.headers.get('content-type') || '';
            const body = contentType.includes('application/json') ? await response.json() : null;

            if (!response.ok) throw new Error(this.formatApiError(response.status, body));

            this.showAddModal = false;
            await this.fetchPersonnel();
            this.showNotification('Personnel added successfully.', 'success');
        } catch (error: any) {
            this.showNotification(error.message, 'error');
        } finally {
            this.addingPersonnel = false;
        }
    },

    openEditModal(person: Person) {
        this.editingPerson = {
            person_id: person.id,
            name: person.name,
            department: person.dept,
            role: person.role,
            posting: person.posting || '',
            authorized: person.status === 'Active',
            photo: null
        };
        this.showEditModal = true;
    },

    async updatePersonnel() {
        if (this.updatingPersonnel) return;
        this.updatingPersonnel = true;

        try {
            if (!this.editingPerson.name.trim()) throw new Error('Personnel name is required.');

            const formData = new FormData();
            formData.append('name', this.editingPerson.name.trim());
            formData.append('department', this.editingPerson.department.trim());
            formData.append('role', this.editingPerson.role.trim());
            formData.append('posting', this.editingPerson.posting.trim());
            formData.append('authorized', String(this.editingPerson.authorized));

            if (this.editingPerson.photo instanceof File) {
                formData.append('photo', this.editingPerson.photo);
            }

            const response = await fetch(`${this.API_BASE_URL}/admin/people/${encodeURIComponent(this.editingPerson.person_id)}`, {
                method: 'PUT',
                headers: this.apiHeaders(),
                body: formData
            });

            const contentType = response.headers.get('content-type') || '';
            const body = contentType.includes('application/json') ? await response.json() : null;

            if (!response.ok) throw new Error(this.formatApiError(response.status, body));

            this.showEditModal = false;
            await this.fetchPersonnel();
            this.showNotification('Personnel updated successfully.', 'success');
        } catch (error: any) {
            this.showNotification(error.message, 'error');
        } finally {
            this.updatingPersonnel = false;
        }
    },

    async deletePersonnel(person: Person) {
        if (this.deletingPersonnel) return;
        if (!confirm(`Remove ${person.name} (ID: ${person.id})? This action cannot be undone.`)) return;

        this.deletingPersonnel = true;

        try {
            const response = await fetch(`${this.API_BASE_URL}/admin/people/${encodeURIComponent(person.id)}`, {
                method: 'DELETE',
                headers: this.apiHeaders()
            });

            const contentType = response.headers.get('content-type') || '';
            const body = contentType.includes('application/json') ? await response.json() : null;

            if (!response.ok) throw new Error(this.formatApiError(response.status, body));

            await this.fetchPersonnel();
            this.showNotification('Personnel removed successfully.', 'success');
        } catch (error: any) {
            this.showNotification(error.message, 'error');
        } finally {
            this.deletingPersonnel = false;
        }
    },

    async reloadRegistry() {
        if (this.reloadingRegistry) return;
        this.reloadingRegistry = true;

        try {
            const response = await fetch(`${this.API_BASE_URL}/admin/reload`, {
                method: 'POST',
            });

            if (!response.ok) throw new Error(`Failed to reload registry (${response.status})`);
            this.showNotification('Face registry successfully synced with Firebase.', 'success');
        } catch (error: any) {
            this.showNotification(error.message, 'error');
        } finally {
            this.reloadingRegistry = false;
        }
    },

    showNotification(message: string, type: 'success' | 'error' | 'warning' = 'success') {
        this.notification = { show: true, type, message };
        if (this.notificationTimer) clearTimeout(this.notificationTimer);
        this.notificationTimer = setTimeout(() => {
            this.notification.show = false;
        }, 4000);
    }
}));

// Initialize Alpine securely after typing is complete
(window as any).Alpine = Alpine;
Alpine.start();