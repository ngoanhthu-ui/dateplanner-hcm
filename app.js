// ==========================================
// 1. KẾT NỐI CƠ SỞ DỮ LIỆU ĐÁM MÂY (FIREBASE)
// ==========================================
// Demo MVP only. Production must use Firebase Authentication, Firestore Security Rules,
// server-side email sending/rate limiting, environment variables, and domain restrictions.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, getDocs, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// Demo only. Production must use Firebase Authentication and Security Rules.
// Firebase API key is public client configuration, not a server secret.
const firebaseConfig = {
    apiKey: "AIzaSyA-QidyMRaVr3ux3tVQPBhsa67zRl4w2pc",
    authDomain: "dateplanner-f2ebf.firebaseapp.com",
    projectId: "dateplanner-f2ebf",
    storageBucket: "dateplanner-f2ebf.firebasestorage.app",
    messagingSenderId: "687743887349",
    appId: "1:687743887349:web:f23b908ba2f018d036a2bc",
    measurementId: "G-1JN82ES6NK"
};

// Khởi tạo Đám mây
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const leadsCollection = collection(db, "leads");
// PIN này chỉ dùng cho demo, không dùng cho production. Khi triển khai thật cần dùng Firebase Authentication và phân quyền theo partner.
const ADMIN_DEMO_PIN = "DP2026B2B!";
const LEGACY_COMMISSION_FALLBACK = 10000;
const VOUCHER_VALID_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const BASE_YEAR = 2026;
const DEFAULT_INFLATION_RATE = 0.04;
const TIER_CONFIG = {
    basic: { baseFee: 8000, rate: 0.05 },
    growth: { baseFee: 12000, rate: 0.07 },
    premium: { baseFee: 18000, rate: 0.09 }
};
const VISIBILITY_FACTOR = {
    normal: 1,
    mood: 1.15,
    featured: 1.3
};
const EMAILJS_PUBLIC_KEY = "RU8QbESICVGc8h_rl";
const EMAILJS_SERVICE_ID = "service_2026";
const EMAILJS_TEMPLATE_ID = "template_fcoq5lq";
const ADMIN_MAX_FAILED_ATTEMPTS = 5;
const ADMIN_LOCKOUT_MS = 30 * 1000;
let adminFailedAttempts = 0;
let adminLockedUntil = 0;
const LEAD_STATUSES = {
    pending: {
        label: 'Pending',
        csvLabel: 'pending - da lay voucher, chua xac nhan dung',
        badgeClass: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
        icon: 'fa-clock'
    },
    used: {
        label: 'Used',
        csvLabel: 'used - da xac nhan dung tai quan',
        badgeClass: 'bg-green-500/20 text-green-400 border border-green-500/30',
        icon: 'fa-check-circle'
    },
    expired: {
        label: 'Expired',
        csvLabel: 'expired - het han',
        badgeClass: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
        icon: 'fa-hourglass-end'
    },
    cancelled: {
        label: 'Cancelled',
        csvLabel: 'cancelled - huy/khong hop le',
        badgeClass: 'bg-red-500/20 text-red-300 border border-red-500/30',
        icon: 'fa-ban'
    }
};
const VALID_LEAD_STATUSES = new Set(Object.keys(LEAD_STATUSES));
const LOCAL_FALLBACK_IMAGE = (title = 'DatePlanner') => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520"><rect width="100%" height="100%" fill="#171717"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" fill="#f43f5e">${title}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

function getFallbackImageSrc(title = 'DatePlanner') {
    return typeof window.getDatePlannerFallbackImage === 'function'
        ? window.getDatePlannerFallbackImage(title)
        : LOCAL_FALLBACK_IMAGE(title);
}

window.handleImageFallback = window.handleImageFallback || function(img) {
    if (!img) return;
    img.onerror = null;
    img.src = getFallbackImageSrc(img.alt || 'DatePlanner');
};

function getImageAttrs() {
    return 'loading="lazy" decoding="async" onerror="window.handleImageFallback(this)"';
}

