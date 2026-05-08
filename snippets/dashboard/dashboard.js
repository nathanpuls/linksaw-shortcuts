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
    categoryFilter: document.getElementById('category-filter'),
    bulkEditBtn: document.getElementById('bulk-edit-btn'),
    addBtn: document.getElementById('add-snippet-btn'),
    
    // Modal
    modalOverlay: document.getElementById('modal-overlay'),
    modalTitle: document.getElementById('modal-title'),
    modalClose: document.getElementById('modal-close'),
    modalCancel: document.getElementById('modal-cancel'),
    form: document.getElementById('snippet-form'),
    idInput: document.getElementById('snippet-id'),
    titleInput: document.getElementById('snippet-title'),
    categoryInput: document.getElementById('snippet-category'),
    expansionInput: document.getElementById('snippet-expansion'),
    saveBtn: document.getElementById('save-btn'),

    bulkModalOverlay: document.getElementById('bulk-modal-overlay'),
    bulkModalClose: document.getElementById('bulk-modal-close'),
    bulkModalCancel: document.getElementById('bulk-modal-cancel'),
    bulkForm: document.getElementById('bulk-form'),
    bulkOriginalCategoryInput: document.getElementById('bulk-original-category'),
    bulkCategoryNameInput: document.getElementById('bulk-category-name'),
    bulkItemsInput: document.getElementById('bulk-items'),
    bulkSaveBtn: document.getElementById('bulk-save-btn')
};

let allSnippets = [];
let currentUser = null;
let snippetCategories = {};
const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const checkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

function normalizeCategory(value) {
    return (value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

function hydrateSnippetCategories(user) {
    const stored = user?.user_metadata?.snippetCategories;
    snippetCategories = stored && typeof stored === 'object' && !Array.isArray(stored)
        ? { ...stored }
        : {};
}

function getSnippetCategory(snippetOrId) {
    const key = String(typeof snippetOrId === 'object' ? snippetOrId?.id : snippetOrId);
    return normalizeCategory(snippetCategories[key] || '');
}

async function persistSnippetCategories(nextCategories) {
    if (!currentUser) return;

    const normalizedEntries = Object.entries(nextCategories || {})
        .map(([key, value]) => [String(key), normalizeCategory(value)])
        .filter(([, value]) => value);

    const payload = Object.fromEntries(normalizedEntries);
    const { data, error } = await supabase.auth.updateUser({
        data: {
            ...(currentUser.user_metadata || {}),
            snippetCategories: payload
        }
    });

    if (error) throw error;

    snippetCategories = payload;
    if (data?.user) {
        currentUser = data.user;
    }
}

function renderCategoryFilter() {
    const selectedValue = DOM.categoryFilter.value;
    const categories = [...new Set(
        allSnippets
            .map(snippet => getSnippetCategory(snippet))
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    DOM.categoryFilter.innerHTML = '<option value="">All categories</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        DOM.categoryFilter.appendChild(option);
    });

    DOM.categoryFilter.value = categories.includes(selectedValue) ? selectedValue : '';
}

function getCategoryFromMap(snippet, categoryMap = snippetCategories) {
    return normalizeCategory(categoryMap[String(snippet.id)] || '');
}

function getManagedListSnippets(categoryName, categoryMap = snippetCategories) {
    const normalized = normalizeCategory(categoryName);
    if (!normalized) return [];

    return allSnippets
        .filter(snippet =>
            getCategoryFromMap(snippet, categoryMap) === normalized &&
            !(snippet.title || '').trim()
        )
        .sort((a, b) => (a.expansion || '').localeCompare(b.expansion || '', undefined, { sensitivity: 'base' }));
}

function uniqueLines(text) {
    const seen = new Set();
    const lines = [];
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || seen.has(line)) continue;
        seen.add(line);
        lines.push(line);
    }
    return lines;
}

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
    currentUser = null;
    snippetCategories = {};
    DOM.authOverlay.classList.remove('hidden');
    DOM.dashboard.classList.add('hidden');
}

function showDashboard(user) {
    currentUser = user;
    hydrateSnippetCategories(user);
    DOM.authOverlay.classList.add('hidden');
    DOM.dashboard.classList.remove('hidden');
    DOM.userName.textContent = user.email || 'User';
    DOM.userAvatar.innerHTML = `<img src="${user.user_metadata?.avatar_url || '../../icon32.png'}" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%;">`;
}

