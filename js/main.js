// Language translations
const translations = {
  de: {
    searchPlaceholder: "Tool suchen...",
    titlePlaceholder: "z.B. Neuer PDF-Converter",
    messagePlaceholder: "Beschreibe dein Anliegen ausführlich...",
    emailPlaceholder: "deine@email.de"
  },
  en: {
    searchPlaceholder: "Search tools...",
    titlePlaceholder: "e.g. New PDF Converter",
    messagePlaceholder: "Describe your request in detail...",
    emailPlaceholder: "your@email.com"
  }
};

// --- Beta Access Config ---
const ADMIN_PASSWORD = 'yarak'; // Ändere das Passwort hier

function isBetaUnlocked() {
  try {
    return localStorage.getItem('betaAccess') === 'true';
  } catch (e) {
    return false;
  }
}

function setBetaUnlocked(unlocked) {
  try {
    if (unlocked) {
      localStorage.setItem('betaAccess', 'true');
    } else {
      localStorage.removeItem('betaAccess');
    }
  } catch (e) {
    // ignore
  }
}

function updateBetaVisibility() {
  const betaCards = document.querySelectorAll('[data-beta="true"]');
  const unlocked = isBetaUnlocked();
  betaCards.forEach(card => {
    if (unlocked) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  });

  const betaBtn = document.getElementById('betaBtn');
  if (betaBtn) {
    const betaLabel = betaBtn.querySelector('.beta-text');
    if (betaLabel) {
      betaLabel.textContent = unlocked ? 'Beta On' : 'Beta';
    }
    betaBtn.setAttribute('title', unlocked ? 'Beta-Tools gesperren' : 'Beta-Tools entsperren');
  }
}

function setupBetaAccess() {
  const betaBtn = document.getElementById('betaBtn');
  if (!betaBtn) return;

  betaBtn.addEventListener('click', () => {
    if (isBetaUnlocked()) {
      setBetaUnlocked(false);
      updateBetaVisibility();
      alert('Beta-Tools wurden gesperrt.');
      return;
    }
    const pw = prompt('Admin-Passwort eingeben, um Beta-Tools zu entsperren:');
    if (pw && pw === ADMIN_PASSWORD) {
      setBetaUnlocked(true);
      updateBetaVisibility();
      alert('Beta-Tools entsperrt.');
    } else if (pw !== null) {
      alert('Falsches Passwort.');
    }
  });

  // initial state on load
  updateBetaVisibility();
}

// Current language
let currentLang = 'de';

// Detect user's language based on browser/location
function detectLanguage() {
  const browserLang = navigator.language || navigator.userLanguage;
  
  // Check if browser language starts with 'de' (German)
  if (browserLang.toLowerCase().startsWith('de')) {
    return 'de';
  }
  
  // Default to English for all other languages
  return 'en';
}

// Initialize language on page load
function initLanguage() {
  currentLang = detectLanguage();
  updateLanguage(currentLang);
}

// Update all text elements based on language
function updateLanguage(lang) {
  currentLang = lang;
  
  // Update HTML lang attribute
  document.documentElement.lang = lang;
  
  // Update all elements with data-de and data-en attributes
  const elements = document.querySelectorAll('[data-de][data-en]');
  elements.forEach(el => {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = el.getAttribute(`data-${lang}`);
    } else if (el.tagName === 'OPTION') {
      el.textContent = el.getAttribute(`data-${lang}`);
    } else {
      el.textContent = el.getAttribute(`data-${lang}`);
    }
  });
  
  // Update language button
  const flagMap = { de: 'DE', en: 'EN' };
  const langCodeMap = { de: 'DE', en: 'EN' };
  document.getElementById('currentFlag').textContent = flagMap[lang];
  document.getElementById('currentLang').textContent = langCodeMap[lang];
  
  // Update form placeholders
  updatePlaceholders(lang);
}

// Update form placeholders
function updatePlaceholders(lang) {
  const searchInput = document.getElementById('searchInput');
  const titleInput = document.getElementById('feedbackTitle');
  const messageInput = document.getElementById('feedbackMessage');
  const emailInput = document.getElementById('feedbackEmail');
  
  if (searchInput) searchInput.placeholder = translations[lang].searchPlaceholder;
  if (titleInput) titleInput.placeholder = translations[lang].titlePlaceholder;
  if (messageInput) messageInput.placeholder = translations[lang].messagePlaceholder;
  if (emailInput) emailInput.placeholder = translations[lang].emailPlaceholder;
}

// Language dropdown toggle
function setupLanguageSelector() {
  const langBtn = document.getElementById('langBtn');
  const langDropdown = document.getElementById('langDropdown');
  const langOptions = langDropdown.querySelectorAll('li');
  
  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langDropdown.classList.toggle('hidden');
  });
  
  langOptions.forEach(option => {
    option.addEventListener('click', () => {
      const selectedLang = option.getAttribute('data-lang');
      updateLanguage(selectedLang);
      langDropdown.classList.add('hidden');
    });
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    langDropdown.classList.add('hidden');
  });
}

// Search functionality
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  const toolCards = document.querySelectorAll('.tool-card');
  
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    
    toolCards.forEach(card => {
      const title = card.querySelector('.tool-title').textContent.toLowerCase();
      const description = card.querySelector('.tool-description').textContent.toLowerCase();
      
      if (title.includes(searchTerm) || description.includes(searchTerm)) {
        card.classList.remove('hidden');
        card.style.animation = 'fadeInUp 0.5s ease';
      } else {
        card.classList.add('hidden');
      }
    });
  });
}

// Category filter functionality
function setupCategoryFilter() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const toolCards = document.querySelectorAll('.tool-card');
  
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.getAttribute('data-category');
      
      // Update active button
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Filter cards
      toolCards.forEach(card => {
        const cardCategory = card.getAttribute('data-category');
        
        if (category === 'all' || cardCategory === category) {
          card.classList.remove('hidden');
          card.style.animation = 'fadeInUp 0.5s ease';
        } else {
          card.classList.add('hidden');
        }
      });
      
      // Clear search when filtering
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
    });
  });
}

// Feedback form submission (Netlify)
function setupFeedbackForm() {
  const form = document.getElementById('feedbackForm');
  const successMessage = document.getElementById('successMessage');
  if (!form || !successMessage) {
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    try {
      const response = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(formData).toString(),
      });

      if (response.ok) {
        successMessage.classList.remove("hidden");
        form.reset();
        successMessage.scrollIntoView({ behavior: "smooth", block: "center" });

        setTimeout(() => successMessage.classList.add("hidden"), 5000);
      } else {
        alert("Fehler beim Senden. Bitte erneut versuchen.");
      }
    } catch (error) {
      console.error("Form submission failed:", error);
      alert("Fehler beim Senden. Bitte erneut versuchen.");
    }
  });
}


// Initialize all functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  setupCategoryFilter();
  setupFeedbackForm();
  setupBetaAccess();
  
  console.log('Transformers initialized successfully.');
});