function escapeHTML(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setTextById(id, value = '') {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function getSafeLeadName(name) {
    return String(name || '').trim().slice(0, 60);
}

function applyLocalComboImages() {
    if (typeof localComboImages === 'undefined' || !Array.isArray(combos)) return;

    combos.forEach((combo) => {
        if (localComboImages[combo.id]) {
            combo.img = localComboImages[combo.id];
        }
    });
}

function getComboImage(combo) {
    return combo?.img || getFallbackImageSrc(combo?.title);
}

function getComboItinerary(combo) {
    if (Array.isArray(combo?.itinerary) && combo.itinerary.length > 0) return combo.itinerary;

    return [{
        time: 'Gợi ý',
        activity: combo?.desc || 'Khám phá lộ trình DatePlanner',
        location: combo?.address || 'TP.HCM'
    }];
}

function getGoogleMapsDirectionsUrl(location) {
    const safeLocation = String(location || '').trim();
    if (!safeLocation) return '#';

    const lowerLocation = safeLocation.toLowerCase();
    const normalizedLocation = lowerLocation.includes('tp.hcm') || lowerLocation.includes('hồ chí minh') || lowerLocation.includes('ho chi minh')
        ? safeLocation
        : `${safeLocation}, TP.HCM`;

    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(normalizedLocation)}`;
}

window.getGoogleMapsDirectionsUrl = getGoogleMapsDirectionsUrl;

function formatComboPrice(combo) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(combo?.price || 0));
}

function getComboArea(combo) {
    const address = String(combo?.address || 'TP.HCM');
    const parts = address.split(',').map(part => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : address;
}

function getTargetLabel(combo) {
    if (combo?.target === 'couple') return 'Cặp đôi';
    if (combo?.target === 'group') return 'Hội nhóm';
    return 'Linh hoạt';
}

function getComboAccentClass(combo) {
    if (combo?.category === 'high') return 'accent-premium';
    if (combo?.category === 'mid') return 'accent-mid';
    if (combo?.target === 'group') return 'accent-group';
    return 'accent-budget';
}

function getComboTypeBadge(combo) {
    if (combo?.target === 'group') {
        return '<span class="text-xs text-violet-100 bg-violet-500/15 border border-violet-400/25 px-2.5 py-1 rounded-full font-bold shrink-0">Hội nhóm</span>';
    }
    if (combo?.category === 'high') {
        return '<span class="text-xs text-rose-100 bg-rose-500/15 border border-rose-400/25 px-2.5 py-1 rounded-full font-bold shrink-0">Cao cấp</span>';
    }
    if (combo?.category === 'mid') {
        return '<span class="text-xs text-orange-100 bg-orange-500/15 border border-orange-400/25 px-2.5 py-1 rounded-full font-bold shrink-0">Tiêu chuẩn</span>';
    }
    return '<span class="text-xs text-cyan-100 bg-cyan-500/15 border border-cyan-400/25 px-2.5 py-1 rounded-full font-bold shrink-0">Bình dân</span>';
}

function getMoodReason(moodType) {
    const reasons = {
        chill: 'Hợp cho một buổi đi chậm, ít phải lên kế hoạch.',
        active: 'Có hoạt động để cả nhóm dễ vào mood ngay.',
        romantic: 'Không gian vừa đủ riêng tư, lịch trình không quá dày.',
        fun: 'Dễ rủ đông người và ít rủi ro hụt hứng.'
    };
    return reasons[moodType] || 'Lộ trình cân bằng giữa ngân sách, khu vực và trải nghiệm.';
}

function getMoodTheme(moodType) {
    const themes = {
        chill: {
            resultBorder: 'border-sky-400/35',
            badge: 'bg-sky-400/15 text-sky-200 border border-sky-400/25',
            icon: 'text-sky-300',
            cta: 'bg-sky-400 text-[#061018] hover:bg-sky-300 focus-visible:ring-sky-300'
        },
        active: {
            resultBorder: 'border-orange-400/35',
            badge: 'bg-orange-400/15 text-orange-200 border border-orange-400/25',
            icon: 'text-orange-300',
            cta: 'bg-orange-400 text-[#160b05] hover:bg-orange-300 focus-visible:ring-orange-300'
        },
        romantic: {
            resultBorder: 'border-rose-400/35',
            badge: 'bg-rose-400/15 text-rose-200 border border-rose-400/25',
            icon: 'text-rose-300',
            cta: 'primary-action text-white'
        },
        fun: {
            resultBorder: 'border-violet-400/35',
            badge: 'bg-violet-400/15 text-violet-200 border border-violet-400/25',
            icon: 'text-violet-300',
            cta: 'bg-violet-400 text-white hover:bg-violet-300 focus-visible:ring-violet-300'
        }
    };
    return themes[moodType] || themes.romantic;
}

function getTrendingRankClass(index) {
    const rankClasses = [
        'bg-gradient-to-r from-amber-300 to-rose-500 text-[#160B05] border border-amber-200/60',
        'bg-orange-400 text-[#170B05] border border-orange-200/50',
        'bg-violet-500 text-white border border-violet-300/40',
        'bg-slate-600 text-white border border-slate-400/25',
        'bg-gray-700 text-gray-100 border border-gray-500/25'
    ];
    return rankClasses[index] || rankClasses[4];
}

function getInflationFactor() {
    const currentYear = new Date().getFullYear();
    return Math.pow(1 + DEFAULT_INFLATION_RATE, currentYear - BASE_YEAR);
}

function getQualityFactor(conversionRate = 0.3) {
    const normalizedRate = Number.isFinite(Number(conversionRate)) ? Number(conversionRate) : 0.3;
    const rateAsPercent = normalizedRate <= 1 ? normalizedRate * 100 : normalizedRate;

    if (rateAsPercent < 20) return 0.9;
    if (rateAsPercent > 40) return 1.1;
    return 1.0;
}

function calculateCommission(combo, conversionRate) {
    const tier = combo?.partnerTier || 'basic';
    const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.basic;
    const visibilityLevel = combo?.visibilityLevel || 'normal';
    const visibilityFactor = VISIBILITY_FACTOR[visibilityLevel] || VISIBILITY_FACTOR.normal;
    const estimatedAOV = Number(combo?.estimatedAOV || combo?.price || 0);
    const baseFee = Number(combo?.baseFee || tierConfig.baseFee);
    const commissionRate = Number(combo?.commissionRate || tierConfig.rate);
    const inflationFactor = getInflationFactor();
    const qualityFactor = getQualityFactor(conversionRate);
    const variableCommission = estimatedAOV * commissionRate * inflationFactor * qualityFactor * visibilityFactor;
    const commissionAmount = Math.round(Math.max(baseFee, variableCommission));

    return {
        partnerTier: tier,
        estimatedAOV,
        commissionRate,
        baseFee,
        visibilityLevel,
        inflationFactor,
        qualityFactor,
        visibilityFactor,
        commissionAmount,
        commissionFormulaText: `max(${baseFee}, ${estimatedAOV} x ${commissionRate} x ${inflationFactor.toFixed(4)} x ${qualityFactor.toFixed(2)} x ${visibilityFactor}) = ${commissionAmount}`
    };
}

function getLeadCommissionAmount(lead) {
    return Number.isFinite(Number(lead?.commissionAmount)) ? Number(lead.commissionAmount) : LEGACY_COMMISSION_FALLBACK;
}

function normalizeLeadStatus(status) {
    return VALID_LEAD_STATUSES.has(status) ? status : 'pending';
}

function getLeadExpiryTimestamp(lead) {
    if (!lead) return null;
    const expiresAt = Number(lead.expiresAt);
    return Number.isFinite(expiresAt) ? expiresAt : null;
}

function getEffectiveLeadStatus(lead) {
    const status = normalizeLeadStatus(lead?.status);
    const expiresAt = getLeadExpiryTimestamp(lead);

    if (status === 'pending' && expiresAt && expiresAt < Date.now()) {
        return 'expired';
    }

    return status;
}

function formatLeadDateTime(timestamp) {
    if (timestamp === null || timestamp === undefined || timestamp === '') return '';
    const date = new Date(Number(timestamp));
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleTimeString('vi-VN') + ' - ' + date.toLocaleDateString('vi-VN');
}

function formatItineraryForEmail(combo) {
    return getComboItinerary(combo)
        .map(item => {
            const time = item?.time || '';
            const activity = item?.activity || '';
            const location = item?.location || '';

            return [time, activity, location].filter(Boolean).join(' - ');
        })
        .join('\n');
}

async function sendVoucherEmail(leadData, selectedCombo) {
    if (!window.emailjs) {
        throw new Error('EmailJS SDK is not available.');
    }

    const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedCombo?.price || 0);

    // Public key only. Khi trien khai that can gioi han domain/origin tren EmailJS va them chong spam/rate limit.
    const templateParams = {
        to_email: leadData.email,
        to_name: leadData.name,
        voucher_code: leadData.code,
        combo_title: selectedCombo?.title || leadData.combo,
        combo_price: formattedPrice,
        combo_address: selectedCombo?.address || '',
        combo_itinerary: formatItineraryForEmail(selectedCombo),
        discount: selectedCombo?.discount || '',
        expires_at: leadData.expiresAtText || formatLeadDateTime(leadData.expiresAt)
    };

    console.log("Dang gui email voucher qua EmailJS:", {
        serviceId: EMAILJS_SERVICE_ID,
        templateId: EMAILJS_TEMPLATE_ID,
        toEmail: maskEmail(templateParams.to_email),
        comboTitle: templateParams.combo_title
    });

    return window.emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams,
        { publicKey: EMAILJS_PUBLIC_KEY }
    );
}

function getLeadStatusTimestamp(lead, status = getEffectiveLeadStatus(lead)) {
    if (status === 'used') return lead.usedAt || '';
    if (status === 'cancelled') return lead.cancelledAt || '';
    if (status === 'expired') return lead.expiredAt || lead.expiresAtText || formatLeadDateTime(getLeadExpiryTimestamp(lead));
    return '';
}

function maskPhone(phone) {
    const value = String(phone || '').trim();
    if (value.length <= 6) return value ? '***' : '';

    return `${value.slice(0, 3)}****${value.slice(-3)}`;
}

function maskEmail(email) {
    const value = String(email || '').trim();
    const [localPart, domain] = value.split('@');
    if (!localPart || !domain) return value ? '***' : '';

    const visiblePrefixLength = Math.min(3, localPart.length);
    return `${localPart.slice(0, visiblePrefixLength)}***@${domain}`;
}

// Biến lưu trữ data toàn cục
window.cloudLeads = [];
let isSubmittingLead = false;

// 🔴 LẮNG NGHE REAL-TIME: Bất cứ khi nào có khách đăng ký, tự động tải về Admin
onSnapshot(leadsCollection, (snapshot) => {
    window.cloudLeads = [];
    snapshot.forEach((doc) => {
        const lead = doc.data();
        window.cloudLeads.push({
            firebaseId: doc.id,
            ...lead,
            status: getEffectiveLeadStatus(lead),
            rawStatus: normalizeLeadStatus(lead.status)
        });
    });
    
    // Tự động tải lại bảng Admin ngay lập tức nếu đang mở
    const adminView = document.getElementById('admin-view');
    if (adminView && !adminView.classList.contains('hidden')) {
        window.populatePartnerFilter();
        window.renderAdminData();
    }
});

// ==========================================
// 2. TÍNH NĂNG NHẠC LOFI (MUSIC PLAYER)
// ==========================================
window.isMusicPlaying = false;
window.toggleMusic = function() {
    const audio = document.getElementById('bg-music');
    const icon = document.getElementById('music-icon');
    const vinyl = document.getElementById('vinyl-img');
    const text = document.getElementById('music-text');
    const overlay = document.getElementById('music-overlay');

    if (window.isMusicPlaying) {
        audio.pause();
        icon.className = 'fa-solid fa-play text-sm ml-1';
        vinyl.style.animationPlayState = 'paused';
        text.innerText = 'Đã tạm dừng';
        overlay.classList.remove('opacity-0');
        window.isMusicPlaying = false;
    } else {
        audio.play().then(() => {
            icon.className = 'fa-solid fa-pause text-sm';
            vinyl.style.animationPlayState = 'running';
            text.innerText = 'Đang phát: Chill Lofi 🎵';
            overlay.classList.add('opacity-0');
            window.isMusicPlaying = true;
        }).catch((error) => {
            console.error(error);
            alert("Trình duyệt đang chặn phát nhạc tự động. Bạn hãy tương tác với trang một chút rồi thử lại nhé!");
            text.innerText = 'Lỗi phát nhạc!';
            window.isMusicPlaying = false;
        });
    }
};

// ==========================================
// 3. BẮT MẠCH CẢM XÚC (MOOD QUIZ)
// ==========================================

window.renderTrendingCombos = function() {
    const grid = document.getElementById('trending-grid');
    if (!grid) return;

    const trendingCombos = [...combos]
        .sort((a, b) => Number(b.bookings || 0) - Number(a.bookings || 0))
        .slice(0, 5);

    grid.innerHTML = trendingCombos.map((combo, index) => {
        const rank = index + 1;
        const isTop = rank === 1;
        const interestCount = Number(combo.bookings || 0);

        return `
            <article class="trending-card ${isTop ? 'rank-1' : ''} snap-start rounded-[1.7rem] overflow-hidden group relative" tabindex="0">
                <div class="relative h-[25rem] md:h-[28rem] overflow-hidden cursor-pointer" onclick="window.openComboDetail(${combo.id})">
                    <img src="${getComboImage(combo)}" class="w-full h-full object-cover opacity-95 group-hover:opacity-100" alt="${combo.title}" ${getImageAttrs()}>
                    <div class="absolute inset-0 bg-gradient-to-t from-[#07070a] via-[#07070a]/44 to-transparent"></div>
                    <div class="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 to-transparent"></div>
                    <div class="absolute top-5 left-5 right-5 flex items-start justify-between gap-4 z-10">
                        <span class="trending-badge inline-flex items-center gap-2 bg-white/10 border border-white/15 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-[0.18em]">
                            <i class="fa-solid fa-fire text-orange-300"></i>Trending
                        </span>
                        <span class="inline-flex items-center gap-1.5 bg-black/45 border border-white/15 backdrop-blur-md text-amber-100 px-3 py-1.5 rounded-full text-xs font-black">
                            <i class="fa-solid fa-users"></i>${interestCount} luot
                        </span>
                    </div>
                    <div class="absolute left-5 bottom-5 right-5 z-10">
                        <div class="trending-rank ${isTop ? 'text-amber-200' : 'text-white/88'} font-black mb-5">#${rank}</div>
                        <p class="text-sm text-zinc-300 mb-2 font-bold">${getComboArea(combo)} / ${getTargetLabel(combo)}</p>
                        <h3 class="trending-title card-title text-3xl md:text-4xl font-black text-white leading-[0.98] tracking-tight">${combo.title}</h3>
                    </div>
                </div>
                <div class="p-5 bg-[#111118]/96 border-t border-white/10">
                    <div class="flex items-center justify-between gap-4">
                        <div>
                            <p class="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-black mb-1">Gia du kien</p>
                            <span class="text-2xl font-black text-white">${formatComboPrice(combo)}</span>
                        </div>
                        <button onclick="window.openComboDetail(${combo.id})" class="interactive-btn ${isTop ? 'primary-action' : 'secondary-action'} px-5 py-3 rounded-xl text-sm font-black shrink-0">
                            Xem chi tiet
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
};

window.initTrendingAutoScroll = function() {
    const grid = document.getElementById('trending-grid');
    if (!grid) return;

    if (grid._trendingRafId) {
        cancelAnimationFrame(grid._trendingRafId);
        grid._trendingRafId = null;
    }
    if (grid._trendingAbortController) {
        grid._trendingAbortController.abort();
    }
    grid._trendingAbortController = new AbortController();
    const listenerOptions = { signal: grid._trendingAbortController.signal };
    const passiveListenerOptions = { passive: true, signal: grid._trendingAbortController.signal };

    grid.querySelectorAll('[data-trending-clone="true"]').forEach(clone => clone.remove());

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const originalCards = Array.from(grid.children);
    if (originalCards.length === 0) return;

    const updateCenterCard = () => {
        const gridRect = grid.getBoundingClientRect();
        const centerX = gridRect.left + gridRect.width / 2;
        let closestCard = null;
        let closestDistance = Number.POSITIVE_INFINITY;

        Array.from(grid.children).forEach(card => {
            const cardRect = card.getBoundingClientRect();
            const cardCenter = cardRect.left + cardRect.width / 2;
            const distance = Math.abs(centerX - cardCenter);

            if (distance < closestDistance) {
                closestDistance = distance;
                closestCard = card;
            }
        });

        grid.querySelectorAll('.is-center').forEach(card => card.classList.remove('is-center'));
        if (closestCard) closestCard.classList.add('is-center');
    };

    if (prefersReducedMotion || originalCards.length < 2) {
        updateCenterCard();
        grid.addEventListener('scroll', updateCenterCard, passiveListenerOptions);
        return;
    }

    const fragment = document.createDocumentFragment();
    originalCards.forEach(card => {
        const clone = card.cloneNode(true);
        clone.dataset.trendingClone = 'true';
        clone.setAttribute('aria-hidden', 'true');
        fragment.appendChild(clone);
    });
    grid.appendChild(fragment);

    let firstClone = grid.querySelector('[data-trending-clone="true"]');
    let loopWidth = firstClone ? firstClone.offsetLeft - originalCards[0].offsetLeft : grid.scrollWidth / 2;
    let lastFrameTime = performance.now();
    let isPaused = false;
    let resumeTimer = null;
    const speed = 0.018;

    const recalculateLoopWidth = () => {
        firstClone = grid.querySelector('[data-trending-clone="true"]');
        loopWidth = firstClone ? firstClone.offsetLeft - originalCards[0].offsetLeft : grid.scrollWidth / 2;
        updateCenterCard();
    };

    const pause = () => {
        isPaused = true;
        if (resumeTimer) clearTimeout(resumeTimer);
    };

    const resume = (delay = 0) => {
        if (resumeTimer) clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
            lastFrameTime = performance.now();
            isPaused = false;
        }, delay);
    };

    const tick = (time) => {
        const delta = Math.min(time - lastFrameTime, 48);
        lastFrameTime = time;

        if (!isPaused && loopWidth > 0) {
            grid.scrollLeft += delta * speed;

            if (grid.scrollLeft >= loopWidth) {
                grid.scrollLeft -= loopWidth;
            }

            updateCenterCard();
        }

        grid._trendingRafId = requestAnimationFrame(tick);
    };

    grid.addEventListener('mouseenter', pause, listenerOptions);
    grid.addEventListener('mouseleave', () => resume(120), listenerOptions);
    grid.addEventListener('focusin', pause, listenerOptions);
    grid.addEventListener('focusout', () => resume(120), listenerOptions);
    grid.addEventListener('touchstart', pause, passiveListenerOptions);
    grid.addEventListener('touchend', () => resume(1400), passiveListenerOptions);
    grid.addEventListener('scroll', updateCenterCard, passiveListenerOptions);
    window.addEventListener('resize', recalculateLoopWidth, listenerOptions);

    recalculateLoopWidth();
    grid._trendingRafId = requestAnimationFrame(tick);
};

