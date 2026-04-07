const SUPABASE_URL = 'https://aujukmshqfgmdqhaenyx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5rVA-EQn78GtI02hM7DZuw_dS8b4932';

// Ensure the Supabase object is available
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        detectSessionInUrl: true,  // auto-parse OAuth callback tokens from URL
        persistSession: true,      // save session across page loads
        autoRefreshToken: true
    }
});

// Determine the redirect URL for OAuth.
// If running as a file:// URL (local dev without a server),
// fall back to the production URL so OAuth can complete.
function getRedirectTo() {
    if (window.location.protocol === 'file:') {
        // Can't redirect to file:// — use local server fallback or prod
        // Prefer localhost if available, otherwise production
        return 'http://localhost:5500/snippets/dashboard/';
    }
    return window.location.origin + window.location.pathname;
}

const DOM = {
    authOverlay: document.getElementById('auth-overlay'),
    loginBtn: document.getElementById('login-button'),
    logoutBtn: document.getElementById('logout-button'),
    dashboard: document.getElementById('dashboard'),
    userName: document.getElementById('user-name'),
    userAvatar: document.getElementById('user-avatar'),
    grid: document.getElementById('snippets-grid'),
    spinner: document.getElementById('loading-spinner'),
    emptyState: document.getElementById('empty-state'),
    searchInput: document.getElementById('search-input'),
    addBtn: document.getElementById('add-snippet-btn'),
    
    // Modal
    modalOverlay: document.getElementById('modal-overlay'),
    modalTitle: document.getElementById('modal-title'),
    modalClose: document.getElementById('modal-close'),
    modalCancel: document.getElementById('modal-cancel'),
    form: document.getElementById('snippet-form'),
    idInput: document.getElementById('snippet-id'),
    titleInput: document.getElementById('snippet-title'),
    expansionInput: document.getElementById('snippet-expansion'),
    saveBtn: document.getElementById('save-btn')
};

let allSnippets = [];

// === Auth ===
async function checkUser() {
    DOM.spinner.classList.remove('hidden');
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (session) {
        showDashboard(session.user);
        loadSnippets();
    } else {
        showAuth();
    }
}

// Watch for auth changes
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
        showDashboard(session.user);
        loadSnippets();
    } else if (event === 'SIGNED_OUT') {
        showAuth();
        DOM.grid.innerHTML = '';
        allSnippets = [];
    }
});

function showAuth() {
    DOM.authOverlay.classList.remove('hidden');
    DOM.dashboard.classList.add('hidden');
}

function showDashboard(user) {
    DOM.authOverlay.classList.add('hidden');
    DOM.dashboard.classList.remove('hidden');
    DOM.userName.textContent = user.email || 'User';
    DOM.userAvatar.innerHTML = `<img src="${user.user_metadata?.avatar_url || '../../icon32.png'}" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%;">`;
}

DOM.loginBtn.addEventListener('click', async () => {
    DOM.loginBtn.textContent = 'Connecting...';
    DOM.loginBtn.disabled = true;
    
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: getRedirectTo()
        }
    });
    
    if (error) {
        alert("Login failed: " + error.message);
        DOM.loginBtn.textContent = 'Sign in with Google';
        DOM.loginBtn.disabled = false;
    }
});

DOM.logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
});

// === Data Fetching ===
async function loadSnippets() {
    DOM.grid.classList.add('hidden');
    DOM.emptyState.classList.add('hidden');
    DOM.spinner.classList.remove('hidden');
    
    const { data, error } = await supabase
        .from('shortcuts')
        .select('*')
        .order('id', { ascending: false });
        
    if (error) {
        console.error("Error loading snippets:", error);
        alert("Failed to load snippets.");
        DOM.spinner.classList.add('hidden');
        return;
    }
    
    allSnippets = data || [];
    filterAndRender();
}

