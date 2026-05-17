// ==========================================
// 1. KẾT NỐI CƠ SỞ DỮ LIỆU ĐÁM MÂY (FIREBASE)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, getDocs, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// ĐÂY LÀ CHÌA KHÓA FIREBASE BẠN VỪA LẤY ĐƯỢC
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
// PIN này chỉ dùng cho demo. Khi triển khai thật cần dùng Firebase Authentication và phân quyền theo partner.
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

function getComboImage(combo) {
    return combo?.img || LOCAL_FALLBACK_IMAGE(combo?.title);
}

function getComboItinerary(combo) {
    if (Array.isArray(combo?.itinerary) && combo.itinerary.length > 0) return combo.itinerary;

    return [{
        time: 'Gợi ý',
        activity: combo?.desc || 'Khám phá lộ trình DatePlanner',
        location: combo?.address || 'TP.HCM'
    }];
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

    grid.innerHTML = trendingCombos.map((combo, index) => `
        <article class="combo-card min-w-[280px] md:min-w-[360px] snap-start rounded-3xl overflow-hidden group">
            <div class="h-52 relative overflow-hidden cursor-pointer" onclick="window.openComboDetail(${combo.id})">
                <img src="${getComboImage(combo)}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition duration-700 group-hover:scale-110" alt="${combo.title}">
                <div class="absolute top-4 left-4 ${index === 0 ? 'top-1-glow bg-yellow-400 text-black' : 'btn-gradient text-white'} font-black px-4 py-2 rounded-xl shadow-lg text-sm z-10">#${index + 1} Trending</div>
                <div class="absolute inset-0 bg-gradient-to-t from-[#0f0f13] via-transparent to-transparent"></div>
            </div>
            <div class="p-6 bg-[#111115]/95">
                <div class="flex items-center justify-between gap-3 mb-3">
                    <h3 class="text-2xl font-extrabold text-white leading-tight">${combo.title}</h3>
                    <span class="text-xs text-orange-300 bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full font-black">${combo.bookings || 0} lượt</span>
                </div>
                <p class="text-gray-400 text-sm leading-relaxed line-clamp-2 mb-4">${combo.desc}</p>
                <button onclick="window.openComboDetail(${combo.id})" class="w-full bg-white/10 hover:bg-rose-500 border border-white/20 text-white px-5 py-3 rounded-xl text-sm font-bold transition">
                    <i class="fa-solid fa-eye mr-2"></i>Xem chi tiết
                </button>
            </div>
        </article>
    `).join('');
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
        result.classList.remove('text-gray-500');
        result.classList.add('text-white');
        ticks += 1;

        if (ticks >= maxTicks) {
            clearInterval(ticker);
            const selected = combos[Math.floor(Math.random() * combos.length)];
            result.innerText = selected.title;
            details.innerHTML = `
                <div class="animate-fade-in-up text-left grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5 items-center">
                    <img src="${getComboImage(selected)}" class="w-full h-36 md:h-32 object-cover rounded-2xl border border-white/10" alt="${selected.title}">
                    <div>
                        <p class="text-gray-300 mb-3 leading-relaxed">${selected.desc}</p>
                        <p class="text-sm text-gray-400 mb-4"><i class="fa-solid fa-location-dot text-rose-400 mr-2"></i>${selected.address || 'TP.HCM'}</p>
                        <button onclick="window.openComboDetail(${selected.id})" class="btn-gradient text-white font-extrabold py-3 px-6 rounded-xl transition shadow-lg">
                            <i class="fa-solid fa-eye mr-2"></i>Xem lộ trình này
                        </button>
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
    const name = document.getElementById('inv-name')?.value.trim() || 'Tên người ấy...';
    const message = document.getElementById('inv-message')?.value.trim() || 'Cuối tuần này rảnh không, đi đu đưa cùng tớ nhé!';
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
        if (button) button.innerHTML = '<i class="fa-regular fa-copy mr-2"></i> Sao Chép Thiệp Mời';
    }, 1800);
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
    wrapper.innerHTML = fromUser
        ? `<div class="bg-rose-500 text-white text-sm p-4 rounded-2xl rounded-br-sm max-w-[85%] leading-relaxed shadow-sm font-medium">${text}</div>`
        : `<div class="w-8 h-8 rounded-full btn-gradient flex items-center justify-center shrink-0 mb-1 shadow-md"><i class="fa-solid fa-robot text-white text-xs"></i></div><div class="bg-[#171717] text-sm text-gray-200 p-4 rounded-2xl rounded-bl-sm max-w-[85%] border border-gray-800 leading-relaxed shadow-sm font-medium">${text}</div>`;
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

window.getMoodRecommendation = function(moodType) {
    let matchedCombos = [];
    if (moodType === 'chill') matchedCombos = combos.filter(c => c.id === 1 || c.id === 21 || c.id === 23 || c.id === 30 || c.id === 9 || c.id === 31);
    else if (moodType === 'active') matchedCombos = combos.filter(c => c.id === 6 || c.id === 11 || c.id === 20 || c.id === 28 || c.id === 35);
    else if (moodType === 'romantic') matchedCombos = combos.filter(c => c.id === 4 || c.id === 12 || c.id === 22 || c.id === 25 || c.id === 29);
    else if (moodType === 'fun') matchedCombos = combos.filter(c => c.id === 2 || c.id === 3 || c.id === 10 || c.id === 14 || c.id === 32 || c.id === 33);

    if (matchedCombos.length === 0) matchedCombos = combos;
    const randomCombo = matchedCombos[Math.floor(Math.random() * matchedCombos.length)];
    const container = document.getElementById('mood-result-container');
    
    container.innerHTML = `
        <div class="glass-panel p-2 rounded-[2.5rem] shadow-[0_0_40px_rgba(168,85,247,0.3)] mt-8 animate-fade-in-up border border-purple-500/30">
            <div class="bg-[#0f0f13] rounded-[2.2rem] p-6 md:p-8 flex flex-col md:flex-row gap-8 items-center text-left">
                <div class="w-full md:w-1/2 h-56 rounded-3xl overflow-hidden relative shadow-lg">
                    <img src="${getComboImage(randomCombo)}" class="w-full h-full object-cover">
                    <div class="absolute top-4 left-4 bg-gradient-to-r from-rose-500 to-orange-500 text-white font-black px-3 py-1 rounded-lg shadow-lg text-sm z-10 transform -rotate-2">Giảm ${randomCombo.discount}</div>
                </div>
                <div class="w-full md:w-1/2">
                    <span class="text-xs font-bold text-purple-400 uppercase tracking-widest block mb-2"><i class="fa-solid fa-bolt text-yellow-500 mr-1"></i> Bộ gợi ý DatePlanner đề xuất</span>
                    <h3 class="text-3xl font-black text-white mb-3 leading-tight">${randomCombo.title}</h3>
                    <p class="text-gray-400 mb-4 font-medium"><i class="fa-solid fa-list-check text-rose-400 mr-2"></i>${randomCombo.desc}</p>
                    <p class="text-gray-300 text-sm mb-6 bg-white/5 p-3 rounded-xl border border-white/10"><i class="fa-solid fa-location-dot mr-2 text-rose-400"></i>${randomCombo.address}</p>
                    <div class="flex gap-4">
                        <button onclick="window.openComboDetail(${randomCombo.id})" class="btn-gradient text-white font-extrabold py-3 px-8 rounded-xl transition shadow-[0_0_20px_rgba(244,63,94,0.4)] flex-1 text-center"><i class="fa-solid fa-eye mr-2"></i>Xem Lộ Trình Này</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    container.classList.remove('hidden');
    setTimeout(() => { container.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
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
    
    if(filtered.length === 0) {
        comboGrid.innerHTML = `
            <div class="col-span-1 md:col-span-2 lg:col-span-3 text-center py-20 bg-white/5 rounded-3xl border border-white/10 border-dashed backdrop-blur-sm">
                <i class="fa-regular fa-face-frown-open text-6xl text-gray-600 mb-5"></i>
                <h3 class="text-2xl font-bold text-white mb-2">Tiếc quá, chưa tìm thấy lộ trình phù hợp!</h3>
                <button onclick="window.resetFilters()" class="mt-6 text-rose-400 hover:text-rose-300 font-bold underline transition">Xóa bộ lọc</button>
            </div>
        `;
        return;
    }

    filtered.forEach(combo => {
        let targetBadge = combo.target === 'couple' ? '<span class="text-rose-300 border border-rose-900 bg-rose-900/40 px-2.5 py-0.5 rounded-full text-[10px] ml-2 font-bold tracking-wider uppercase"><i class="fa-solid fa-heart mr-1"></i> Cặp đôi</span>' :
                          combo.target === 'group' ? '<span class="text-blue-300 border border-blue-900 bg-blue-900/40 px-2.5 py-0.5 rounded-full text-[10px] ml-2 font-bold tracking-wider uppercase"><i class="fa-solid fa-users mr-1"></i> Hội nhóm</span>' :
                          '<span class="text-purple-300 border border-purple-900 bg-purple-900/40 px-2.5 py-0.5 rounded-full text-[10px] ml-2 font-bold tracking-wider uppercase"><i class="fa-solid fa-user-group mr-1"></i> Đa năng</span>';

        const card = document.createElement('div');
        card.className = 'combo-card rounded-3xl overflow-hidden flex flex-col group';
        card.innerHTML = `
            <div class="h-52 overflow-hidden relative cursor-pointer" onclick="window.openComboDetail(${combo.id})">
                <img src="${getComboImage(combo)}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition duration-700 group-hover:scale-110">
                <div class="absolute top-4 left-4 bg-gradient-to-r from-rose-500 to-orange-500 text-white font-black px-3 py-1 rounded-lg shadow-lg text-sm z-10 transform -rotate-2">Giảm ${combo.discount}</div>
                <div class="absolute inset-0 bg-gradient-to-t from-[#0f0f13] to-transparent z-0"></div>
            </div>
            <div class="p-6 flex-1 flex flex-col justify-between bg-[#111115]/90 backdrop-blur-md relative z-10 -mt-2">
                <div>
                    <h3 class="text-2xl font-extrabold mb-1 flex items-center flex-wrap gap-y-2 text-white">${combo.title} ${targetBadge}</h3>
                    <p class="text-gray-400 text-sm mb-4 mt-3 line-clamp-2 leading-relaxed">${combo.desc}</p>
                    <p class="text-gray-300 text-sm mb-4 bg-white/5 p-3 rounded-xl border border-white/10 truncate"><i class="fa-solid fa-location-dot mr-2 text-rose-400"></i>${combo.address}</p>
                </div>
                <div class="flex items-center justify-between mt-3 pt-5 border-t border-white/10">
                    <span class="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-300">${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(combo.price)}</span>
                    <button onclick="window.openComboDetail(${combo.id})" class="bg-white/10 hover:bg-rose-500 border border-white/20 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition">Chi tiết</button>
                </div>
            </div>
        `;
        document.getElementById('combo-grid').appendChild(card);
    });
};

window.filterCombosCategory = function(type) {
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(btn => {
        btn.classList.remove('btn-gradient', 'text-white', 'border-transparent');
        btn.classList.add('bg-white/5', 'text-gray-300', 'border-white/10');
    });
    event.target.classList.remove('bg-white/5', 'text-gray-300', 'border-white/10');
    event.target.classList.add('btn-gradient', 'text-white', 'border-transparent');
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
        btn.classList.remove('btn-gradient', 'text-white', 'border-transparent');
        btn.classList.add('bg-white/5', 'text-gray-300', 'border-white/10');
    });
    btns[0].classList.remove('bg-white/5', 'text-gray-300', 'border-white/10');
    btns[0].classList.add('btn-gradient', 'text-white', 'border-transparent');
    window.currentCategoryFilter = 'all';
    window.renderCombos();
};

// ==========================================
// 5. CỬA SỔ CHI TIẾT (MODAL)
// ==========================================
window.openComboDetail = function(id) {
    const combo = combos.find(c => c.id === id);
    if(!combo) return;

    document.getElementById('detail-img').src = getComboImage(combo);
    document.getElementById('detail-category').innerHTML = `<i class="fa-solid ${combo.icon} mr-1"></i> ${combo.category === 'low' ? 'Bình dân' : (combo.category === 'mid' ? 'Tiêu chuẩn' : 'Cao cấp')}`;
    document.getElementById('detail-title').innerText = combo.title;
    document.getElementById('lead-combo-id').value = combo.id;
    document.getElementById('lead-combo-title').value = combo.title;
    document.getElementById('lead-combo-discount').value = combo.discount;
    
    document.getElementById('detail-desc').innerHTML = `
        <i class="fa-solid fa-location-dot text-rose-500 mt-1 mr-3 text-xl"></i>
        <div class="flex-1">
            <span class="block text-gray-400 mb-1 text-xs font-bold uppercase tracking-widest">Khu vực chính</span>
            <div class="flex items-center justify-between">
                <span class="text-white font-bold text-lg">${combo.address}</span>
            </div>
        </div>
    `;
    document.getElementById('detail-price').innerText = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(combo.price);
    document.getElementById('detail-btn-voucher').innerHTML = `<i class="fa-solid fa-ticket mr-2"></i>Lấy voucher ưu đãi demo ${combo.discount}`;

    const timelineContainer = document.getElementById('detail-timeline');
    timelineContainer.innerHTML = '';
    getComboItinerary(combo).forEach((step) => {
        timelineContainer.innerHTML += `
            <div class="relative">
                <div class="absolute -left-[33px] top-1 h-6 w-6 rounded-full btn-gradient border-4 border-[#0f0f13] shadow-[0_0_10px_rgba(244,63,94,0.6)]"></div>
                <h5 class="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-300 font-black text-xl mb-1">${step.time}</h5>
                <p class="text-white font-bold text-lg mb-2">${step.activity}</p>
                <div class="text-gray-400 text-sm flex items-start mt-2 bg-white/5 p-3 rounded-xl border border-white/5">
                    <i class="fa-solid fa-map-pin mt-1 mr-2 text-gray-500"></i> 
                    <span class="font-medium flex-1">${step.location}</span>
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

    submitButton.setAttribute('aria-disabled', String(!consentCheckbox.checked));
    submitButton.classList.toggle('opacity-50', !consentCheckbox.checked);
    submitButton.classList.toggle('cursor-not-allowed', !consentCheckbox.checked);
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
    const name = document.getElementById('lead-name').value.trim();
    const phone = document.getElementById('lead-phone').value.trim();
    const email = document.getElementById('lead-email').value.trim();
    const hasConsent = document.getElementById('lead-consent').checked;
    const comboTitle = document.getElementById('lead-combo-title').value;
    const comboId = parseInt(document.getElementById('lead-combo-id').value);

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
    const partnerLeads = window.cloudLeads.filter(l => l.partner === selectedCombo.partner);
    const partnerUsedLeads = partnerLeads.filter(l => getEffectiveLeadStatus(l) === 'used');
    const partnerConversionRate = partnerLeads.length > 0 ? partnerUsedLeads.length / partnerLeads.length : undefined;
    const commissionSnapshot = calculateCommission(selectedCombo, partnerConversionRate);
    const now = new Date();
    const expiresAt = now.getTime() + (VOUCHER_VALID_DAYS * DAY_IN_MS);

    const leadData = {
        name: name, 
        phone: phone, 
        email: email, 
        combo: comboTitle,
        partner: selectedCombo.partner,
        code: 'DP-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
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
    document.getElementById('success-user-name').innerText = name;
    document.getElementById('success-combo-title').innerText = selectedCombo.title;
    document.getElementById('success-voucher-code').innerText = leadData.code;
    document.getElementById('success-user-email').innerText = email;
    document.getElementById('success-voucher-discount').innerText = `Giảm ngay ${selectedCombo.discount}`;

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
    document.getElementById('admin-login-modal').classList.remove('hidden');
};

window.closeAdminLogin = function() {
    document.getElementById('admin-login-modal').classList.add('hidden');
};

window.verifyAdmin = function() {
    const pinInput = document.getElementById('admin-pin').value;
    if(pinInput === ADMIN_DEMO_PIN) {
        window.closeAdminLogin(); 
        document.getElementById('admin-view').classList.remove('hidden');
        document.getElementById('client-view')?.classList.add('hidden');
        window.populatePartnerFilter(); 
        window.renderAdminData();       
    } else {
        document.getElementById('admin-error').classList.remove('hidden');
    }
};

window.logoutAdmin = function() {
    document.getElementById('admin-pin').value = '';
    document.getElementById('admin-error').classList.add('hidden');
    document.getElementById('admin-view').classList.add('hidden');
    document.getElementById('admin-login-modal').classList.remove('hidden');
}

window.populatePartnerFilter = function() {
    const selectEl = document.getElementById('admin-partner-filter');
    if (!selectEl) return;
    const currentVal = selectEl.value;
    
    const uniquePartners = [...new Set(window.cloudLeads.map(l => l.partner || 'Đối tác khác'))];
    
    selectEl.innerHTML = '<option value="all">Tất cả Đối tác (Tổng hợp)</option>';
    uniquePartners.forEach(p => { selectEl.innerHTML += `<option value="${p}">${p}</option>`; });
    selectEl.value = currentVal || 'all';
};

window.renderAdminData = function() {
    const partnerFilter = document.getElementById('admin-partner-filter')?.value || 'all';
    const tbody = document.getElementById('leads-table-body');
    const noDataMsg = document.getElementById('no-data-msg');
    
    if(!tbody) return;

    // Lọc data Firebase
    const leads = partnerFilter === 'all' 
        ? window.cloudLeads 
        : window.cloudLeads.filter(l => (l.partner || 'Đối tác khác') === partnerFilter);
    
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
                    ${statusTimestamp ? `<div class="text-gray-500 text-[10px] mt-1 font-medium">${statusTimestamp}</div>` : ''}
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
                    <td class="px-6 py-4 font-bold text-gray-200">${lead.name}</td>
                    <td class="px-6 py-4">
                        <div class="text-gray-300 text-xs mb-1"><i class="fa-solid fa-phone mr-1 text-gray-500"></i> ${maskedPhone}</div>
                        <div class="text-gray-400 text-xs"><i class="fa-solid fa-envelope mr-1 text-gray-500"></i> ${maskedEmail}</div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full text-xs mb-2 inline-block truncate max-w-[200px] font-bold">${lead.combo}</span><br>
                        <span class="text-gray-400 text-xs font-medium"><i class="fa-solid fa-store mr-1 text-yellow-500"></i> ${partnerName}</span>
                        <div class="text-gray-500 text-xs mt-1 font-medium">Tier: <span class="text-gray-300 uppercase">${partnerTier}</span></div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="text-white font-black font-mono block mb-1 tracking-widest text-sm">${lead.code || 'N/A'}</span>
                        <span class="text-gray-500 text-xs font-medium">${lead.date}</span>
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
    let csvContent = "Họ tên,SĐT,Email,Combo,Đối tác,Partner Tier,Estimated AOV,Commission Rate,Commission Amount,Visibility Level,Mã voucher,Trạng thái,Ngày tạo,Ngày cập nhật trạng thái nếu có\n";

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
            getLeadCommissionAmount(row),
            row.visibilityLevel || '',
            row.code,
            statusText,
            row.date,
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
};

// ==========================================
// KHỞI CHẠY CÁC HÀM UI CÒN LẠI KHI TẢI TRANG
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('combo-grid')) {
        window.renderCombos();
    }

    window.renderTrendingCombos();
    window.populateInviteCombos();
    
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