window.startRandomizer = function() {
    const result = document.getElementById('random-result');
    const details = document.getElementById('random-details');
    const button = document.getElementById('spin-btn');
    if (!result || !details || !button || !Array.isArray(combos) || combos.length === 0) return;

    button.disabled = true;
    button.classList.add('opacity-60', 'cursor-not-allowed');
    details.classList.add('hidden');
    details.innerHTML = '';

    let ticks = 0;
    const maxTicks = 14;
    const ticker = setInterval(() => {
        const combo = combos[Math.floor(Math.random() * combos.length)];
        result.innerText = combo.title;
        result.classList.remove('text-gray-500', 'text-zinc-400');
        result.classList.add('text-white');
        ticks += 1;

        if (ticks >= maxTicks) {
            clearInterval(ticker);
            const selected = combos[Math.floor(Math.random() * combos.length)];
            result.innerText = selected.title;
            details.innerHTML = `
                <div class="animate-fade-in-up text-left grid grid-cols-1 md:grid-cols-[210px_1fr] gap-5 items-center">
                    <img src="${getComboImage(selected)}" class="w-full h-44 md:h-36 object-cover rounded-2xl border border-orange-500/20" alt="${selected.title}" ${getImageAttrs()}>
                    <div>
                        <p class="text-sm text-zinc-400 mb-1">${getComboArea(selected)} · ${getTargetLabel(selected)}</p>
                        <p class="text-zinc-300 mb-4 leading-relaxed">Một gợi ý nhanh dựa trên danh sách lộ trình DatePlanner.</p>
                        <div class="flex items-center justify-between gap-4">
                            <span class="text-xl font-black text-white">${formatComboPrice(selected)}</span>
                            <button onclick="window.openComboDetail(${selected.id})" class="interactive-btn primary-action font-black py-3 px-5 rounded-xl">
                                Xem lộ trình
                            </button>
                        </div>
                    </div>
                </div>
            `;
            details.classList.remove('hidden');
            button.disabled = false;
            button.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }, 90);
};

window.populateInviteCombos = function() {
    const select = document.getElementById('inv-combo');
    if (!select) return;

    select.innerHTML = combos.map(combo => `<option value="${combo.id}">${combo.title}</option>`).join('');
    window.updateInvitePreview();
};

window.updateInvitePreview = function() {
    const nameInput = document.getElementById('inv-name');
    const messageInput = document.getElementById('inv-message');
    if (nameInput && nameInput.value.length > 40) nameInput.value = nameInput.value.slice(0, 40);
    if (messageInput && messageInput.value.length > 160) messageInput.value = messageInput.value.slice(0, 160);
    const name = nameInput?.value.trim() || 'Tên người ấy...';
    const message = messageInput?.value.trim() || 'Cuối tuần này rảnh không, đi đổi gió cùng tớ nhé!';
    const comboId = Number(document.getElementById('inv-combo')?.value || combos[0]?.id);
    const combo = combos.find(item => item.id === comboId) || combos[0];

    if (document.getElementById('prev-name')) document.getElementById('prev-name').innerText = name;
    if (document.getElementById('prev-message')) document.getElementById('prev-message').innerText = `"${message}"`;
    if (document.getElementById('prev-combo-title')) document.getElementById('prev-combo-title').innerText = combo?.title || 'Vui lòng chọn lộ trình';
    if (document.getElementById('prev-combo-address')) document.getElementById('prev-combo-address').innerHTML = `<i class="fa-solid fa-location-dot text-rose-400 mr-2"></i>${combo?.address || 'Địa điểm sẽ hiển thị ở đây'}`;
};

window.randomizeMessage = function() {
    const messages = [
        'Cuối tuần này rảnh không, đi đổi gió cùng tớ nhé!',
        'Tớ tìm được một kèo khá xịn, đi thử không?',
        'Đi chơi một bữa cho đời bớt nhạt nha?',
        'Lịch trình tớ lo, cậu chỉ cần gật đầu thôi.'
    ];
    const input = document.getElementById('inv-message');
    if (!input) return;
    input.value = messages[Math.floor(Math.random() * messages.length)];
    window.updateInvitePreview();
};

window.copyInviteText = async function() {
    const name = document.getElementById('inv-name')?.value.trim() || 'bạn';
    const message = document.getElementById('inv-message')?.value.trim() || '';
    const comboId = Number(document.getElementById('inv-combo')?.value || combos[0]?.id);
    const combo = combos.find(item => item.id === comboId) || combos[0];
    const text = `${name} ơi, ${message}\nLộ trình: ${combo?.title || 'DatePlanner'}\nĐịa điểm: ${combo?.address || 'TP.HCM'}`;
    const button = document.getElementById('copy-inv-btn');

    try {
        await navigator.clipboard.writeText(text);
        if (button) button.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Đã sao chép';
    } catch (error) {
        console.error(error);
        alert(text);
    }

    setTimeout(() => {
        if (button) button.innerHTML = '<i class="fa-regular fa-copy mr-2"></i> Sao chép lời mời';
    }, 1800);
};

function formatInviteDate(value) {
    if (!value) return 'Chọn thời gian hẹn';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Chọn thời gian hẹn';
    return date.toLocaleString('vi-VN', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getSelectedInviteCombo() {
    const comboId = Number(document.getElementById('inv-combo')?.value || combos[0]?.id);
    return combos.find(item => item.id === comboId) || combos[0];
}

function setInviteButtonLoading(button, isLoading, loadingText) {
    if (!button) return;
    if (isLoading) {
        button.dataset.originalHtml = button.innerHTML;
        button.disabled = true;
        button.classList.add('opacity-60', 'cursor-not-allowed');
        button.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i>${loadingText}`;
        return;
    }

    button.disabled = false;
    button.classList.remove('opacity-60', 'cursor-not-allowed');
    if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
    }
}

function showInviteToast(message = 'Đã copy lời mời ✨') {
    const toast = document.getElementById('invite-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

window.currentInviteCardMode = 'story';

window.setInviteCardMode = function(mode = 'story') {
    const normalizedMode = mode === 'square' ? 'square' : 'story';
    const card = document.getElementById('invite-card-preview');
    window.currentInviteCardMode = normalizedMode;

    if (card) {
        card.dataset.mode = normalizedMode;
        card.classList.toggle('is-square', normalizedMode === 'square');
        card.classList.toggle('is-story', normalizedMode === 'story');
    }

    document.getElementById('invite-mode-story')?.classList.toggle('active', normalizedMode === 'story');
    document.getElementById('invite-mode-square')?.classList.toggle('active', normalizedMode === 'square');
};

window.updateInvitePreview = function() {
    const name = document.getElementById('inv-name')?.value.trim() || 'Tên người ấy...';
    const message = document.getElementById('inv-message')?.value.trim() || 'Cuối tuần này rảnh không, đi đổi gió cùng tớ nhé!';
    const combo = getSelectedInviteCombo();
    const inviteDate = formatInviteDate(document.getElementById('inv-date')?.value);
    const background = document.getElementById('inv-card-bg');
    const card = document.getElementById('invite-card-preview');

    if (document.getElementById('prev-name')) document.getElementById('prev-name').innerText = name;
    if (document.getElementById('prev-message')) document.getElementById('prev-message').innerText = `"${message}"`;
    if (document.getElementById('prev-combo-title')) document.getElementById('prev-combo-title').innerText = combo?.title || 'Vui lòng chọn lộ trình';
    if (document.getElementById('prev-combo-address')) document.getElementById('prev-combo-address').innerHTML = `<i class="fa-solid fa-location-dot text-rose-300 mr-2"></i>${escapeHTML(combo?.address || 'Địa điểm sẽ hiển thị ở đây')}`;
    if (document.getElementById('prev-date')) document.getElementById('prev-date').innerText = inviteDate;
    if (background && combo) {
        background.crossOrigin = 'anonymous';
        background.src = getComboImage(combo);
        background.alt = combo.title;
    }
    card?.classList.toggle('is-long-message', message.length > 96);
};

window.copyInviteText = async function() {
    const name = (document.getElementById('inv-name')?.value.trim() || 'bạn').slice(0, 40);
    const message = (document.getElementById('inv-message')?.value.trim() || '').slice(0, 160);
    const combo = getSelectedInviteCombo();
    const inviteDate = formatInviteDate(document.getElementById('inv-date')?.value);
    const timeLine = inviteDate === 'Chọn thời gian hẹn' ? '' : `\nThời gian: ${inviteDate}`;
    const text = `${name} ơi, ${message}\nLộ trình: ${combo?.title || 'DatePlanner'}\nĐịa điểm: ${combo?.address || 'TP.HCM'}${timeLine}`;
    const button = document.getElementById('copy-inv-btn');

    try {
        await navigator.clipboard.writeText(text);
        if (button) button.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Đã copy';
        showInviteToast('Đã copy lời mời ✨');
    } catch (error) {
        console.error(error);
        alert(text);
    }

    setTimeout(() => {
        if (button) button.innerHTML = '<i class="fa-regular fa-copy mr-2"></i> Copy lời mời';
    }, 1800);
};

function loadInviteCanvasImage(src) {
    return new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
    });
}

function drawInviteWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';

    words.forEach((word) => {
        const testLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = testLine;
        }
    });
    if (line) lines.push(line);

    lines.slice(0, maxLines).forEach((textLine, index) => {
        const output = index === maxLines - 1 && lines.length > maxLines ? `${textLine}...` : textLine;
        ctx.fillText(output, x, y + index * lineHeight);
    });

    return Math.min(lines.length, maxLines) * lineHeight;
}

function drawInviteRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}

async function generateInviteCanvasFallback() {
    const combo = getSelectedInviteCombo();
    const name = (document.getElementById('inv-name')?.value.trim() || 'Tên người ấy...').slice(0, 40);
    const message = (document.getElementById('inv-message')?.value.trim() || 'Cuối tuần này rảnh không, đi đổi gió cùng tớ nhé!').slice(0, 160);
    const inviteDate = formatInviteDate(document.getElementById('inv-date')?.value);
    const isSquare = (document.getElementById('invite-card-preview')?.dataset.mode || window.currentInviteCardMode) === 'square';
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = isSquare ? 1080 : 1920;
    const ctx = canvas.getContext('2d');
    const bgImage = await loadInviteCanvasImage(getComboImage(combo));

    if (bgImage) {
        const scale = Math.max(canvas.width / bgImage.width, canvas.height / bgImage.height);
        const width = bgImage.width * scale;
        const height = bgImage.height * scale;
        ctx.drawImage(bgImage, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    } else {
        const fallbackGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        fallbackGradient.addColorStop(0, '#26101c');
        fallbackGradient.addColorStop(0.5, '#111827');
        fallbackGradient.addColorStop(1, '#2b1208');
        ctx.fillStyle = fallbackGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const overlay = ctx.createLinearGradient(0, 0, 0, canvas.height);
    overlay.addColorStop(0, 'rgba(5,5,8,0.36)');
    overlay.addColorStop(0.36, 'rgba(5,5,8,0.24)');
    overlay.addColorStop(1, 'rgba(5,5,8,0.9)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const glowRose = ctx.createRadialGradient(860, 280, 10, 860, 280, 360);
    glowRose.addColorStop(0, 'rgba(244,63,94,0.62)');
    glowRose.addColorStop(1, 'rgba(244,63,94,0)');
    ctx.fillStyle = glowRose;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const glowOrange = ctx.createRadialGradient(140, isSquare ? 880 : 1560, 10, 140, isSquare ? 880 : 1560, 430);
    glowOrange.addColorStop(0, 'rgba(251,146,60,0.46)');
    glowOrange.addColorStop(1, 'rgba(251,146,60,0)');
    ctx.fillStyle = glowOrange;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    drawInviteRoundRect(ctx, 72, 78, 334, 86, 43);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 27px Inter, Arial, sans-serif';
    ctx.fillText('DATE PLANNER', 154, 132);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(113, 121, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f43f5e';
    ctx.font = '900 28px Inter, Arial, sans-serif';
    ctx.fillText('DP', 92, 131);

    const dateY = isSquare ? 250 : 1110;
    const labelY = isSquare ? 360 : 1246;
    const titleY = isSquare ? 440 : 1338;
    const messageY = isSquare ? 570 : 1480;
    const routeY = isSquare ? 745 : 1660;
    const ctaY = 1848;

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    drawInviteRoundRect(ctx, 72, dateY, 420, 66, 33);
    ctx.fill();
    ctx.fillStyle = '#fed7aa';
    ctx.font = '800 28px Inter, Arial, sans-serif';
    ctx.fillText(inviteDate, 112, dateY + 43);

    ctx.fillStyle = '#fecdd3';
    ctx.font = '900 24px Inter, Arial, sans-serif';
    ctx.fillText('GỬI ĐẾN', 72, labelY);
    ctx.fillStyle = '#ffffff';
    ctx.font = isSquare ? '900 72px Inter, Arial, sans-serif' : '900 82px Inter, Arial, sans-serif';
    drawInviteWrappedText(ctx, name, 72, titleY, 900, isSquare ? 74 : 86, 2);

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = isSquare ? '700 italic 38px Inter, Arial, sans-serif' : '700 italic 48px Inter, Arial, sans-serif';
    drawInviteWrappedText(ctx, `"${message}"`, 72, messageY, 900, isSquare ? 48 : 60, isSquare ? 2 : 3);

    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    drawInviteRoundRect(ctx, 72, routeY, 936, isSquare ? 142 : 164, 34);
    ctx.fill();
    ctx.fillStyle = '#fed7aa';
    ctx.font = '900 24px Inter, Arial, sans-serif';
    ctx.fillText('LỘ TRÌNH DATEPLANNER', 112, routeY + 45);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 42px Inter, Arial, sans-serif';
    drawInviteWrappedText(ctx, combo?.title || 'Vui lòng chọn lộ trình', 112, routeY + 102, 820, 48, isSquare ? 1 : 2);

    if (!isSquare) {
        ctx.fillStyle = '#000000';
        drawInviteRoundRect(ctx, 72, ctaY, 520, 56, 28);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 24px Inter, Arial, sans-serif';
        ctx.fillText('Ready for our next adventure?', 108, ctaY + 37);
    }

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) reject(new Error('Cannot create invite PNG.'));
            else resolve(blob);
        }, 'image/png', 1);
    });
}

window.generateInviteImage = async function() {
    const card = document.getElementById('invite-card-preview');
    if (!card) throw new Error('Invite preview is missing.');
    if (!window.html2canvas) return generateInviteCanvasFallback();

    const bg = document.getElementById('inv-card-bg');
    if (bg && !bg.complete) {
        await new Promise(resolve => {
            bg.onload = resolve;
            bg.onerror = resolve;
        });
    }

    const canvas = await window.html2canvas(card, {
        backgroundColor: null,
        useCORS: true,
        allowTaint: false,
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
        width: card.offsetWidth,
        height: card.offsetHeight,
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight
    });

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) reject(new Error('Cannot create invite PNG.'));
            else resolve(blob);
        }, 'image/png', 1);
    });
};

window.downloadInviteImage = async function() {
    const button = document.getElementById('download-inv-btn');
    try {
        setInviteButtonLoading(button, true, 'Đang lưu');
        const blob = await window.generateInviteImage();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'dateplanner-invite.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showInviteToast('Đã tạo ảnh PNG ✨');
    } catch (error) {
        console.error(error);
        alert('Chưa thể tạo ảnh PNG. Vui lòng tải lại trang và thử lại.');
    } finally {
        setInviteButtonLoading(button, false);
    }
};

window.shareInviteImage = async function() {
    const button = document.getElementById('share-inv-btn');
    try {
        setInviteButtonLoading(button, true, 'Đang chia sẻ');
        const blob = await window.generateInviteImage();
        const file = new File([blob], 'dateplanner-invite.png', { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: 'DatePlanner E-card',
                text: 'Ready for our next adventure?',
                files: [file]
            });
            showInviteToast('Đã mở chia sẻ ✨');
        } else {
            await window.downloadInviteImage();
        }
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.error(error);
            await window.downloadInviteImage();
        }
    } finally {
        setInviteButtonLoading(button, false);
    }
};

window.toggleChatbot = function() {
    const chatbot = document.getElementById('chatbot-window');
    if (!chatbot) return;

    const isOpen = !chatbot.classList.contains('scale-0');
    chatbot.classList.toggle('scale-0', isOpen);
    chatbot.classList.toggle('opacity-0', isOpen);
    chatbot.classList.toggle('scale-100', !isOpen);
    chatbot.classList.toggle('opacity-100', !isOpen);
};

window.appendChatbotMessage = function(text, fromUser = false) {
    const messages = document.getElementById('chatbot-messages');
    if (!messages) return;

    const wrapper = document.createElement('div');
    wrapper.className = fromUser ? 'flex justify-end' : 'flex gap-3 items-end';
    if (fromUser) {
        const bubble = document.createElement('div');
        bubble.className = 'bg-rose-500 text-white text-sm p-4 rounded-2xl rounded-br-sm max-w-[85%] leading-relaxed shadow-sm font-medium';
        bubble.textContent = String(text || '').slice(0, 240);
        wrapper.appendChild(bubble);
    } else {
        wrapper.innerHTML = '<div class="w-8 h-8 rounded-full btn-gradient flex items-center justify-center shrink-0 mb-1 shadow-md"><i class="fa-solid fa-robot text-white text-xs"></i></div>';
        const bubble = document.createElement('div');
        bubble.className = 'bg-[#171717] text-sm text-gray-200 p-4 rounded-2xl rounded-bl-sm max-w-[85%] border border-gray-800 leading-relaxed shadow-sm font-medium';
        bubble.textContent = String(text || '').slice(0, 240);
        wrapper.appendChild(bubble);
    }
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
};

window.handleChatbotSend = function() {
    const input = document.getElementById('chatbot-input');
    const text = input?.value.trim();
    if (!input || !text) return;

    window.appendChatbotMessage(text, true);
    input.value = '';
    const lowerText = text.toLowerCase();
    const reply = lowerText.includes('voucher')
        ? 'Bạn chọn một combo, bấm Chi tiết rồi lấy voucher. Sau khi để lại thông tin, mã sẽ hiện ngay trên màn hình.'
        : lowerText.includes('nhóm')
            ? 'Bạn có thể dùng bộ lọc Hội nhóm để xem các combo hợp đi đông người, hoặc thử Vòng quay để chọn nhanh.'
            : 'Mình đã nhận tin. Bạn thử chọn Mood Quiz hoặc lọc combo theo nhu cầu, DatePlanner sẽ gợi ý lộ trình phù hợp.';
    setTimeout(() => window.appendChatbotMessage(reply), 400);
};

window.handleChatbotKeypress = function(event) {
    if (event.key === 'Enter') window.handleChatbotSend();
};

window.sendQuickReply = function(text) {
    const input = document.getElementById('chatbot-input');
    if (input) input.value = text;
    window.handleChatbotSend();
};

window.createInviteFromMoodCombo = function(comboId) {
    const comboSelect = document.getElementById('inv-combo');
    if (comboSelect) {
        comboSelect.value = String(comboId);
        comboSelect.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (typeof window.updateInvitePreview === 'function') {
        window.updateInvitePreview();
    }

    const inviteSection = document.getElementById('invite-maker');
    if (inviteSection) {
        inviteSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

window.getMoodRecommendation = function(moodType) {
    document.querySelectorAll('.mood-card').forEach(card => card.classList.remove('is-selected', 'active'));
    document.querySelectorAll(`button[onclick*="'${moodType}'"]`).forEach(card => {
        if (card.classList.contains('mood-card')) card.classList.add('is-selected', 'active');
    });

    let matchedCombos = [];
    if (moodType === 'chill') matchedCombos = combos.filter(c => c.id === 1 || c.id === 21 || c.id === 23 || c.id === 30 || c.id === 9 || c.id === 31);
    else if (moodType === 'active') matchedCombos = combos.filter(c => c.id === 6 || c.id === 11 || c.id === 20 || c.id === 28 || c.id === 35);
    else if (moodType === 'romantic') matchedCombos = combos.filter(c => c.id === 4 || c.id === 12 || c.id === 22 || c.id === 25 || c.id === 29);
    else if (moodType === 'fun') matchedCombos = combos.filter(c => c.id === 2 || c.id === 3 || c.id === 10 || c.id === 14 || c.id === 32 || c.id === 33);

    if (matchedCombos.length === 0) matchedCombos = combos;
    const randomCombo = matchedCombos[Math.floor(Math.random() * matchedCombos.length)];
    const container = document.getElementById('mood-result-container');
    const moodTheme = getMoodTheme(moodType);
    if (!container) return;

    clearTimeout(window.moodResultTimer);
    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="mood-loading rounded-[1.75rem] mt-8 p-6 md:p-8 flex items-center justify-center gap-4 text-white font-black">
            <span>&#272;ang b&#7855;t s&#243;ng vibe</span>
            <span class="inline-flex items-center gap-1.5" aria-hidden="true"><span class="mood-dot"></span><span class="mood-dot"></span><span class="mood-dot"></span></span>
        </div>
    `;
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });

    window.moodResultTimer = setTimeout(() => {
        container.innerHTML = `
            <div class="mood-result-hero ${moodTheme.resultBorder} rounded-[2rem] mt-8 overflow-hidden">
                <div class="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] items-stretch text-left">
                    <div class="mood-result-media min-h-[330px] lg:min-h-[520px] overflow-hidden relative">
                        <img src="${getComboImage(randomCombo)}" class="w-full h-full object-cover" alt="${randomCombo.title}" ${getImageAttrs()}>
                        <div class="absolute inset-0 bg-gradient-to-t from-[#07070a] via-[#07070a]/22 to-transparent"></div>
                        <div class="absolute top-5 left-5 primary-action font-black px-4 py-2 rounded-full text-xs z-10">Voucher ${randomCombo.discount}</div>
                    </div>
                    <div class="p-6 md:p-9 lg:p-10 flex flex-col justify-center">
                        <span class="inline-flex w-fit items-center gap-2 text-xs font-black uppercase tracking-widest mb-5 ${moodTheme.badge} px-4 py-2 rounded-full">
                            <i class="fa-solid fa-wand-magic-sparkles ${moodTheme.icon}"></i>AI Date Planner &#273;&#7873; xu&#7845;t
                        </span>
                        <h3 class="text-4xl md:text-5xl font-black text-white mb-4 leading-[0.98] tracking-tight">${randomCombo.title}</h3>
                        <p class="text-zinc-300 mb-6 font-semibold leading-relaxed">${randomCombo.desc || getMoodReason(moodType)}</p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 text-sm text-zinc-200">
                            <span class="mood-result-pill px-4 py-3 rounded-2xl"><i class="fa-solid fa-location-dot mr-2 ${moodTheme.icon}"></i>${randomCombo.address || getComboArea(randomCombo)}</span>
                            <span class="mood-result-pill px-4 py-3 rounded-2xl font-black text-white"><i class="fa-solid fa-tag mr-2 ${moodTheme.icon}"></i>${formatComboPrice(randomCombo)}</span>
                        </div>
                        <div class="flex flex-col sm:flex-row gap-3">
                            <button onclick="window.openComboDetail(${randomCombo.id})" class="interactive-btn ${moodTheme.cta} font-black py-4 px-6 rounded-2xl flex-1 text-center">Xem l&#7897; tr&#236;nh</button>
                            <button onclick="window.createInviteFromMoodCombo(${randomCombo.id})" class="interactive-btn secondary-action font-black py-4 px-6 rounded-2xl flex-1 text-center">T&#7841;o thi&#7879;p m&#7901;i t&#7915; combo n&#224;y</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }, 650);
};

// ==========================================
// 4. BỘ LỌC VÀ RENDER TẤT CẢ COMBO
// ==========================================
window.currentCategoryFilter = 'all';
window.currentDistrictFilter = 'all';

window.renderCombos = function() {
    const comboGrid = document.getElementById('combo-grid');
    if(!comboGrid) return;
    
    comboGrid.innerHTML = '';
    const filtered = combos.filter(c => {
        let matchCat = window.currentCategoryFilter === 'all' ? true : 
                       window.currentCategoryFilter === 'budget' ? (c.category === 'low' || c.category === 'mid') : 
                       window.currentCategoryFilter === 'premium' ? c.category === 'high' : 
                       (c.target === window.currentCategoryFilter || c.target === 'both');

        let matchDist = window.currentDistrictFilter === 'all' ? true : c.district === window.currentDistrictFilter;
        return matchCat && matchDist;
    });
    const summary = document.getElementById('combo-count-summary');
    if (summary) {
        summary.innerHTML = `<i class="fa-solid fa-layer-group mr-2 text-cyan-300"></i>Đang hiển thị ${filtered.length} lộ trình phù hợp`;
    }
    
    if(filtered.length === 0) {
        comboGrid.innerHTML = `
            <div class="col-span-1 md:col-span-2 lg:col-span-3 text-center py-20 bg-white/5 rounded-3xl border border-white/10 border-dashed backdrop-blur-sm">
                <i class="fa-regular fa-face-frown-open text-6xl text-gray-600 mb-5"></i>
                <h3 class="text-2xl font-bold text-white mb-2">Tiếc quá, chưa tìm thấy lộ trình phù hợp!</h3>
                <button onclick="window.resetFilters()" class="interactive-btn secondary-action mt-6 px-5 py-2.5 rounded-full font-bold">Xóa bộ lọc</button>
            </div>
        `;
        return;
    }

    filtered.forEach(combo => {
        const card = document.createElement('div');
        card.className = `combo-card ${getComboAccentClass(combo)} card-interactive rounded-[1.65rem] overflow-hidden flex flex-col group`;
        card.tabIndex = 0;
        const targetBadge = combo.target === 'couple'
            ? 'C&#7863;p &#273;&#244;i'
            : combo.target === 'group'
                ? 'H&#7897;i nh&#243;m'
                : '&#272;a n&#259;ng';
        card.innerHTML = `
            <div class="combo-media overflow-hidden relative cursor-pointer rounded-t-[1.58rem]" onclick="window.openComboDetail(${combo.id})">
                <img src="${getComboImage(combo)}" class="w-full h-full object-cover opacity-95" alt="${combo.title}" ${getImageAttrs()}>
                <div class="absolute inset-0 bg-gradient-to-t from-[#07070a] via-[#07070a]/36 to-transparent z-0"></div>
                <div class="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/86 via-black/34 to-transparent z-[1]"></div>
                <div class="absolute top-4 left-4 combo-badge text-white font-black px-3.5 py-1.5 rounded-full text-xs z-10">
                    Voucher ${combo.discount}
                </div>
                <div class="absolute top-4 right-4 combo-target-badge text-white font-black px-3.5 py-1.5 rounded-full text-xs z-10">
                    ${targetBadge}
                </div>
                <div class="absolute left-5 right-5 bottom-5 z-10">
                    <p class="text-sm text-white/80 font-extrabold mb-2 truncate"><i class="fa-solid fa-location-dot mr-1.5 text-orange-300"></i>${getComboArea(combo)}</p>
                    <h3 class="card-title text-3xl md:text-[2rem] font-black text-white tracking-tight leading-[1.02] drop-shadow-[0_8px_20px_rgba(0,0,0,0.65)]">${combo.title}</h3>
                </div>
            </div>
            <div class="p-5 flex-1 flex flex-col justify-between relative z-10">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="combo-target-badge text-white/90 px-3 py-1.5 rounded-full text-xs font-black">${targetBadge}</span>
                    ${getComboTypeBadge(combo)}
                </div>
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-5 pt-5 border-t border-white/10">
                    <span class="combo-price-pill inline-flex items-center justify-center px-4 py-3 rounded-2xl text-xl font-black text-white">
                        ${formatComboPrice(combo)}
                    </span>
                    <button onclick="window.openComboDetail(${combo.id})" class="combo-cta interactive-btn px-5 py-3 rounded-2xl text-sm font-black inline-flex items-center justify-center gap-2">
                        Xem l&#7897; tr&#236;nh <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        `;
        if (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) {
            let spotlightFrame = 0;
            card.addEventListener('pointermove', (event) => {
                if (spotlightFrame) return;
                spotlightFrame = window.requestAnimationFrame(() => {
                    const rect = card.getBoundingClientRect();
                    card.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`);
                    card.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`);
                    spotlightFrame = 0;
                });
            });
        }
        document.getElementById('combo-grid').appendChild(card);
    });
};

window.filterCombosCategory = function(type) {
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(btn => {
        btn.classList.remove('active');
    });
    const clickEvent = typeof event !== 'undefined' ? event : window.event;
    const activeButton = clickEvent?.currentTarget || clickEvent?.target || Array.from(btns).find(btn => btn.getAttribute('onclick')?.includes(`'${type}'`));
    activeButton?.classList.add('active');
    window.currentCategoryFilter = type;
    window.renderCombos();
};

window.filterByDistrict = function() {
    window.currentDistrictFilter = document.getElementById('district-filter').value;
    window.renderCombos();
};

window.resetFilters = function() {
    document.getElementById('district-filter').value = 'all';
    window.currentDistrictFilter = 'all';
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(btn => {
        btn.classList.remove('active');
    });
    btns[0]?.classList.add('active');
    window.currentCategoryFilter = 'all';
    window.renderCombos();
};

// ==========================================
// 5. CỬA SỔ CHI TIẾT (MODAL)
// ==========================================
window.openComboDetail = function(id) {
    const combo = combos.find(c => c.id === id);
    if(!combo) return;
    const comboAddress = (combo.address || '').trim();
    const comboDirectionsButton = comboAddress ? `
        <a href="${getGoogleMapsDirectionsUrl(comboAddress)}" target="_blank" rel="noopener noreferrer" class="interactive-btn map-action inline-flex items-center gap-2 text-xs md:text-sm font-black px-4 py-2 rounded-xl shrink-0">
            <i class="fa-solid fa-route"></i>
            Chỉ đường
        </a>
    ` : '';

    const detailImg = document.getElementById('detail-img');
    detailImg.alt = combo.title || 'DatePlanner combo';
    detailImg.src = getComboImage(combo);
    document.getElementById('detail-target').innerText = getTargetLabel(combo);
    const categoryLabel = combo.category === 'low' ? 'Bình dân' : (combo.category === 'mid' ? 'Tiêu chuẩn' : 'Cao cấp');
    const categoryClass = combo.target === 'group'
        ? 'bg-violet-500/85 text-white border border-violet-300/30'
        : combo.category === 'high'
            ? 'bg-gradient-to-r from-rose-500 to-violet-500 text-white'
            : combo.category === 'mid'
                ? 'bg-gradient-to-r from-orange-400 to-amber-300 text-[#170B05]'
                : 'bg-gradient-to-r from-cyan-400 to-green-400 text-[#061018]';
    const detailCategory = document.getElementById('detail-category');
    detailCategory.className = `inline-block ${categoryClass} px-3 py-1.5 rounded-full text-xs font-black`;
    detailCategory.innerHTML = `<i class="fa-solid ${escapeHTML(combo.icon || 'fa-heart')} mr-1"></i> ${escapeHTML(categoryLabel)}`;
    document.getElementById('detail-title').innerText = combo.title || 'Lộ trình DatePlanner';
    document.getElementById('lead-combo-id').value = combo.id;
    document.getElementById('lead-combo-title').value = combo.title;
    document.getElementById('lead-combo-discount').value = combo.discount;
    
    document.getElementById('detail-desc').innerHTML = `
        <i class="fa-solid fa-location-dot text-rose-300 mt-1 mr-3 text-xl"></i>
        <div class="flex-1">
            <span class="block text-zinc-500 mb-1 text-xs font-bold uppercase tracking-widest">Khu vực chính</span>
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span class="text-white font-bold text-lg">${escapeHTML(comboAddress || 'Chưa cập nhật địa điểm')}</span>
                ${comboDirectionsButton}
            </div>
            <p class="text-zinc-300 mt-4">${escapeHTML(combo.desc || '')}</p>
        </div>
    `;
    document.getElementById('detail-price').innerText = formatComboPrice(combo);
    document.getElementById('detail-btn-voucher').innerHTML = `<i class="fa-solid fa-ticket mr-2"></i>Nhận voucher ${combo.discount}`;

    const timelineContainer = document.getElementById('detail-timeline');
    timelineContainer.innerHTML = '';
    getComboItinerary(combo).forEach((step) => {
        const stepLocation = String(step.location || '').trim();
        const stepDirectionsButton = stepLocation ? `
            <a href="${getGoogleMapsDirectionsUrl(stepLocation)}" target="_blank" rel="noopener noreferrer" class="interactive-btn map-action shrink-0 inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-lg">
                <i class="fa-solid fa-location-arrow"></i>
                Chỉ đường
            </a>
        ` : '';

        timelineContainer.innerHTML += `
            <div class="relative">
                <div class="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-rose-300 border-4 border-[#0b0d10]"></div>
                <h5 class="text-rose-200 font-black text-lg mb-1">${escapeHTML(step.time || '')}</h5>
                <p class="text-white font-bold text-lg mb-2">${escapeHTML(step.activity || '')}</p>
                <div class="text-zinc-300 text-sm flex items-start gap-3 mt-2 bg-white/[0.035] p-3 rounded-xl border border-white/10">
                    <i class="fa-solid fa-map-pin mt-1 text-zinc-500"></i> 
                    <div class="flex flex-1 flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <span class="font-medium flex-1">${escapeHTML(stepLocation || 'Chưa cập nhật địa điểm')}</span>
                        ${stepDirectionsButton}
                    </div>
                </div>
            </div>
        `;
    });

    const modal = document.getElementById('detail-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.firstElementChild.classList.remove('scale-95');
    }, 10);
};