function filterAndRender() {
    DOM.spinner.classList.add('hidden');
    
    const query = DOM.searchInput.value.toLowerCase().trim();
    const filtered = allSnippets.filter(s => 
        (s.title || '').toLowerCase().includes(query) || 
        (s.expansion || '').toLowerCase().includes(query)
    );
    
    // Alphabetical sort by title (or expansion if no title)
    filtered.sort((a, b) => {
        const valA = (a.title || a.expansion || '').toLowerCase();
        const valB = (b.title || b.expansion || '').toLowerCase();
        return valA.localeCompare(valB);
    });
    
    DOM.grid.innerHTML = '';
    
    if (filtered.length === 0) {
        DOM.grid.classList.add('hidden');
        DOM.emptyState.classList.remove('hidden');
    } else {
        DOM.grid.classList.remove('hidden');
        DOM.emptyState.classList.add('hidden');
        
        filtered.forEach(snippet => {
            const card = document.createElement('div');
            card.classList.add('snippet-card');
            
            const realTitle = (snippet.title && !snippet.title.startsWith(';;__')) 
                ? snippet.title.replace(/^;+/, '').trim() 
                : null;
                
            let previewText = snippet.expansion;
            if (previewText.length > 200) previewText = previewText.substring(0, 200) + '...';
            
            // Clean up html tags before rendering preview
            const tempDiv = document.createElement('div');
            tempDiv.textContent = previewText;
            const safePreviewText = tempDiv.innerHTML;
            
            card.innerHTML = `
                <div class="snippet-header">
                    ${realTitle ? `<div class="snippet-title">${realTitle}</div>` : ''}
                    <div class="snippet-actions">
                        <button class="icon-btn edit-btn" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                        <button class="icon-btn delete-btn" style="color:#ef4444;" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c0 1 1 2 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </button>
                    </div>
                </div>
                <div class="snippet-content">${safePreviewText}</div>
            `;
            
            card.querySelector('.edit-btn').addEventListener('click', () => openModal(snippet));
            card.querySelector('.delete-btn').addEventListener('click', () => deleteSnippet(snippet.id));
            
            DOM.grid.appendChild(card);
        });
    }
}

DOM.searchInput.addEventListener('input', filterAndRender);

// === CRUD Operations ===
async function deleteSnippet(id) {
    if (!confirm('Are you sure you want to delete this snippet?')) return;
    
    // Optimistic UI update
    const prevSnippets = [...allSnippets];
    allSnippets = allSnippets.filter(s => s.id !== id);
    filterAndRender();
    
    const { error } = await supabase
        .from('shortcuts')
        .delete()
        .eq('id', id);
        
    if (error) {
        console.error("Error deleting:", error);
        alert("Failed to delete snippet.");
        allSnippets = prevSnippets; // Revert
        filterAndRender();
    }
}

// === Modal Handlers ===
function openModal(snippet = null) {
    DOM.form.reset();
    if (snippet) {
        DOM.modalTitle.textContent = 'Edit Snippet';
        DOM.idInput.value = snippet.id;
        
        let editTitle = (snippet.title || '').replace(/^;+/, '');
        DOM.titleInput.value = editTitle;
        DOM.expansionInput.value = snippet.expansion;
    } else {
        DOM.modalTitle.textContent = 'New Snippet';
        DOM.idInput.value = '';
    }
    
    DOM.modalOverlay.classList.remove('hidden');
    DOM.titleInput.focus();
}

function closeModal() {
    DOM.modalOverlay.classList.add('hidden');
}

DOM.addBtn.addEventListener('click', () => openModal());
DOM.modalClose.addEventListener('click', closeModal);
DOM.modalCancel.addEventListener('click', closeModal);

// Close on background click
DOM.modalOverlay.addEventListener('click', (e) => {
    if (e.target === DOM.modalOverlay) closeModal();
});

DOM.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = DOM.idInput.value;
    const title = DOM.titleInput.value.trim();
    const expansion = DOM.expansionInput.value.trim();
    
    if (!expansion) return;
    
    DOM.saveBtn.textContent = 'Saving...';
    DOM.saveBtn.disabled = true;
    
    let error;
    if (id) {
        // Update
        const { error: updateError } = await supabase
            .from('shortcuts')
            .update({ title, expansion })
            .eq('id', id);
        error = updateError;
    } else {
        // Insert
        const { error: insertError } = await supabase
            .from('shortcuts')
            .insert([{ title, expansion }]);
        error = insertError;
    }
    
    DOM.saveBtn.textContent = 'Save Snippet';
    DOM.saveBtn.disabled = false;
    
    if (error) {
        console.error("Save error:", error);
        alert("Failed to save snippet: " + error.message);
    } else {
        closeModal();
        loadSnippets(); // Reload to get fresh data incl IDs
    }
});

// Boot
document.addEventListener('DOMContentLoaded', checkUser);