function getDynamicExpansion(expansionRaw) {
    if (!expansionRaw) return expansionRaw;
    let result = expansionRaw;

    if (typeof dayjs !== 'undefined') {
        result = result.replace(/\{\{date:([^}]+)\}\}/g, (_, fmt) => dayjs().format(fmt));

        const aliases = {
            '{{mydate}}': 'MM/DD/YYYY',
            '{{mydate-long}}': 'MMMM D, YYYY',
            '{{mytime}}': 'h:mm A',
            '{{mytime-24}}': 'HH:mm',
            '{{mydow}}': 'dddd',
            '{{mydow-short}}': 'ddd',
            '{{mymonth}}': 'MMMM',
            '{{mymonth-short}}': 'MMM',
            '{{myyear}}': 'YYYY',
            '{{mydate-iso}}': 'YYYY-MM-DD',
        };

        for (const [placeholder, fmt] of Object.entries(aliases)) {
            if (result.includes(placeholder)) {
                const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                result = result.replace(new RegExp(escaped, 'g'), dayjs().format(fmt));
            }
        }
    }

    return result;
}

async function copySnippet(snippet, button) {
    try {
        await navigator.clipboard.writeText(getDynamicExpansion(snippet.expansion || ''));
        const originalTitle = button.title;
        button.innerHTML = checkIconSvg;
        button.title = 'Copied';
        button.classList.add('copied');
        setTimeout(() => {
            button.innerHTML = copyIconSvg;
            button.title = originalTitle;
            button.classList.remove('copied');
        }, 1200);
    } catch (error) {
        alert('Failed to copy snippet.');
    }
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
    renderCategoryFilter();
    filterAndRender();
}

function filterAndRender() {
    DOM.spinner.classList.add('hidden');
    
    const query = DOM.searchInput.value.toLowerCase().trim();
    const selectedCategory = normalizeCategory(DOM.categoryFilter.value).toLowerCase();
    const filtered = allSnippets.filter(s => {
        const category = getSnippetCategory(s);
        const matchesQuery =
            (s.title || '').toLowerCase().includes(query) ||
            (s.expansion || '').toLowerCase().includes(query) ||
            category.toLowerCase().includes(query);

        const matchesCategory = !selectedCategory || category.toLowerCase() === selectedCategory;
        return matchesQuery && matchesCategory;
    });
    
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
            const category = getSnippetCategory(snippet);
            
            const realTitle = (snippet.title && !snippet.title.startsWith(';;__')) 
                ? snippet.title.replace(/^;+/, '').trim() 
                : null;
                
            let previewText = getDynamicExpansion(snippet.expansion);
            if (previewText.length > 200) previewText = previewText.substring(0, 200) + '...';
            
            // Clean up html tags before rendering preview
            const tempDiv = document.createElement('div');
            tempDiv.textContent = previewText;
            const safePreviewText = tempDiv.innerHTML;
            
            card.innerHTML = `
                <div class="snippet-header">
                    ${realTitle ? `<div class="snippet-title">${realTitle}</div>` : ''}
                    <div class="snippet-actions">
                        <button class="icon-btn copy-btn" title="Copy expansion">
                            ${copyIconSvg}
                        </button>
                        <button class="icon-btn edit-btn" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                        <button class="icon-btn delete-btn" style="color:#ef4444;" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c0 1 1 2 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </button>
                    </div>
                </div>
                <div class="snippet-content">${safePreviewText}</div>
                <div class="snippet-footer">
                    ${category ? `<span class="snippet-category">${category}</span>` : '<span></span>'}
                </div>
            `;

            card.addEventListener('click', (event) => {
                if (event.target.closest('.snippet-actions')) return;
                openModal(snippet);
            });
            card.querySelector('.copy-btn').addEventListener('click', async (event) => {
                event.stopPropagation();
                await copySnippet(snippet, event.currentTarget);
            });
            card.querySelector('.edit-btn').addEventListener('click', (event) => {
                event.stopPropagation();
                openModal(snippet);
            });
            card.querySelector('.delete-btn').addEventListener('click', (event) => {
                event.stopPropagation();
                deleteSnippet(snippet.id);
            });
            
            DOM.grid.appendChild(card);
        });
    }
}