window.closeDetailModal = function() {
    const modal = document.getElementById('detail-modal');
    modal.classList.add('opacity-0');
    modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
};

// ==========================================
// 6. ĐẶT VOUCHER & ĐẨY LÊN ĐÁM MÂY
// ==========================================
window.openLeadForm = function() {
    const discountVal = document.getElementById('lead-combo-discount').value || 'Ưu đãi';
    document.getElementById('lead-form-title').innerText = `Nhận voucher ưu đãi demo ${discountVal}`;
    const consentCheckbox = document.getElementById('lead-consent');
    const consentError = document.getElementById('lead-consent-error');
    const submitButton = document.getElementById('lead-submit-btn');
    if (consentCheckbox && submitButton) {
        consentCheckbox.checked = false;
        updateLeadSubmitState();
    }
    if (consentError) consentError.classList.add('hidden');
    
    window.closeDetailModal();
    setTimeout(() => {
        const modal = document.getElementById('lead-modal');
        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); modal.firstElementChild.classList.remove('scale-95'); }, 10);
    }, 300);
};

window.closeLeadForm = function() {
    const modal = document.getElementById('lead-modal');
    modal.classList.add('opacity-0');
    modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
};

window.openDataPolicyModal = function() {
    const modal = document.getElementById('data-policy-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.firstElementChild.classList.remove('scale-95');
    }, 10);
};

window.closeDataPolicyModal = function(event) {
    if (event && event.target !== event.currentTarget) return;

    const modal = document.getElementById('data-policy-modal');
    if (!modal) return;

    modal.classList.add('opacity-0');
    modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
};

const consentCheckbox = document.getElementById('lead-consent');
const consentError = document.getElementById('lead-consent-error');
const submitButton = document.getElementById('lead-submit-btn');

function updateLeadSubmitState() {
    if (!consentCheckbox || !submitButton) return;

    const disabled = !consentCheckbox.checked || isSubmittingLead;
    submitButton.disabled = disabled;
    submitButton.setAttribute('aria-disabled', String(disabled));
    submitButton.classList.toggle('opacity-50', disabled);
    submitButton.classList.toggle('cursor-not-allowed', disabled);
}

function normalizeLeadEmail(email) {
    return String(email || '').toLowerCase().trim();
}

function normalizeLeadPhone(phone) {
    return String(phone || '').replace(/\D/g, '');
}

function normalizeLeadCombo(combo) {
    return String(combo || '').toLowerCase().trim();
}

function generateVoucherCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(8);
    if (window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(bytes);
    } else {
        bytes.forEach((_, index) => {
            bytes[index] = Math.floor(Math.random() * 256);
        });
    }

    return `DP-${Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')}`;
}