DOM.searchInput.addEventListener('input', filterAndRender);
DOM.categoryFilter.addEventListener('change', filterAndRender);

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
    } else if (getSnippetCategory(id)) {
        try {
            const nextCategories = { ...snippetCategories };
            delete nextCategories[String(id)];
            await persistSnippetCategories(nextCategories);
            renderCategoryFilter();
        } catch (categoryError) {
            console.error('Failed to remove snippet category:', categoryError);
        }
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
        DOM.categoryInput.value = getSnippetCategory(snippet);
        DOM.expansionInput.value = snippet.expansion;
    } else {
        DOM.modalTitle.textContent = 'New Snippet';
        DOM.idInput.value = '';
        DOM.categoryInput.value = '';
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

function openBulkModal(categoryName = DOM.categoryFilter.value) {
    const fallbackName = normalizeCategory(DOM.searchInput.value);
    const normalized = normalizeCategory(categoryName) || fallbackName;
    const listItems = getManagedListSnippets(normalized).map(snippet => snippet.expansion || '');

    DOM.bulkOriginalCategoryInput.value = normalized;
    DOM.bulkCategoryNameInput.value = normalized;
    DOM.bulkItemsInput.value = listItems.join('\n');
    DOM.bulkModalOverlay.classList.remove('hidden');
    DOM.bulkCategoryNameInput.focus();
    DOM.bulkCategoryNameInput.select();
}

function closeBulkModal() {
    DOM.bulkModalOverlay.classList.add('hidden');
}

DOM.bulkEditBtn.addEventListener('click', () => openBulkModal());
DOM.bulkModalClose.addEventListener('click', closeBulkModal);
DOM.bulkModalCancel.addEventListener('click', closeBulkModal);
DOM.bulkModalOverlay.addEventListener('click', (e) => {
    if (e.target === DOM.bulkModalOverlay) closeBulkModal();
});

DOM.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = DOM.idInput.value;
    const title = DOM.titleInput.value.trim();
    const expansion = DOM.expansionInput.value.trim();
    const category = normalizeCategory(DOM.categoryInput.value);
    
    if (!expansion) return;
    
    DOM.saveBtn.textContent = 'Saving...';
    DOM.saveBtn.disabled = true;
    
    let error;
    let savedSnippetId = id;
    if (id) {
        // Update
        const { error: updateError } = await supabase
            .from('shortcuts')
            .update({ title, expansion })
            .eq('id', id);
        error = updateError;
    } else {
        // Insert
        const { data: insertedSnippet, error: insertError } = await supabase
            .from('shortcuts')
            .insert([{ title, expansion }])
            .select('id')
            .single();
        error = insertError;
        savedSnippetId = insertedSnippet?.id;
    }
    
    DOM.saveBtn.textContent = 'Save Snippet';
    DOM.saveBtn.disabled = false;
    
    if (error) {
        console.error("Save error:", error);
        alert("Failed to save snippet: " + error.message);
    } else {
        try {
            const nextCategories = { ...snippetCategories };
            if (category) nextCategories[String(savedSnippetId)] = category;
            else delete nextCategories[String(savedSnippetId)];
            await persistSnippetCategories(nextCategories);
            renderCategoryFilter();
        } catch (categoryError) {
            console.error('Failed to save category:', categoryError);
            alert('Snippet saved, but category could not be updated.');
        }
        closeModal();
        loadSnippets(); // Reload to get fresh data incl IDs
    }
});

DOM.bulkForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const originalCategory = normalizeCategory(DOM.bulkOriginalCategoryInput.value);
    const nextCategory = normalizeCategory(DOM.bulkCategoryNameInput.value);
    const nextLines = uniqueLines(DOM.bulkItemsInput.value);

    if (!nextCategory) {
        alert('Please choose or type a list name first.');
        return;
    }

    DOM.bulkSaveBtn.textContent = 'Saving...';
    DOM.bulkSaveBtn.disabled = true;

    try {
        const nextCategories = { ...snippetCategories };

        if (originalCategory && originalCategory !== nextCategory) {
            allSnippets
                .filter(snippet => getSnippetCategory(snippet) === originalCategory)
                .forEach(snippet => {
                    nextCategories[String(snippet.id)] = nextCategory;
                });
        }

        const existingManaged = getManagedListSnippets(nextCategory, nextCategories);
        const existingByExpansion = new Map(
            existingManaged.map(snippet => [(snippet.expansion || '').trim(), snippet])
        );

        const linesToKeep = new Set(nextLines);
        const snippetsToDelete = existingManaged.filter(snippet => !linesToKeep.has((snippet.expansion || '').trim()));
        const linesToCreate = nextLines.filter(line => !existingByExpansion.has(line));

        if (snippetsToDelete.length > 0) {
            const idsToDelete = snippetsToDelete.map(snippet => snippet.id);
            const { error: deleteError } = await supabase
                .from('shortcuts')
                .delete()
                .in('id', idsToDelete);

            if (deleteError) throw deleteError;

            idsToDelete.forEach(id => delete nextCategories[String(id)]);
        }

        if (linesToCreate.length > 0) {
            const { data: insertedSnippets, error: insertError } = await supabase
                .from('shortcuts')
                .insert(linesToCreate.map(expansion => ({ title: '', expansion })))
                .select('id, expansion');

            if (insertError) throw insertError;

            (insertedSnippets || []).forEach(snippet => {
                nextCategories[String(snippet.id)] = nextCategory;
            });
        }

        await persistSnippetCategories(nextCategories);
        DOM.categoryFilter.value = nextCategory;
        closeBulkModal();
        await loadSnippets();
    } catch (error) {
        console.error('Bulk save error:', error);
        alert('Failed to save list: ' + error.message);
    } finally {
        DOM.bulkSaveBtn.textContent = 'Save List';
        DOM.bulkSaveBtn.disabled = false;
    }
});

// Boot
document.addEventListener('DOMContentLoaded', checkUser);