function isSameLeadCombo(lead, selectedCombo, comboTitle) {
    const leadComboId = Number(lead?.comboId);
    if (Number.isFinite(leadComboId) && selectedCombo?.id !== undefined) {
        return leadComboId === Number(selectedCombo.id);
    }

    return normalizeLeadCombo(lead?.combo) === normalizeLeadCombo(selectedCombo?.title || comboTitle);
}

function isDuplicateActiveLead(lead, normalizedEmail, normalizedPhone, selectedCombo, comboTitle, now = Date.now()) {
    const leadStatus = getEffectiveLeadStatus(lead);
    const hasMatchingContact = normalizeLeadEmail(lead?.email) === normalizedEmail || normalizeLeadPhone(lead?.phone) === normalizedPhone;
    const hasMatchingCombo = isSameLeadCombo(lead, selectedCombo, comboTitle);
    const expiresAt = getLeadExpiryTimestamp(lead);
    const isActivePending = leadStatus === 'pending' && (!expiresAt || expiresAt >= now);

    return hasMatchingContact && hasMatchingCombo && (isActivePending || leadStatus === 'used');
}

function findDuplicateVoucherLead(normalizedEmail, normalizedPhone, selectedCombo, comboTitle) {
    if (!Array.isArray(window.cloudLeads)) return null;
    const now = Date.now();

    return window.cloudLeads.find((lead) => isDuplicateActiveLead(
        lead,
        normalizedEmail,
        normalizedPhone,
        selectedCombo,
        comboTitle,
        now
    )) || null;
}

function setLeadSubmitLoading(isLoading, previousHtml = '') {
    const button = document.getElementById('lead-submit-btn');
    if (!button) return;

    if (isLoading) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>\u0110ang t\u1ea1o voucher...';
        button.classList.add('opacity-50', 'cursor-not-allowed');
        return;
    }

    button.disabled = false;
    if (previousHtml) button.innerHTML = previousHtml;
    updateLeadSubmitState();
}

function resetLeadFormAfterSubmit() {
    document.getElementById('lead-name').value = '';
    document.getElementById('lead-phone').value = '';
    document.getElementById('lead-email').value = '';
    document.getElementById('lead-consent').checked = false;
    updateLeadSubmitState();
    document.getElementById('lead-consent-error').classList.add('hidden');
}

function buildVoucherQRPayload(leadData = {}, selectedCombo = {}) {
    const comboTitle = leadData.combo || selectedCombo?.title || '';
    const comboId = leadData.comboId || selectedCombo?.id || '';
    const discount = selectedCombo?.discount || leadData.discount || '';
    const partner = leadData.partner || selectedCombo?.partner || '';
    const expiresAt = leadData.expiresAt || '';

    return [
        'DP-VOUCHER',
        `code=${leadData.code || ''}`,
        `comboId=${comboId}`,
        `combo=${comboTitle}`,
        `discount=${discount}`,
        `partner=${partner}`,
        `expiresAt=${expiresAt}`
    ].join('|');
}

function renderVoucherQRCode(leadData, selectedCombo) {
    const qrContainer = document.getElementById('success-voucher-qr');
    if (!qrContainer) return;

    const payload = buildVoucherQRPayload(leadData, selectedCombo);
    qrContainer.innerHTML = '';
    qrContainer.setAttribute('aria-label', `QR voucher ${leadData?.code || ''}`);
    qrContainer.title = payload;

    if (!window.QRCode) {
        const fallback = document.createElement('div');
        fallback.className = 'text-center leading-relaxed break-all max-w-[220px]';
        fallback.textContent = leadData?.code || payload;
        qrContainer.appendChild(fallback);
        return;
    }

    new window.QRCode(qrContainer, {
        text: payload,
        width: 176,
        height: 176,
        colorDark: '#050505',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
    });
}

function showVoucherSuccessModal(leadData, selectedCombo, message = '') {
    document.getElementById('success-user-name').innerText = leadData.name || 'bạn';
    document.getElementById('success-combo-title').innerText = leadData.combo || selectedCombo.title;
    document.getElementById('success-voucher-code').innerText = leadData.code || '';
    document.getElementById('success-user-email').innerText = leadData.email || '';
    document.getElementById('success-voucher-discount').innerText = `Giảm ngay ${selectedCombo.discount}`;
    renderVoucherQRCode(leadData, selectedCombo);

    const emailElement = document.getElementById('success-user-email');
    const emailBox = emailElement?.closest('.bg-violet-500\\/10');
    if (emailBox) {
        let messageElement = document.getElementById('success-voucher-message');
        if (!messageElement) {
            messageElement = document.createElement('p');
            messageElement.id = 'success-voucher-message';
            messageElement.className = 'text-sm text-violet-100 leading-relaxed font-semibold mb-3';
            emailBox.querySelector('div')?.prepend(messageElement);
        }

        messageElement.innerText = message;
        messageElement.classList.toggle('hidden', !message);
    }

    window.closeLeadForm();

    setTimeout(() => {
        const modal = document.getElementById('booking-modal');
        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); modal.firstElementChild.classList.remove('scale-95'); }, 10);
    }, 300);
}

if (consentCheckbox && submitButton) {
    consentCheckbox.addEventListener('change', () => {
        updateLeadSubmitState();
        if (consentCheckbox.checked && consentError) {
            consentError.classList.add('hidden');
        }
    });
}

window.submitLead = async function() {
    if (isSubmittingLead === true) return;

    const name = getSafeLeadName(document.getElementById('lead-name').value);
    const phone = document.getElementById('lead-phone').value.trim();
    const email = document.getElementById('lead-email').value.trim().toLowerCase().slice(0, 120);
    const hasConsent = document.getElementById('lead-consent').checked;
    const comboTitle = document.getElementById('lead-combo-title').value;
    const comboId = parseInt(document.getElementById('lead-combo-id').value);
    const currentSubmitButton = document.getElementById('lead-submit-btn');
    const previousSubmitHtml = currentSubmitButton?.innerHTML || '';

    // Validate dữ liệu
    if(!name || !phone || !email) { alert("Vui lòng điền đầy đủ thông tin!"); return; }
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(phone)) { alert("Số điện thoại cần có 10 chữ số và bắt đầu bằng 0."); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { alert("Email chưa hợp lệ!"); return; }
    if (!hasConsent) {
        const consentError = document.getElementById('lead-consent-error');
        if (consentError) consentError.classList.remove('hidden');
        alert("Bạn vui lòng đồng ý để DatePlanner lưu thông tin liên hệ và gửi E-Voucher nhé.");
        return;
    }

    const selectedCombo = combos.find(c => c.id === comboId);
    if (!selectedCombo) { alert("Khong tim thay combo. Vui long chon lai voucher."); return; }

    isSubmittingLead = true;
    setLeadSubmitLoading(true);

    try {
    const normalizedEmail = normalizeLeadEmail(email);
    const normalizedPhone = normalizeLeadPhone(phone);
    const duplicateLead = findDuplicateVoucherLead(normalizedEmail, normalizedPhone, selectedCombo, comboTitle);

    if (duplicateLead) {
        showVoucherSuccessModal(
            duplicateLead,
            selectedCombo,
            "B\u1ea1n \u0111\u00e3 nh\u1eadn voucher n\u00e0y r\u1ed3i. M\u00ecnh hi\u1ec3n th\u1ecb l\u1ea1i m\u00e3 c\u0169 \u0111\u1ec3 tr\u00e1nh g\u1eedi email tr\u00f9ng nh\u00e9."
        );
        resetLeadFormAfterSubmit();
        return;
    }

    const partnerLeads = window.cloudLeads.filter(l => l.partner === selectedCombo.partner);
    const partnerUsedLeads = partnerLeads.filter(l => getEffectiveLeadStatus(l) === 'used');
    const partnerConversionRate = partnerLeads.length > 0 ? partnerUsedLeads.length / partnerLeads.length : undefined;
    const commissionSnapshot = calculateCommission(selectedCombo, partnerConversionRate);
    const now = new Date();
    const expiresAt = now.getTime() + (VOUCHER_VALID_DAYS * DAY_IN_MS);

    const leadData = {
        name: name, 
        phone: phone, 
        email: normalizedEmail, 
        combo: comboTitle,
        comboId: selectedCombo.id,
        partner: selectedCombo.partner,
        code: generateVoucherCode(),
        date: now.toLocaleDateString('vi-VN'),
        timestamp: now.getTime(),
        expiresAt,
        expiresAtText: formatLeadDateTime(expiresAt),
        consent: true,
        consentText: "Đồng ý lưu thông tin để gửi E-Voucher và đối soát ưu đãi trong phạm vi demo/pilot",
        consentAt: now.getTime(),
        partnerTier: commissionSnapshot.partnerTier,
        estimatedAOV: commissionSnapshot.estimatedAOV,
        commissionRate: commissionSnapshot.commissionRate,
        baseFee: commissionSnapshot.baseFee,
        visibilityLevel: commissionSnapshot.visibilityLevel,
        commissionAmount: commissionSnapshot.commissionAmount,
        commissionFormulaText: commissionSnapshot.commissionFormulaText,
        status: 'pending' // Thêm trạng thái Chờ khách đến sử dụng
    };

    // 🚀 BẮN DỮ LIỆU LÊN FIREBASE CLOUD
    try {
        await addDoc(leadsCollection, leadData);
        console.log("Tuyệt vời! Đã đồng bộ khách hàng lên Đám Mây.");
    } catch (e) {
        console.error("Lỗi khi lưu lên mây: ", e);
        alert("Lỗi kết nối Đám mây. Vui lòng thử lại!");
        return;
    }

    // Hiển thị giao diện Thành công
    try {
        const emailResult = await sendVoucherEmail(leadData, selectedCombo);
        console.log("Email voucher da duoc gui qua EmailJS:", emailResult);
    } catch (e) {
        console.error("Loi khi gui email voucher qua EmailJS: ", {
            status: e?.status,
            text: e?.text,
            message: e?.message,
            error: e
        });
        alert("Voucher đã được tạo, nhưng email có thể chưa gửi được. Bạn hãy chụp lại mã voucher.");
    }

    document.getElementById('success-user-name').innerText = name;
    document.getElementById('success-combo-title').innerText = selectedCombo.title;
    document.getElementById('success-voucher-code').innerText = leadData.code;
    document.getElementById('success-user-email').innerText = email;
    document.getElementById('success-voucher-discount').innerText = `Giảm ngay ${selectedCombo.discount}`;
    document.getElementById('success-voucher-message')?.classList.add('hidden');
    renderVoucherQRCode(leadData, selectedCombo);

    window.closeLeadForm();
    
    // Xóa Form
    document.getElementById('lead-name').value = '';
    document.getElementById('lead-phone').value = '';
    document.getElementById('lead-email').value = '';
    document.getElementById('lead-consent').checked = false;
    updateLeadSubmitState();
    document.getElementById('lead-consent-error').classList.add('hidden');

    setTimeout(() => {
        const modal = document.getElementById('booking-modal');
        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); modal.firstElementChild.classList.remove('scale-95'); }, 10);
    }, 300);
    } catch (e) {
        console.error("Loi khong mong muon khi tao voucher: ", e);
        alert("Co loi khi tao voucher. Vui long thu lai!");
    } finally {
        isSubmittingLead = false;
        setLeadSubmitLoading(false, previousSubmitHtml);
    }
};

window.closeBookingModal = function() {
    const modal = document.getElementById('booking-modal');
    modal.classList.add('opacity-0');
    modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
};

// ==========================================
// 7. QUẢN TRỊ ADMIN - ĐỌC DATA TỪ ĐÁM MÂY & ĐỐI SOÁT CPS
// ==========================================
window.toggleAdminView = function() {
    const modal = document.getElementById('admin-login-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.firstElementChild?.classList.remove('scale-95');
        document.getElementById('admin-pin')?.focus();
    }, 10);
};

window.closeAdminLogin = function() {
    const modal = document.getElementById('admin-login-modal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    modal.firstElementChild?.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 180);
};

window.verifyAdmin = function() {
    const pinElement = document.getElementById('admin-pin');
    const errorElement = document.getElementById('admin-error');
    const pinInput = pinElement?.value || '';
    const now = Date.now();

    if (now < adminLockedUntil) {
        const secondsLeft = Math.ceil((adminLockedUntil - now) / 1000);
        if (errorElement) {
            errorElement.textContent = `Nhập sai quá nhiều lần. Vui lòng thử lại sau ${secondsLeft} giây.`;
            errorElement.classList.remove('hidden');
        }
        return;
    }

    if(pinInput === ADMIN_DEMO_PIN) {
        adminFailedAttempts = 0;
        adminLockedUntil = 0;
        if (errorElement) {
            errorElement.textContent = 'Mã PIN không chính xác!';
            errorElement.classList.add('hidden');
        }
        window.closeAdminLogin(); 
        document.getElementById('admin-view').classList.remove('hidden');
        document.getElementById('client-view')?.classList.add('hidden');
        window.populatePartnerFilter(); 
        window.renderAdminData();       
    } else {
        adminFailedAttempts += 1;
        if (adminFailedAttempts >= ADMIN_MAX_FAILED_ATTEMPTS) {
            adminLockedUntil = Date.now() + ADMIN_LOCKOUT_MS;
            adminFailedAttempts = 0;
            if (errorElement) errorElement.textContent = 'Nhập sai quá nhiều lần. Admin demo tạm khóa 30 giây.';
        } else if (errorElement) {
            const remaining = ADMIN_MAX_FAILED_ATTEMPTS - adminFailedAttempts;
            errorElement.textContent = `Mã PIN không chính xác. Còn ${remaining} lần thử trước khi tạm khóa.`;
        }
        errorElement?.classList.remove('hidden');
    }
};

window.logoutAdmin = function() {
    const pinElement = document.getElementById('admin-pin');
    const errorElement = document.getElementById('admin-error');
    if (pinElement) pinElement.value = '';
    if (errorElement) errorElement.classList.add('hidden');
    document.getElementById('admin-view').classList.add('hidden');
    document.getElementById('client-view')?.classList.remove('hidden');
    window.toggleAdminView();
}

window.populatePartnerFilter = function() {
    const selectEl = document.getElementById('admin-partner-filter');
    if (!selectEl) return;
    const currentVal = selectEl.value;
    
    const uniquePartners = [...new Set(window.cloudLeads.map(l => l.partner || 'Đối tác khác'))];
    
    selectEl.innerHTML = '<option value="all">Tất cả Đối tác (Tổng hợp)</option>';
    uniquePartners.forEach(p => {
        const option = document.createElement('option');
        option.value = p;
        option.textContent = p;
        selectEl.appendChild(option);
    });
    selectEl.value = currentVal || 'all';
};

window.renderAdminData = function() {
    const partnerFilter = document.getElementById('admin-partner-filter')?.value || 'all';
    const voucherQuery = String(document.getElementById('admin-voucher-search')?.value || '').trim().toLowerCase();
    const tbody = document.getElementById('leads-table-body');
    const noDataMsg = document.getElementById('no-data-msg');
    
    if(!tbody) return;

    // Lọc data Firebase
    const partnerLeads = partnerFilter === 'all' 
        ? window.cloudLeads 
        : window.cloudLeads.filter(l => (l.partner || 'Đối tác khác') === partnerFilter);
    const leads = voucherQuery
        ? partnerLeads.filter(l => {
            const haystack = [
                l.code,
                l.comboId,
                l.combo,
                l.partner,
                l.discount
            ].map(value => String(value || '').toLowerCase()).join('|');

            return haystack.includes(voucherQuery);
        })
        : partnerLeads;
    
    // TÍNH TOÁN DOANH THU THEO MÔ HÌNH THỰC TẾ (CPS - Chỉ tính voucher status = used)
    const usedLeads = leads.filter(l => getEffectiveLeadStatus(l) === 'used'); 
    const conversionRate = leads.length > 0 ? (usedLeads.length / leads.length) * 100 : 0;
    const totalRevenue = usedLeads.reduce((sum, lead) => sum + getLeadCommissionAmount(lead), 0);
    
    document.getElementById('stat-leads').innerText = leads.length; // Tổng lượt lấy Voucher
    document.getElementById('stat-vouchers').innerText = usedLeads.length; // Voucher đã sử dụng
    document.getElementById('stat-conversion').innerText = `${conversionRate.toFixed(1)}%`; // Used / tổng leads
    document.getElementById('stat-revenue').innerText = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalRevenue); // Doanh thu từ voucher used

    tbody.innerHTML = '';
    if(leads.length === 0) {
        noDataMsg.classList.remove('hidden');
    } else {
        noDataMsg.classList.add('hidden');
        
        // Hiển thị mới nhất lên trên
        const sortedLeads = [...leads].sort((a,b) => b.timestamp - a.timestamp);
        
        sortedLeads.forEach(lead => {
            const partnerName = lead.partner || 'Đối tác khác';
            const status = getEffectiveLeadStatus(lead);
            const statusConfig = LEAD_STATUSES[status];
            const isPending = status === 'pending';
            const isUsed = status === 'used';
            const partnerTier = lead.partnerTier || 'legacy';
            const commissionAmount = getLeadCommissionAmount(lead);
            // UI che du lieu de giam rui ro khi demo/public screen; Firebase va CSV van giu du lieu goc.
            const maskedPhone = maskPhone(lead.phone);
            const maskedEmail = maskEmail(lead.email);
            const safeLeadName = escapeHTML(lead.name || 'Khách demo');
            const safeComboName = escapeHTML(lead.combo || 'Lộ trình DatePlanner');
            const safePartnerName = escapeHTML(partnerName);
            const safePartnerTier = escapeHTML(partnerTier);
            const safeVoucherCode = escapeHTML(lead.code || 'N/A');
            const safeLeadDate = escapeHTML(lead.date || formatLeadDateTime(lead.timestamp) || '');
            
            // Render Giao diện Trạng thái
            let statusBadge = isUsed 
                ? `<span class="bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider"><i class="fa-solid fa-check-circle mr-1"></i>Đã sử dụng</span>
                   <div class="text-gray-500 text-[10px] mt-1 font-medium">${lead.usedAt || ''}</div>`
                : `<span class="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider"><i class="fa-solid fa-clock mr-1"></i>Chờ khách đến</span>`;
            {
                const statusTimestamp = getLeadStatusTimestamp(lead, status);
                statusBadge = `
                    <span class="${statusConfig.badgeClass} px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider inline-flex items-center">
                        <i class="fa-solid ${statusConfig.icon} mr-1"></i>${statusConfig.label}
                    </span>
                    ${statusTimestamp ? `<div class="text-gray-500 text-[10px] mt-1 font-medium">${escapeHTML(statusTimestamp)}</div>` : ''}
                `;
            }
            
            // Nút bấm cho Thu ngân (Chỉ hiện khi chưa dùng)
            let actionBtn = !isPending
                ? `` 
                : `<button onclick="window.confirmVoucher('${lead.firebaseId}')" class="mt-2 w-full text-xs bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded shadow-lg transition font-bold"><i class="fa-solid fa-qrcode mr-1"></i> Xác nhận mã</button>`;

            if (isPending) {
                actionBtn += `<button onclick="window.cancelVoucher('${lead.firebaseId}')" class="mt-2 w-full text-xs bg-white/5 hover:bg-red-500/20 text-red-300 border border-red-500/30 px-3 py-1.5 rounded transition font-bold"><i class="fa-solid fa-ban mr-1"></i> Cancelled</button>`;
            }

            tbody.innerHTML += `
                <tr class="hover:bg-white/5 transition border-b border-white/5">
                    <td class="px-6 py-4 font-bold text-gray-200">${safeLeadName}</td>
                    <td class="px-6 py-4">
                        <div class="text-gray-300 text-xs mb-1"><i class="fa-solid fa-phone mr-1 text-gray-500"></i> ${escapeHTML(maskedPhone)}</div>
                        <div class="text-gray-400 text-xs"><i class="fa-solid fa-envelope mr-1 text-gray-500"></i> ${escapeHTML(maskedEmail)}</div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full text-xs mb-2 inline-block truncate max-w-[200px] font-bold">${safeComboName}</span><br>
                        <span class="text-gray-400 text-xs font-medium"><i class="fa-solid fa-store mr-1 text-yellow-500"></i> ${safePartnerName}</span>
                        <div class="text-gray-500 text-xs mt-1 font-medium">Tier: <span class="text-gray-300 uppercase">${safePartnerTier}</span></div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="text-white font-black font-mono block mb-1 tracking-widest text-sm">${safeVoucherCode}</span>
                        <span class="text-gray-500 text-xs font-medium">${safeLeadDate}</span>
                    </td>
                    <td class="px-6 py-4">
                        <span class="text-rose-300 font-black">${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(commissionAmount)}</span>
                        <div class="text-gray-500 text-[10px] mt-1 font-medium">${lead.commissionAmount ? 'Snapshot' : 'Fallback lead cu'}</div>
                    </td>
                    <td class="px-6 py-4">
                        ${statusBadge}
                        ${actionBtn}
                    </td>
                </tr>
            `;
        });
    }
};

window.confirmVoucher = async function(docId) {
    const lead = window.cloudLeads.find(item => item.firebaseId === docId);
    if (lead && getEffectiveLeadStatus(lead) !== 'pending') {
        alert("Chi voucher status pending moi co the chuyen sang used.");
        return;
    }

    if(confirm("Xác nhận khách hàng đã đến quán và sử dụng E-Voucher này?\n(Hành động này sẽ ghi nhận commission snapshot của voucher used cho DatePlanner)")) {
        try {
            const leadRef = doc(db, "leads", docId);
            await updateDoc(leadRef, {
                status: 'used',
                statusUpdatedAt: new Date().getTime(),
                usedAt: new Date().toLocaleTimeString('vi-VN') + ' - ' + new Date().toLocaleDateString('vi-VN')
            });
        } catch(e) {
            console.error("Lỗi cập nhật: ", e);
            alert("Lỗi kết nối Đám mây!");
        }
    }
};

window.cancelVoucher = async function(docId) {
    const lead = window.cloudLeads.find(item => item.firebaseId === docId);
    if (lead && getEffectiveLeadStatus(lead) !== 'pending') {
        alert("Chi voucher status pending moi co the chuyen sang cancelled.");
        return;
    }

    if(confirm("Huy/gan khong hop le voucher nay?\nVoucher cancelled se khong duoc tinh doanh thu.")) {
        try {
            const leadRef = doc(db, "leads", docId);
            await updateDoc(leadRef, {
                status: 'cancelled',
                statusUpdatedAt: new Date().getTime(),
                cancelledAt: new Date().toLocaleTimeString('vi-VN') + ' - ' + new Date().toLocaleDateString('vi-VN')
            });
        } catch(e) {
            console.error("Loi cap nhat cancelled: ", e);
            alert("Loi ket noi Dam may!");
        }
    }
};

window.clearDemoDataInternalOnly = async function() {
    const confirmText = "XOA DU LIEU DEMO";
    if (!confirm("Chức năng nội bộ: xóa toàn bộ dữ liệu demo trên Cloud. Tiếp tục?")) return;

    const typedText = prompt(`Nhập chính xác "${confirmText}" để xác nhận xóa dữ liệu demo:`);
    if (typedText !== confirmText) {
        alert("Đã hủy xóa dữ liệu demo.");
        return;
    }

    try {
        const querySnapshot = await getDocs(leadsCollection);
        const deletions = querySnapshot.docs.map((document) => deleteDoc(doc(db, "leads", document.id)));
        await Promise.all(deletions);
        alert("Đã xóa dữ liệu demo trên Cloud Server.");
    } catch(e) {
        console.error("Lỗi xóa data: ", e);
    }
};

window.exportToCSV = function() {
    const partnerFilter = document.getElementById('admin-partner-filter').value;
    const leads = partnerFilter === 'all' 
        ? window.cloudLeads 
        : window.cloudLeads.filter(l => (l.partner || 'Đối tác khác') === partnerFilter);

    if (leads.length === 0) { alert("Chưa có dữ liệu để xuất file!"); return; }

    const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    let csvContent = "DatePlanner demo internal reconciliation export - contains full contact data for pilot use only\n";
    csvContent += "Họ tên,SĐT,Email,Combo,Đối tác,Partner Tier,Estimated AOV,Commission Rate,Base Fee,Commission Amount,Commission Formula,Visibility Level,Mã voucher,Trạng thái,Ngày tạo,Hết hạn,Consent,Consent At,Ngày cập nhật trạng thái nếu có\n";

    leads.forEach(row => {
        const status = getEffectiveLeadStatus(row);
        let statusText = LEAD_STATUSES[status].csvLabel;
        let usedTime = getLeadStatusTimestamp(row, status);
        csvContent += [
            row.name,
            row.phone,
            row.email,
            row.combo,
            row.partner || 'Đối tác khác',
            row.partnerTier || 'legacy',
            row.estimatedAOV || '',
            row.commissionRate || '',
            row.baseFee || '',
            getLeadCommissionAmount(row),
            row.commissionFormulaText || '',
            row.visibilityLevel || '',
            row.code,
            statusText,
            row.date,
            row.expiresAtText || formatLeadDateTime(row.expiresAt),
            row.consent ? 'yes' : 'unknown',
            formatLeadDateTime(row.consentAt),
            usedTime
        ].map(csvEscape).join(',') + '\n';
    });

    const bom = "\uFEFF";
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const timestamp = new Date().getTime();
    const fileNamePartner = partnerFilter === 'all' ? 'TongHop' : partnerFilter.replace(/\s+/g, '');
    link.setAttribute("download", `DatePlanner_B2B_${fileNamePartner}_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

window.clearData = window.clearDemoDataInternalOnly;

// ==========================================
// KHỞI CHẠY CÁC HÀM UI CÒN LẠI KHI TẢI TRANG
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    applyLocalComboImages();

    if (window.emailjs) {
        window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
    } else {
        console.warn("EmailJS SDK chua san sang. Voucher van duoc tao, nhung email se khong gui duoc.");
    }

    if(document.getElementById('combo-grid')) {
        window.renderCombos();
    }

    window.renderTrendingCombos();
    window.initTrendingAutoScroll();
    window.populateInviteCombos();
    window.setInviteCardMode?.(window.currentInviteCardMode || 'story');
    
    if(document.getElementById('fomo-toast')) {
        window.triggerFOMO = function() {
            const toast = document.getElementById('fomo-toast');
            const randomName = ["Linh", "Hoàng", "Tuấn", "Mai", "Bảo"][Math.floor(Math.random() * 5)];
            const randomCombo = combos[Math.floor(Math.random() * combos.length)];
            toast.innerHTML = `
                <div class="glass-panel border-l-4 border-l-rose-500 p-4 rounded-2xl flex items-center gap-4 w-72 md:w-80">
                    <div class="w-12 h-12 rounded-full btn-gradient flex items-center justify-center shrink-0 shadow-inner">
                        <i class="fa-solid fa-ticket text-white text-lg"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs text-gray-400 mb-1 truncate"><span class="font-bold text-white">${randomName}</span> vừa nhận voucher ưu đãi demo</p>
                        <p class="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-300 truncate">Giảm ${randomCombo.discount}</p>
                    </div>
                </div>
            `;
            toast.classList.remove('-translate-x-[150%]');
            toast.classList.add('translate-x-0');
            setTimeout(() => {
                toast.classList.remove('translate-x-0');
                toast.classList.add('-translate-x-[150%]');
            }, 4000);
        };
        setInterval(window.triggerFOMO, Math.floor(Math.random() * 7000) + 8000);
    }
});
