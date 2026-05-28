// ==========================================
// 1. KẾT NỐI CƠ SỞ DỮ LIỆU ĐÁM MÂY (FIREBASE)
// ==========================================
// Demo MVP only. Production must use Firebase Authentication, Firestore Security Rules,
// server-side email sending/rate limiting, environment variables, and domain restrictions.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, getDocs, doc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

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
const combosCollection = collection(db, "combos");
// PIN này chỉ dùng cho demo, không dùng cho production. Khi triển khai thật cần dùng Firebase Authentication và phân quyền theo partner.
const ADMIN_DEMO_PIN = "DP2026B2B!";
const VOUCHER_VALID_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PARTNER_PACKAGE = 'Basic';
const DEFAULT_VOUCHER_VALUE = 50000;
const PARTNER_PACKAGES = {
    Basic: {
        packageFee: 500000,
        platformFee: 100000,
        voucherBudget: 350000,
        deposit: 50000,
        cpsRate: 0.05,
        label: "Basic"
    },
    Growth: {
        packageFee: 1500000,
        platformFee: 300000,
        voucherBudget: 1000000,
        deposit: 200000,
        cpsRate: 0.07,
        label: "Growth"
    },
    Premium: {
        packageFee: 3000000,
        platformFee: 600000,
        voucherBudget: 2000000,
        deposit: 400000,
        cpsRate: 0.09,
        label: "Premium"
    }
};
// Trong 6 tháng Basic pilot, platform fee/CPS/deposit có thể được miễn theo chính sách báo cáo;
// cấu hình trên là cấu hình thương mại hóa từ tháng 7.
const EMAILJS_PUBLIC_KEY = "RU8QbESICVGc8h_rl";
const EMAILJS_SERVICE_ID = "service_2026";
const EMAILJS_TEMPLATE_ID = "template_fcoq5lq";
const ADMIN_MAX_FAILED_ATTEMPTS = 5;
const ADMIN_LOCKOUT_MS = 30 * 1000;
let adminFailedAttempts = 0;
let adminLockedUntil = 0;
const LEAD_STATUSES = {
    ISSUED: "issued",
    USED_PENDING_BILL: "used_pending_bill",
    RECONCILED: "reconciled",
    SETTLED: "settled",
    EXPIRED: "expired",
    CANCELLED: "cancelled",
    DISPUTED: "disputed"
};
const LEAD_STATUS_META = {
    issued: {
        label: 'Đã phát hành',
        csvLabel: 'issued',
        badgeClass: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
        icon: 'fa-ticket'
    },
    used_pending_bill: {
        label: 'Đã dùng - chờ bill',
        csvLabel: 'used_pending_bill',
        badgeClass: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
        icon: 'fa-receipt'
    },
    reconciled: {
        label: 'Đã đối soát',
        csvLabel: 'reconciled',
        badgeClass: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
        icon: 'fa-calculator'
    },
    settled: {
        label: 'Đã settled',
        csvLabel: 'settled',
        badgeClass: 'bg-green-500/20 text-green-300 border border-green-500/30',
        icon: 'fa-circle-check'
    },
    expired: {
        label: 'Hết hạn',
        csvLabel: 'expired',
        badgeClass: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
        icon: 'fa-hourglass-end'
    },
    cancelled: {
        label: 'Đã hủy',
        csvLabel: 'cancelled',
        badgeClass: 'bg-red-500/20 text-red-300 border border-red-500/30',
        icon: 'fa-ban'
    },
    disputed: {
        label: 'Tranh chấp',
        csvLabel: 'disputed',
        badgeClass: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
        icon: 'fa-triangle-exclamation'
    }
};
const VALID_LEAD_STATUSES = new Set(Object.values(LEAD_STATUSES));
const MOOD_COMBO_IDS = {
    chill: [1, 5, 8, 9, 15, 18],
    active: [6, 11, 14],
    romantic: [1, 4, 7, 12, 16],
    fun: [2, 3, 10, 13, 17]
};
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
        if (localComboImages[combo.id] && !combo.img) {
            combo.img = localComboImages[combo.id];
        }
    });
}

function getAllCombos() {
    return Array.isArray(combos) ? combos : [];
}

function getVisibleCombos() {
    return getAllCombos().filter(combo => combo?.isActive !== false && combo?.isDeleted !== true);
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

function getNowText() {
    return formatLeadDateTime(Date.now());
}

function normalizeComboRecord(combo = {}, firebaseId = '') {
    const comboId = Number(combo.id);
    const nowText = getNowText();

    return {
        id: Number.isFinite(comboId) ? comboId : Date.now(),
        title: String(combo.title || '').trim(),
        desc: String(combo.desc || '').trim(),
        address: String(combo.address || '').trim(),
        district: String(combo.district || '').trim(),
        partner: String(combo.partner || '').trim(),
        partnerPackage: normalizePartnerPackage(combo.partnerPackage),
        discount: String(combo.discount || '').trim().toUpperCase(),
        price: Math.round(toSafeNumber(combo.price, 0)),
        category: ['low', 'mid', 'high'].includes(combo.category) ? combo.category : 'mid',
        target: ['couple', 'group', 'both'].includes(combo.target) ? combo.target : 'both',
        bookings: Math.max(0, Math.round(toSafeNumber(combo.bookings, 0))),
        img: String(combo.img || '').trim(),
        icon: String(combo.icon || 'fa-heart').trim(),
        itinerary: Array.isArray(combo.itinerary) ? combo.itinerary : [],
        isActive: combo.isActive !== false,
        isDeleted: combo.isDeleted === true,
        createdAt: combo.createdAt || nowText,
        updatedAt: combo.updatedAt || nowText,
        deletedAt: combo.deletedAt || '',
        firebaseId
    };
}

function setRuntimeCombos(nextCombos = []) {
    if (!Array.isArray(combos)) return;
    combos.splice(0, combos.length, ...nextCombos.map(combo => normalizeComboRecord(combo, combo.firebaseId)));
    applyLocalComboImages();
}

function rerenderComboSurfaces() {
    window.renderCombos?.();
    window.renderTrendingCombos?.();
    window.initTrendingAutoScroll?.();
    window.populateInviteCombos?.();
    window.renderComboCms?.();
    window.renderCmsStats?.();
}

async function loadCombosFromFirestore() {
    const snapshot = await getDocs(combosCollection);
    return snapshot.docs.map(document => normalizeComboRecord(document.data(), document.id));
}

window.loadCombosFromFirestore = loadCombosFromFirestore;

window.loadCombos = async function() {
    try {
        const firestoreCombos = await loadCombosFromFirestore();
        if (firestoreCombos.length > 0) {
            setRuntimeCombos(firestoreCombos.sort((a, b) => Number(a.id) - Number(b.id)));
            window.comboSource = 'firestore';
            rerenderComboSurfaces();
            return getAllCombos();
        }
    } catch (error) {
        console.error('Loi load combos tu Firestore:', error);
    }

    setRuntimeCombos(DEFAULT_COMBO_SEED.map(combo => normalizeComboRecord(combo, combo.firebaseId)));
    window.comboSource = 'fallback';
    rerenderComboSurfaces();
    return getAllCombos();
};

function parseComboItinerary(value = '') {
    const text = String(value || '').trim();
    if (!text) return [];

    if (text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            throw new Error('Itinerary JSON chua hop le.');
        }
    }

    return text.split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const [time = '', activity = '', location = ''] = line.split('|').map(part => part.trim());
            return { time, activity, location };
        });
}

function stringifyComboItinerary(combo = {}) {
    return getComboItinerary(combo)
        .map(item => [item.time, item.activity, item.location].filter(Boolean).join(' | '))
        .join('\n');
}

function validateComboData(comboData = {}) {
    if (!comboData.title) return 'Vui long nhap ten combo.';
    if (!comboData.partner) return 'Vui long nhap doi tac.';
    if (!Object.prototype.hasOwnProperty.call(PARTNER_PACKAGES, comboData.partnerPackage)) return 'Goi doi tac chi nhan Basic, Growth hoac Premium.';
    if (!Number.isInteger(comboData.price) || comboData.price <= 0) return 'Gia tham khao phai la so nguyen VND lon hon 0.';
    if (!/^\d+(\.\d+)?%$|^\d+K$/i.test(comboData.discount)) return 'Uu dai phai dung dang 15%, 20%, 30K hoac 50K.';
    if (!['low', 'mid', 'high'].includes(comboData.category)) return 'Nhom gia khong hop le.';
    if (!['couple', 'group', 'both'].includes(comboData.target)) return 'Target khong hop le.';
    return '';
}

function getNextComboId() {
    return getAllCombos().reduce((max, combo) => Math.max(max, Number(combo.id) || 0), 0) + 1;
}

function getComboFormData() {
    const idValue = Number(document.getElementById('cms-combo-id')?.value || 0);
    const nowText = getNowText();
    const comboData = {
        id: Number.isFinite(idValue) && idValue > 0 ? idValue : getNextComboId(),
        title: String(document.getElementById('cms-title')?.value || '').trim(),
        desc: String(document.getElementById('cms-desc')?.value || '').trim(),
        address: String(document.getElementById('cms-address')?.value || '').trim(),
        district: String(document.getElementById('cms-district')?.value || '').trim(),
        partner: String(document.getElementById('cms-partner')?.value || '').trim(),
        partnerPackage: normalizePartnerPackage(document.getElementById('cms-partner-package')?.value),
        discount: String(document.getElementById('cms-discount')?.value || '').trim().toUpperCase(),
        price: Math.round(toSafeNumber(document.getElementById('cms-price')?.value, 0)),
        category: document.getElementById('cms-category')?.value || 'mid',
        target: document.getElementById('cms-target')?.value || 'both',
        bookings: Math.max(0, Math.round(toSafeNumber(document.getElementById('cms-bookings')?.value, 0))),
        img: String(document.getElementById('cms-img')?.value || '').trim(),
        icon: String(document.getElementById('cms-icon')?.value || 'fa-heart').trim(),
        itinerary: parseComboItinerary(document.getElementById('cms-itinerary')?.value || ''),
        isActive: true,
        isDeleted: false,
        updatedAt: nowText
    };

    const existing = getAllCombos().find(combo => Number(combo.id) === Number(comboData.id));
    comboData.createdAt = existing?.createdAt || nowText;
    comboData.firebaseId = existing?.firebaseId || '';
    return comboData;
}

async function findComboDocumentIdByComboId(comboId) {
    const existingLocal = getAllCombos().find(combo => Number(combo.id) === Number(comboId));
    if (existingLocal?.firebaseId) return existingLocal.firebaseId;

    const snapshot = await getDocs(combosCollection);
    const match = snapshot.docs.find(document => Number(document.data()?.id) === Number(comboId));
    return match?.id || '';
}

async function ensureComboDocument(comboId) {
    const existingId = await findComboDocumentIdByComboId(comboId);
    if (existingId) return existingId;

    const fallbackCombo = getAllCombos().find(combo => Number(combo.id) === Number(comboId));
    if (!fallbackCombo) throw new Error('Khong tim thay combo.');

    const documentId = `combo-${comboId}`;
    const payload = normalizeComboRecord(fallbackCombo);
    delete payload.firebaseId;
    await setDoc(doc(db, 'combos', documentId), payload);
    return documentId;
}

window.seedDefaultCombosToFirestore = async function() {
    try {
        const snapshot = await getDocs(combosCollection);
        const existingIds = new Set(snapshot.docs.map(document => Number(document.data()?.id)).filter(Number.isFinite));
        let createdCount = 0;

        for (const combo of DEFAULT_COMBO_SEED) {
            if (existingIds.has(Number(combo.id))) continue;
            const payload = normalizeComboRecord(combo);
            delete payload.firebaseId;
            await setDoc(doc(db, 'combos', `combo-${payload.id}`), payload);
            createdCount += 1;
        }

        await window.loadCombos();
        alert(createdCount > 0 ? `Da dong bo ${createdCount} combo mau len Firestore.` : 'Combo mau da ton tai tren Firestore, khong tao trung.');
    } catch (error) {
        console.error('Loi seed combo:', error);
        alert('Khong the dong bo combo mau len Firestore.');
    }
};

window.createCombo = async function(comboData) {
    const payload = normalizeComboRecord(comboData);
    delete payload.firebaseId;
    await addDoc(combosCollection, payload);
    await window.loadCombos();
};

window.updateCombo = async function(comboId, comboData) {
    const documentId = await ensureComboDocument(comboId);
    const payload = normalizeComboRecord({ ...comboData, id: Number(comboId), updatedAt: getNowText() });
    delete payload.firebaseId;
    await updateDoc(doc(db, 'combos', documentId), payload);
    await window.loadCombos();
};

window.softDeleteCombo = async function(comboId) {
    if (!confirm('Xoa mem combo nay? Combo se bi an khoi client nhung khong bi xoa khoi Firestore.')) return;
    const documentId = await ensureComboDocument(comboId);
    await updateDoc(doc(db, 'combos', documentId), {
        isDeleted: true,
        isActive: false,
        deletedAt: getNowText(),
        updatedAt: getNowText()
    });
    await window.loadCombos();
};

window.toggleComboActive = async function(comboId) {
    const combo = getAllCombos().find(item => Number(item.id) === Number(comboId));
    if (!combo) return;
    const documentId = await ensureComboDocument(comboId);
    await updateDoc(doc(db, 'combos', documentId), {
        isActive: combo.isActive === false,
        updatedAt: getNowText()
    });
    await window.loadCombos();
};

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

function formatVND(amount) {
    const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(safeAmount);
}

function toSafeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function normalizePartnerPackage(value) {
    const rawValue = String(value || '').trim().toLowerCase();
    if (rawValue === 'premium') return 'Premium';
    if (rawValue === 'growth') return 'Growth';
    return DEFAULT_PARTNER_PACKAGE;
}

function getPartnerPackageConfig(packageName) {
    return PARTNER_PACKAGES[normalizePartnerPackage(packageName)] || PARTNER_PACKAGES[DEFAULT_PARTNER_PACKAGE];
}

function getComboPartnerPackage(combo = {}) {
    return normalizePartnerPackage(combo.partnerPackage);
}

function getVoucherValueFromCombo(combo = {}) {
    if (!combo) return DEFAULT_VOUCHER_VALUE;

    const discount = String(combo.discount || "").trim().toUpperCase();

    if (discount.endsWith("K")) {
        const value = Number(discount.replace("K", "").trim());
        return Number.isFinite(value) ? value * 1000 : DEFAULT_VOUCHER_VALUE;
    }

    if (discount.endsWith("%")) {
        const percent = Number(discount.replace("%", "").trim()) / 100;
        if (Number.isFinite(percent) && Number.isFinite(Number(combo.price))) {
            return Math.round(Number(combo.price) * percent);
        }
    }

    return DEFAULT_VOUCHER_VALUE;
}

function calculateCpsSettlement({ billAmount, voucherValue, cpsRate }) {
    const safeBill = Number(billAmount) || 0;
    const safeVoucher = Number(voucherValue) || 0;
    const safeRate = Number(cpsRate) || 0;

    const cpsCommission = Math.round(safeBill * safeRate);
    const netReimbursement = Math.max(safeVoucher - cpsCommission, 0);
    const receivableDifference = Math.max(cpsCommission - safeVoucher, 0);

    return {
        cpsCommission,
        netReimbursement,
        receivableDifference
    };
}

function getLeadPartnerPackage(lead = {}) {
    return normalizePartnerPackage(lead.partnerPackage);
}

function getLeadVoucherCode(lead = {}) {
    return lead.voucherCode || lead.code || '';
}

function getLeadVoucherValue(lead = {}) {
    return Math.max(0, toSafeNumber(lead.voucherValue, DEFAULT_VOUCHER_VALUE));
}

function getLeadBillAmount(lead = {}) {
    return Math.max(0, toSafeNumber(lead.billAmount, 0));
}

function getLeadCpsRate(lead = {}) {
    const packageConfig = getPartnerPackageConfig(getLeadPartnerPackage(lead));
    return packageConfig.cpsRate;
}

function getLeadFinancials(lead = {}) {
    const billAmount = getLeadBillAmount(lead);
    const voucherValue = getLeadVoucherValue(lead);
    const cpsRate = getLeadCpsRate(lead);
    const calculated = calculateCpsSettlement({
        billAmount,
        voucherValue,
        cpsRate
    });

    return {
        billAmount,
        voucherValue,
        cpsRate,
        ...calculated,
        cpsCommission: toSafeNumber(lead.cpsCommission, calculated.cpsCommission),
        netReimbursement: toSafeNumber(lead.netReimbursement, calculated.netReimbursement),
        receivableDifference: toSafeNumber(lead.receivableDifference, calculated.receivableDifference)
    };
}

function normalizeLeadStatus(status, lead = {}) {
    if (VALID_LEAD_STATUSES.has(status)) return status;
    if (status === "pending") return LEAD_STATUSES.ISSUED;
    if (status === "used" && !lead.billAmount) return LEAD_STATUSES.USED_PENDING_BILL;
    if (status === "used" && lead.billAmount) return LEAD_STATUSES.RECONCILED;
    return status || LEAD_STATUSES.ISSUED;
}

function getLeadExpiryTimestamp(lead) {
    if (!lead) return null;
    const expiresAt = Number(lead.expiresAt);
    return Number.isFinite(expiresAt) ? expiresAt : null;
}

function getEffectiveLeadStatus(lead) {
    const status = normalizeLeadStatus(lead?.status, lead);
    const expiresAt = getLeadExpiryTimestamp(lead);

    if (status === 'issued' && expiresAt && expiresAt < Date.now()) {
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
        voucher_code: leadData.voucherCode || leadData.code,
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
    if (status === 'issued') return lead.issuedAt || lead.date || formatLeadDateTime(lead.timestamp);
    if (status === 'used_pending_bill') return lead.usedAt || '';
    if (status === 'reconciled') return lead.reconciledAt || '';
    if (status === 'settled') return lead.settledAt || lead.reconciledAt || '';
    if (status === 'cancelled') return lead.cancelledAt || '';
    if (status === 'disputed') return lead.disputedAt || '';
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

function hydrateLeadFinancialFields(lead = {}) {
    const partnerPackage = getLeadPartnerPackage(lead);
    const packageConfig = getPartnerPackageConfig(partnerPackage);
    const financials = getLeadFinancials({ ...lead, partnerPackage });
    const issuedAt = lead.issuedAt || lead.createdAt || lead.date || formatLeadDateTime(lead.timestamp);

    return {
        ...lead,
        partnerPackage,
        voucherCode: getLeadVoucherCode(lead),
        voucherValue: financials.voucherValue,
        billAmount: financials.billAmount,
        invoiceCode: lead.invoiceCode || '',
        cpsRate: financials.cpsRate || packageConfig.cpsRate,
        cpsCommission: financials.cpsCommission,
        netReimbursement: financials.netReimbursement,
        receivableDifference: financials.receivableDifference,
        issuedAt,
        usedAt: lead.usedAt || '',
        reconciledAt: lead.reconciledAt || '',
        settledAt: lead.settledAt || ''
    };
}

// Biến lưu trữ data toàn cục
window.cloudLeads = [];
const DEFAULT_COMBO_SEED = Array.isArray(combos) ? JSON.parse(JSON.stringify(combos)) : [];
let isSubmittingLead = false;

// 🔴 LẮNG NGHE REAL-TIME: Bất cứ khi nào có khách đăng ký, tự động tải về Admin
onSnapshot(leadsCollection, (snapshot) => {
    window.cloudLeads = [];
    snapshot.forEach((doc) => {
        const lead = hydrateLeadFinancialFields(doc.data());
        window.cloudLeads.push({
            firebaseId: doc.id,
            ...lead,
            status: getEffectiveLeadStatus(lead),
            rawStatus: normalizeLeadStatus(lead.status, lead)
        });
    });
    
    // Tự động tải lại bảng Admin ngay lập tức nếu đang mở
    const adminView = document.getElementById('admin-view');
    if (adminView && !adminView.classList.contains('hidden')) {
        window.populatePartnerFilter();
        window.renderAdminData();
        window.renderComboCms?.();
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

    const trendingCombos = getVisibleCombos()
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
    const activeCombos = getVisibleCombos();
    if (!result || !details || !button || activeCombos.length === 0) return;

    button.disabled = true;
    button.classList.add('opacity-60', 'cursor-not-allowed');
    details.classList.add('hidden');
    details.innerHTML = '';

    let ticks = 0;
    const maxTicks = 14;
    const ticker = setInterval(() => {
        const combo = activeCombos[Math.floor(Math.random() * activeCombos.length)];
        result.innerText = combo.title;
        result.classList.remove('text-gray-500', 'text-zinc-400');
        result.classList.add('text-white');
        ticks += 1;

        if (ticks >= maxTicks) {
            clearInterval(ticker);
            const selected = activeCombos[Math.floor(Math.random() * activeCombos.length)];
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

    const activeCombos = getVisibleCombos();
    select.innerHTML = activeCombos.map(combo => `<option value="${combo.id}">${combo.title}</option>`).join('');
    window.updateInvitePreview();
};

window.updateInvitePreview = function() {
    const nameInput = document.getElementById('inv-name');
    const messageInput = document.getElementById('inv-message');
    if (nameInput && nameInput.value.length > 40) nameInput.value = nameInput.value.slice(0, 40);
    if (messageInput && messageInput.value.length > 160) messageInput.value = messageInput.value.slice(0, 160);
    const name = nameInput?.value.trim() || 'Tên người ấy...';
    const message = messageInput?.value.trim() || 'Cuối tuần này rảnh không, đi đổi gió cùng tớ nhé!';
    const activeCombos = getVisibleCombos();
    const comboId = Number(document.getElementById('inv-combo')?.value || activeCombos[0]?.id);
    const combo = activeCombos.find(item => item.id === comboId) || activeCombos[0];

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
    const activeCombos = getVisibleCombos();
    const comboId = Number(document.getElementById('inv-combo')?.value || activeCombos[0]?.id);
    const combo = activeCombos.find(item => item.id === comboId) || activeCombos[0];
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
    const activeCombos = getVisibleCombos();
    const comboId = Number(document.getElementById('inv-combo')?.value || activeCombos[0]?.id);
    return activeCombos.find(item => item.id === comboId) || activeCombos[0];
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

    const moodIds = MOOD_COMBO_IDS[moodType] || [];
    const matchedCombos = getVisibleCombos().filter(combo => moodIds.includes(combo.id));
    const container = document.getElementById('mood-result-container');
    const moodTheme = getMoodTheme(moodType);
    if (!container) return;

    clearTimeout(window.moodResultTimer);
    container.classList.remove('hidden');

    if (matchedCombos.length === 0) {
        container.innerHTML = `
            <div class="rounded-[1.75rem] mt-8 p-6 md:p-8 text-white bg-white/5 border border-white/10">
                <h3 class="text-2xl font-black mb-2">Chưa có combo phù hợp với mood này</h3>
                <p class="text-zinc-300 font-semibold leading-relaxed">Danh sách lộ trình hiện tại chưa có combo đang tồn tại cho lựa chọn này. Bạn thử mood khác hoặc xem toàn bộ combo nhé.</p>
            </div>
        `;
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    const randomCombo = matchedCombos[Math.floor(Math.random() * matchedCombos.length)];
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
    const filtered = getVisibleCombos().filter(c => {
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
    const combo = getVisibleCombos().find(c => c.id === id);
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
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return `DP-${code}`;
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
    const blocksDuplicateVoucher = ['issued', 'used_pending_bill', 'reconciled', 'settled'].includes(leadStatus);
    const isActiveVoucher = blocksDuplicateVoucher && (!expiresAt || leadStatus !== 'issued' || expiresAt >= now);

    return hasMatchingContact && hasMatchingCombo && isActiveVoucher;
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

function getIssuedVoucherValueForPartner(partnerName, partnerPackage) {
    if (!Array.isArray(window.cloudLeads)) return 0;
    const normalizedPackage = normalizePartnerPackage(partnerPackage);
    const budgetBlockingStatuses = new Set([
        LEAD_STATUSES.ISSUED,
        LEAD_STATUSES.USED_PENDING_BILL,
        LEAD_STATUSES.RECONCILED,
        LEAD_STATUSES.SETTLED
    ]);

    return window.cloudLeads.reduce((sum, lead) => {
        if ((lead.partner || '') !== partnerName) return sum;
        if (getLeadPartnerPackage(lead) !== normalizedPackage) return sum;
        if (!budgetBlockingStatuses.has(getEffectiveLeadStatus(lead))) return sum;
        return sum + getLeadVoucherValue(lead);
    }, 0);
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
        `code=${leadData.voucherCode || leadData.code || ''}`,
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

    try {
        const payload = buildVoucherQRPayload(leadData, selectedCombo);
        qrContainer.innerHTML = '';
        qrContainer.setAttribute('aria-label', `QR voucher ${leadData?.voucherCode || leadData?.code || ''}`);
        qrContainer.title = payload;

        if (!window.QRCode) {
            const fallback = document.createElement('div');
            fallback.className = 'text-center leading-relaxed break-all max-w-[220px]';
            fallback.textContent = leadData?.voucherCode || leadData?.code || payload;
            qrContainer.appendChild(fallback);
            return;
        }

        new window.QRCode(qrContainer, {
            text: payload,
            width: 176,
            height: 176,
            colorDark: '#050505',
            colorLight: '#ffffff',
            correctLevel: window.QRCode.CorrectLevel?.M
        });
    } catch (error) {
        console.error('Loi render QR voucher:', error);
        qrContainer.innerHTML = '';
        const fallback = document.createElement('div');
        fallback.className = 'text-center leading-relaxed break-all max-w-[220px]';
        fallback.textContent = leadData?.voucherCode || leadData?.code || 'QR chưa sẵn sàng';
        qrContainer.appendChild(fallback);
    }
}

function showVoucherSuccessModal(leadData, selectedCombo, message = '') {
    document.getElementById('success-user-name').innerText = leadData.name || 'bạn';
    document.getElementById('success-combo-title').innerText = leadData.combo || selectedCombo.title;
    document.getElementById('success-voucher-code').innerText = leadData.voucherCode || leadData.code || '';
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

    const nameInput = document.getElementById('lead-name');
    const phoneInput = document.getElementById('lead-phone');
    const emailInput = document.getElementById('lead-email');
    const consentInput = document.getElementById('lead-consent');
    const comboIdInput = document.getElementById('lead-combo-id');
    const comboTitleInput = document.getElementById('lead-combo-title');
    const currentSubmitButton = document.getElementById('lead-submit-btn');
    const previousSubmitHtml = currentSubmitButton?.innerHTML || '<i class="fa-solid fa-ticket mr-2"></i>Nhận mã voucher';

    if (!nameInput || !phoneInput || !emailInput || !consentInput || !comboIdInput) {
        alert("Form nhận voucher chưa sẵn sàng. Vui lòng tải lại trang và thử lại.");
        return;
    }

    const name = getSafeLeadName(nameInput.value);
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim().toLowerCase().slice(0, 120);
    const hasConsent = consentInput.checked;
    const comboTitle = comboTitleInput?.value || '';
    const comboId = Number(comboIdInput.value);

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

    const selectedCombo = getVisibleCombos().find(c => c.id === comboId);
    if (!selectedCombo) {
        alert("Không tìm thấy combo để tạo voucher. Bạn vui lòng mở lại chi tiết lộ trình và thử lại.");
        return;
    }

    isSubmittingLead = true;
    setLeadSubmitLoading(true);

    try {
        const normalizedEmail = normalizeLeadEmail(email);
        const normalizedPhone = normalizeLeadPhone(phone);
        const activeLeads = Array.isArray(window.cloudLeads) ? window.cloudLeads : [];
        const now = new Date();
        const duplicateLead = activeLeads.find((lead) => isDuplicateActiveLead(
            lead,
            normalizedEmail,
            normalizedPhone,
            selectedCombo,
            comboTitle,
            now.getTime()
        ));

        if (duplicateLead) {
            showVoucherSuccessModal(
                duplicateLead,
                selectedCombo,
                "Bạn đã nhận voucher này rồi. Mình hiển thị lại mã cũ để tránh gửi email trùng nhé."
            );
            resetLeadFormAfterSubmit();
            return;
        }

        const expiresAt = now.getTime() + (VOUCHER_VALID_DAYS * DAY_IN_MS);
        const partnerPackage = getComboPartnerPackage(selectedCombo);
        const packageConfig = getPartnerPackageConfig(partnerPackage);
        const voucherCode = generateVoucherCode();
        const voucherValue = getVoucherValueFromCombo(selectedCombo);
        const issuedVoucherValue = getIssuedVoucherValueForPartner(selectedCombo.partner, partnerPackage);
        if (issuedVoucherValue + voucherValue > packageConfig.voucherBudget) {
            alert("Voucher budget của đối tác đã hết. Bạn vẫn có thể xem/lưu/share combo nhưng chưa thể lấy thêm voucher.");
            return;
        }

        const issuedAt = formatLeadDateTime(now.getTime());

        const leadData = {
            name,
            phone,
            email: normalizedEmail,
            combo: selectedCombo.title || comboTitle,
            comboId: selectedCombo.id,
            partner: selectedCombo.partner,
            partnerPackage,
            voucherCode,
            voucherValue,
            date: now.toLocaleDateString('vi-VN'),
            timestamp: now.getTime(),
            expiresAt,
            expiresAtText: formatLeadDateTime(expiresAt),
            issuedAt,
            usedAt: '',
            billAmount: 0,
            invoiceCode: '',
            cpsRate: packageConfig.cpsRate,
            cpsCommission: 0,
            netReimbursement: 0,
            receivableDifference: 0,
            reconciledAt: '',
            settledAt: '',
            consent: true,
            consentText: "Đồng ý lưu thông tin để gửi E-Voucher và đối soát ưu đãi trong phạm vi demo/pilot",
            consentAt: now.getTime(),
            status: 'issued'
        };

        try {
            await addDoc(leadsCollection, leadData);
            console.log("Đã tạo voucher và đồng bộ lead lên Firebase.");
        } catch (firebaseError) {
            console.error("Lỗi Firebase khi tạo voucher:", firebaseError);
            alert("Lỗi kết nối Đám mây. Voucher chưa được tạo, vui lòng thử lại!");
            return;
        }

        showVoucherSuccessModal(leadData, selectedCombo);
        resetLeadFormAfterSubmit();

        try {
            const emailResult = await sendVoucherEmail(leadData, selectedCombo);
            console.log("Email voucher da duoc gui qua EmailJS:", emailResult);
        } catch (emailError) {
            console.error("Loi khi gui email voucher qua EmailJS:", {
                status: emailError?.status,
                text: emailError?.text,
                message: emailError?.message
            });
            alert("Voucher đã tạo nhưng email có thể chưa gửi. Bạn hãy chụp lại mã voucher.");
        }
    } catch (error) {
        console.error("Lỗi không mong muốn trong submitLead:", error);
        alert("Có lỗi khi tạo voucher. Vui lòng thử lại!");
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
        window.renderComboCms?.();
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

function renderFinanceBreakdown(summary) {
    const revenueElement = document.getElementById('stat-revenue');
    if (!revenueElement) return;

    let breakdown = document.getElementById('admin-finance-breakdown');
    if (!breakdown) {
        const metricGrid = revenueElement.closest('.grid');
        if (!metricGrid) return;
        const settledRateCard = document.getElementById('stat-settled-rate') ? '' : `
                <div class="bg-[#0f0f13] border border-white/5 p-5 rounded-2xl"><p class="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">Tỷ lệ settled/issued</p><h4 id="stat-settled-rate" class="text-2xl font-black text-white">0%</h4></div>`;
        metricGrid.insertAdjacentHTML('afterend', `
            <div id="admin-finance-breakdown" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
                ${settledRateCard}
                <div class="bg-[#0f0f13] border border-white/5 p-5 rounded-2xl"><p class="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">Voucher reconciled</p><h4 id="stat-reconciled" class="text-2xl font-black text-white">0</h4></div>
                <div class="bg-[#0f0f13] border border-white/5 p-5 rounded-2xl"><p class="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">Voucher settled</p><h4 id="stat-settled" class="text-2xl font-black text-white">0</h4></div>
                <div class="bg-[#0f0f13] border border-white/5 p-5 rounded-2xl"><p class="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">Tổng bill đối soát</p><h4 id="stat-total-bill" class="text-2xl font-black text-white">0đ</h4></div>
                <div class="bg-[#0f0f13] border border-white/5 p-5 rounded-2xl"><p class="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">CPS commission settled</p><h4 id="stat-cps-commission" class="text-2xl font-black text-orange-300">0đ</h4><span id="stat-cps-settled" class="sr-only">0đ</span></div>
                <div class="bg-[#0f0f13] border border-white/5 p-5 rounded-2xl"><p class="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">Tổng platform fee</p><h4 id="stat-platform-fee" class="text-2xl font-black text-white">0đ</h4></div>
                <div class="bg-[#0f0f13] border border-white/5 p-5 rounded-2xl"><p class="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">Hoàn cho quán</p><h4 id="stat-reimbursement" class="text-2xl font-black text-green-300">0đ</h4></div>
                <div class="bg-[#0f0f13] border border-white/5 p-5 rounded-2xl"><p class="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">Chênh lệch cần thu</p><h4 id="stat-receivable" class="text-2xl font-black text-red-300">0đ</h4></div>
                <div class="bg-[#0f0f13] border border-white/5 p-5 rounded-2xl"><p class="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">Ghi chú</p><p class="text-xs text-gray-400 leading-relaxed">Doanh thu chỉ được ghi nhận khi voucher đã sử dụng, có bill đối soát và trạng thái settled.</p></div>
            </div>
        `);
        breakdown = document.getElementById('admin-finance-breakdown');
    }

    setTextById('stat-reconciled', summary.statusCounts.reconciled || 0);
    setTextById('stat-settled', summary.statusCounts.settled || 0);
    setTextById('stat-settled-rate', `${summary.settledRate.toFixed(1)}%`);
    setTextById('stat-total-bill', formatVND(summary.totalReconciledBill));
    setTextById('stat-cps-settled', formatVND(summary.totalSettledCpsCommission));
    setTextById('stat-cps-commission', formatVND(summary.totalSettledCpsCommission));
    setTextById('stat-platform-fee', formatVND(summary.totalPlatformFee));
    setTextById('stat-reimbursement', formatVND(summary.totalReimbursement));
    setTextById('stat-receivable', formatVND(summary.totalReceivableDifference));
    ensureComboCmsSection();
    window.renderCmsStats?.();
}

function ensureComboCmsSection() {
    if (document.getElementById('combo-cms-section')) return;
    const adminContainer = document.querySelector('#admin-view .max-w-7xl');
    if (!adminContainer) return;
    const financeBreakdown = document.getElementById('admin-finance-breakdown');
    const anchor = financeBreakdown || adminContainer.querySelector('.grid');
    if (!anchor) return;

    anchor.insertAdjacentHTML('afterend', `
        <section id="combo-cms-section" class="bg-[#0f0f13] border border-white/5 rounded-3xl p-6 md:p-8 shadow-xl mb-10">
            <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 mb-6">
                <div>
                    <p class="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Mini Admin CMS</p>
                    <h3 class="text-2xl font-black text-white">Quan ly Combo</h3>
                    <p class="text-sm text-gray-400 mt-2 max-w-2xl">Quan tri combo noi bo MVP. Ban thuong mai can Firebase Auth, Security Rules va phan quyen admin/partner.</p>
                </div>
                <div class="flex flex-wrap gap-3">
                    <button onclick="window.resetComboForm()" class="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition"><i class="fa-solid fa-plus mr-2"></i>Them combo moi</button>
                    <button onclick="window.seedDefaultCombosToFirestore()" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition"><i class="fa-solid fa-cloud-arrow-up mr-2"></i>Dong bo combo mau</button>
                    <button onclick="window.exportCombosToCSV()" class="bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition"><i class="fa-solid fa-file-csv mr-2"></i>Xuat CSV combo</button>
                </div>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="bg-black/30 border border-white/5 rounded-2xl p-4"><p class="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Dang hoat dong</p><h4 id="stat-combo-active" class="text-2xl font-black text-white">0</h4></div>
                <div class="bg-black/30 border border-white/5 rounded-2xl p-4"><p class="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Da an</p><h4 id="stat-combo-hidden" class="text-2xl font-black text-orange-300">0</h4></div>
                <div class="bg-black/30 border border-white/5 rounded-2xl p-4"><p class="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Xoa mem</p><h4 id="stat-combo-deleted" class="text-2xl font-black text-red-300">0</h4></div>
                <div class="bg-black/30 border border-white/5 rounded-2xl p-4"><p class="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Doi tac active</p><h4 id="stat-active-partners" class="text-2xl font-black text-green-300">0</h4></div>
            </div>
            <form id="combo-cms-form" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-6 bg-black/25 border border-white/5 rounded-2xl p-4" onsubmit="window.saveComboFromCms(event)">
                <input type="hidden" id="cms-combo-id">
                <input id="cms-title" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500" placeholder="Ten combo">
                <input id="cms-partner" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500" placeholder="Doi tac">
                <select id="cms-partner-package" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500">
                    <option value="Basic">Basic</option><option value="Growth">Growth</option><option value="Premium">Premium</option>
                </select>
                <input id="cms-price" type="number" min="0" step="1000" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500" placeholder="Gia tham khao">
                <input id="cms-discount" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500" placeholder="Uu dai: 15%, 30K">
                <input id="cms-district" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500" placeholder="Quan/khu vuc">
                <select id="cms-category" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500">
                    <option value="low">low</option><option value="mid">mid</option><option value="high">high</option>
                </select>
                <select id="cms-target" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500">
                    <option value="couple">couple</option><option value="group">group</option><option value="both">both</option>
                </select>
                <input id="cms-bookings" type="number" min="0" step="1" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500" placeholder="Bookings">
                <input id="cms-icon" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500" placeholder="Icon FontAwesome">
                <input id="cms-img" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500 md:col-span-2" placeholder="Anh URL">
                <input id="cms-address" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500 md:col-span-2" placeholder="Dia chi">
                <textarea id="cms-desc" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500 md:col-span-2" rows="3" placeholder="Mo ta ngan"></textarea>
                <textarea id="cms-itinerary" class="bg-[#050505] border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-rose-500 md:col-span-2" rows="3" placeholder="Itinerary: 19:00 | Hoat dong | Dia diem"></textarea>
                <div class="md:col-span-2 xl:col-span-4 flex flex-wrap items-center gap-3">
                    <button type="submit" class="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition"><i class="fa-solid fa-floppy-disk mr-2"></i>Luu combo</button>
                    <button type="button" onclick="window.resetComboForm()" class="bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 px-5 py-2.5 rounded-xl text-sm font-bold transition">Lam moi form</button>
                    <p id="combo-cms-message" class="text-sm text-green-300 font-bold hidden">Da luu combo</p>
                </div>
            </form>
            <div class="overflow-auto custom-scrollbar border border-white/5 rounded-2xl">
                <table class="w-full text-left text-sm whitespace-nowrap">
                    <thead class="bg-[#111115] sticky top-0 text-gray-400 border-b border-gray-800 z-10">
                        <tr>
                            <th class="px-4 py-4 text-[10px] uppercase tracking-widest">ID / Combo</th>
                            <th class="px-4 py-4 text-[10px] uppercase tracking-widest">Doi tac / Goi</th>
                            <th class="px-4 py-4 text-[10px] uppercase tracking-widest">Gia / Uu dai</th>
                            <th class="px-4 py-4 text-[10px] uppercase tracking-widest">Status</th>
                            <th class="px-4 py-4 text-[10px] uppercase tracking-widest text-rose-400">Thao tac</th>
                        </tr>
                    </thead>
                    <tbody id="combo-cms-table-body" class="divide-y divide-gray-800/50"></tbody>
                </table>
            </div>
        </section>
    `);
}

window.renderCmsStats = function() {
    const allCombos = getAllCombos();
    const activeCombos = allCombos.filter(combo => combo.isActive !== false && combo.isDeleted !== true);
    const hiddenCombos = allCombos.filter(combo => combo.isActive === false && combo.isDeleted !== true);
    const deletedCombos = allCombos.filter(combo => combo.isDeleted === true);
    const activePartners = new Set(activeCombos.map(combo => combo.partner).filter(Boolean));

    setTextById('stat-combo-active', activeCombos.length);
    setTextById('stat-combo-hidden', hiddenCombos.length);
    setTextById('stat-combo-deleted', deletedCombos.length);
    setTextById('stat-active-partners', activePartners.size);
};

window.renderComboCms = function() {
    ensureComboCmsSection();
    window.renderCmsStats();
    const tbody = document.getElementById('combo-cms-table-body');
    if (!tbody) return;

    const sortedCombos = [...getAllCombos()].sort((a, b) => Number(a.id) - Number(b.id));
    tbody.innerHTML = sortedCombos.map(combo => {
        const comboIdForJs = JSON.stringify(combo.id);
        const isDeleted = combo.isDeleted === true;
        const isActive = combo.isActive !== false && !isDeleted;
        const voucherValue = getVoucherValueFromCombo(combo);

        return `
            <tr class="hover:bg-white/5 transition">
                <td class="px-4 py-4">
                    <div class="text-gray-500 text-xs font-mono">#${escapeHTML(combo.id)}</div>
                    <div class="text-white font-black">${escapeHTML(combo.title || 'Combo chua dat ten')}</div>
                    <div class="text-gray-500 text-xs truncate max-w-[260px]">${escapeHTML(combo.address || '-')}</div>
                </td>
                <td class="px-4 py-4">
                    <div class="text-gray-200 font-bold">${escapeHTML(combo.partner || '-')}</div>
                    <div class="text-gray-500 text-xs">${escapeHTML(combo.partnerPackage || 'Basic')}</div>
                </td>
                <td class="px-4 py-4">
                    <div class="text-white font-black">${formatVND(combo.price)}</div>
                    <div class="text-orange-300 text-xs font-bold">${escapeHTML(combo.discount || '-')} / voucher ${formatVND(voucherValue)}</div>
                </td>
                <td class="px-4 py-4">
                    <span class="${isDeleted ? 'bg-red-500/20 text-red-300 border-red-500/30' : isActive ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-orange-500/20 text-orange-300 border-orange-500/30'} border px-2 py-1 rounded text-[10px] font-bold uppercase">${isDeleted ? 'Deleted' : isActive ? 'Active' : 'Hidden'}</span>
                    <div class="text-gray-500 text-[10px] mt-1">${escapeHTML(combo.updatedAt || '-')}</div>
                </td>
                <td class="px-4 py-4">
                    <div class="flex flex-wrap gap-2">
                        <button onclick='window.editComboInCms(${comboIdForJs})' class="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded font-bold">Sua</button>
                        <button onclick='window.toggleComboActive(${comboIdForJs})' ${isDeleted ? 'disabled' : ''} class="text-xs bg-white/5 hover:bg-white/10 disabled:opacity-40 text-gray-100 border border-white/10 px-3 py-1.5 rounded font-bold">${isActive ? 'An' : 'Hien'}</button>
                        <button onclick='window.softDeleteCombo(${comboIdForJs})' ${isDeleted ? 'disabled' : ''} class="text-xs bg-red-500/20 hover:bg-red-500/30 disabled:opacity-40 text-red-200 border border-red-500/30 px-3 py-1.5 rounded font-bold">Xoa mem</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
};

window.resetComboForm = function() {
    const form = document.getElementById('combo-cms-form');
    form?.reset();
    setTextById('cms-combo-id', '');
    const idInput = document.getElementById('cms-combo-id');
    if (idInput) idInput.value = '';
    setTextById('combo-cms-message', '');
    document.getElementById('combo-cms-message')?.classList.add('hidden');
};

window.editComboInCms = function(comboId) {
    const combo = getAllCombos().find(item => Number(item.id) === Number(comboId));
    if (!combo) return;

    const fields = {
        'cms-combo-id': combo.id,
        'cms-title': combo.title,
        'cms-desc': combo.desc,
        'cms-address': combo.address,
        'cms-district': combo.district,
        'cms-partner': combo.partner,
        'cms-partner-package': combo.partnerPackage,
        'cms-discount': combo.discount,
        'cms-price': combo.price,
        'cms-category': combo.category,
        'cms-target': combo.target,
        'cms-bookings': combo.bookings,
        'cms-img': combo.img,
        'cms-icon': combo.icon,
        'cms-itinerary': stringifyComboItinerary(combo)
    };

    Object.entries(fields).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.value = value ?? '';
    });
    document.getElementById('combo-cms-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.saveComboFromCms = async function(event) {
    event?.preventDefault();
    try {
        const comboData = getComboFormData();
        const validationError = validateComboData(comboData);
        if (validationError) {
            alert(validationError);
            return;
        }

        if (comboData.firebaseId || getAllCombos().some(combo => Number(combo.id) === Number(comboData.id))) {
            await window.updateCombo(comboData.id, comboData);
        } else {
            await window.createCombo(comboData);
        }

        const message = document.getElementById('combo-cms-message');
        if (message) {
            message.textContent = 'Da luu combo';
            message.classList.remove('hidden');
        }
        alert("Đã lưu combo");
        window.resetComboForm();
        window.renderComboCms();
    } catch (error) {
        console.error('Loi luu combo:', error);
        alert(error?.message || 'Khong the luu combo.');
    }
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
                l.voucherCode,
                l.invoiceCode,
                l.status,
                l.partnerPackage,
                l.comboId,
                l.combo,
                l.partner,
                l.discount
            ].map(value => String(value || '').toLowerCase()).join('|');

            return haystack.includes(voucherQuery);
        })
        : partnerLeads;

    const statusCounts = Object.values(LEAD_STATUSES).reduce((acc, status) => {
        acc[status] = 0;
        return acc;
    }, {});
    leads.forEach((lead) => {
        statusCounts[getEffectiveLeadStatus(lead)] = (statusCounts[getEffectiveLeadStatus(lead)] || 0) + 1;
    });

    const settledLeads = leads.filter((lead) => getEffectiveLeadStatus(lead) === 'settled');
    const reconciledOrSettledLeads = leads.filter((lead) => ['reconciled', 'settled'].includes(getEffectiveLeadStatus(lead)));
    const totalIssuedVouchers = leads.length;
    const settledRate = totalIssuedVouchers > 0 ? (statusCounts.settled / totalIssuedVouchers) * 100 : 0;
    const totalReconciledBill = reconciledOrSettledLeads.reduce((sum, lead) => sum + getLeadBillAmount(lead), 0);
    const totalSettledCpsCommission = settledLeads.reduce((sum, lead) => sum + getLeadFinancials(lead).cpsCommission, 0);
    const totalReimbursement = reconciledOrSettledLeads.reduce((sum, lead) => sum + getLeadFinancials(lead).netReimbursement, 0);
    const totalReceivableDifference = reconciledOrSettledLeads.reduce((sum, lead) => sum + getLeadFinancials(lead).receivableDifference, 0);
    const platformFeeByPartner = new Map();
    leads.forEach((lead) => {
        const partnerName = lead.partner || 'Đối tác khác';
        const partnerPackage = getLeadPartnerPackage(lead);
        const packageFee = getPartnerPackageConfig(partnerPackage).platformFee;
        if (!platformFeeByPartner.has(partnerName) || packageFee > platformFeeByPartner.get(partnerName)) {
            platformFeeByPartner.set(partnerName, packageFee);
        }
    });
    const totalPlatformFee = [...platformFeeByPartner.values()].reduce((sum, fee) => sum + fee, 0);
    const totalB2BRevenue = totalPlatformFee + totalSettledCpsCommission;

    setTextById('stat-leads', totalIssuedVouchers);
    setTextById('stat-issued', totalIssuedVouchers);
    setTextById('stat-vouchers', statusCounts.used_pending_bill || 0);
    setTextById('stat-used-pending', statusCounts.used_pending_bill || 0);
    setTextById('stat-conversion', `${settledRate.toFixed(1)}%`);
    setTextById('stat-settled-rate', `${settledRate.toFixed(1)}%`);
    setTextById('stat-revenue', formatVND(totalB2BRevenue));
    renderFinanceBreakdown({
        statusCounts,
        totalReconciledBill,
        totalSettledCpsCommission,
        totalPlatformFee,
        totalB2BRevenue,
        totalReimbursement,
        totalReceivableDifference,
        settledRate
    });

    tbody.innerHTML = '';
    if(leads.length === 0) {
        noDataMsg.classList.remove('hidden');
    } else {
        noDataMsg.classList.add('hidden');
        
        // Hiển thị mới nhất lên trên
        const sortedLeads = [...leads].sort((a,b) => toSafeNumber(b.timestamp, 0) - toSafeNumber(a.timestamp, 0));
        
        sortedLeads.forEach((lead, index) => {
            const partnerName = lead.partner || 'Đối tác khác';
            const status = getEffectiveLeadStatus(lead);
            const statusConfig = LEAD_STATUS_META[status] || LEAD_STATUS_META.issued;
            const isIssued = status === 'issued';
            const isUsedPendingBill = status === 'used_pending_bill';
            const isReconciled = status === 'reconciled';
            const isSettled = status === 'settled';
            const partnerPackage = getLeadPartnerPackage(lead);
            const financials = getLeadFinancials(lead);
            const safeDomId = `lead-${String(lead.firebaseId || index).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            const docIdForJs = JSON.stringify(lead.firebaseId || '');
            // UI che du lieu de giam rui ro khi demo/public screen; Firebase va CSV van giu du lieu goc.
            const maskedPhone = maskPhone(lead.phone);
            const maskedEmail = maskEmail(lead.email);
            const safeLeadName = escapeHTML(lead.name || 'Khách demo');
            const safeComboName = escapeHTML(lead.combo || 'Lộ trình DatePlanner');
            const safePartnerName = escapeHTML(partnerName);
            const safePartnerPackage = escapeHTML(partnerPackage);
            const safeVoucherCode = escapeHTML(getLeadVoucherCode(lead) || 'N/A');
            const statusTimestamp = getLeadStatusTimestamp(lead, status);
            const statusBadge = `
                <span class="${statusConfig.badgeClass} px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider inline-flex items-center">
                    <i class="fa-solid ${statusConfig.icon} mr-1"></i>${statusConfig.label}
                </span>
                ${statusTimestamp ? `<div class="text-gray-500 text-[10px] mt-1 font-medium">${escapeHTML(statusTimestamp)}</div>` : ''}
            `;
            const packageOptions = Object.keys(PARTNER_PACKAGES).map((packageName) => (
                `<option value="${packageName}" ${packageName === partnerPackage ? 'selected' : ''}>${packageName}</option>`
            )).join('');
            let actionBtn = '';

            if (isIssued) {
                actionBtn = `
                    <button onclick='window.confirmVoucher(${docIdForJs})' class="w-full text-xs bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded shadow-lg transition font-bold"><i class="fa-solid fa-qrcode mr-1"></i> Xác nhận đã dùng</button>
                    <button onclick='window.cancelVoucher(${docIdForJs})' class="mt-2 w-full text-xs bg-white/5 hover:bg-red-500/20 text-red-300 border border-red-500/30 px-3 py-1.5 rounded transition font-bold"><i class="fa-solid fa-ban mr-1"></i> Cancelled</button>
                    <button onclick='window.markVoucherExpired(${docIdForJs})' class="mt-2 w-full text-xs bg-gray-500/20 hover:bg-gray-500/30 text-gray-200 border border-gray-500/30 px-3 py-1.5 rounded transition font-bold"><i class="fa-solid fa-hourglass-end mr-1"></i> Expired</button>
                `;
            } else if (isUsedPendingBill) {
                actionBtn = `
                    <div class="space-y-2 min-w-[220px]">
                        <input id="${safeDomId}-invoice" type="text" maxlength="40" placeholder="Mã hóa đơn" class="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500">
                        <input id="${safeDomId}-bill" type="number" min="0" step="1000" placeholder="Tổng bill" class="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500">
                        <input id="${safeDomId}-voucher" type="number" min="0" step="1000" value="${financials.voucherValue}" placeholder="Giá trị voucher" class="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500">
                        <select id="${safeDomId}-package" class="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500">${packageOptions}</select>
                        <button onclick='window.reconcileVoucherFromRow(${docIdForJs}, "${safeDomId}")' class="w-full text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded transition font-bold"><i class="fa-solid fa-calculator mr-1"></i> Nhập bill đối soát</button>
                    </div>
                `;
            } else if (isReconciled) {
                actionBtn = `
                    <button onclick='window.settleVoucher(${docIdForJs})' class="w-full text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded shadow-lg transition font-bold"><i class="fa-solid fa-circle-check mr-1"></i> Xác nhận settled</button>
                    <button onclick='window.disputeVoucher(${docIdForJs})' class="mt-2 w-full text-xs bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-500/30 px-3 py-1.5 rounded transition font-bold"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Disputed</button>
                `;
            }

            if (isSettled) {
                actionBtn = `
                    <div class="space-y-2 min-w-[220px]">
                        <input id="${safeDomId}-invoice" type="text" maxlength="40" value="${escapeHTML(lead.invoiceCode || '')}" placeholder="Ma hoa don" class="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500">
                        <input id="${safeDomId}-bill" type="number" min="0" step="1000" value="${financials.billAmount || ''}" placeholder="Tong bill" class="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500">
                        <input id="${safeDomId}-voucher" type="number" min="0" step="1000" value="${financials.voucherValue}" placeholder="Gia tri voucher" class="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500">
                        <select id="${safeDomId}-package" class="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500">${packageOptions}</select>
                        <button onclick='window.reconcileVoucherFromRow(${docIdForJs}, "${safeDomId}")' class="w-full text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded transition font-bold">Sua bill settled</button>
                    </div>
                `;
            }

            tbody.innerHTML += `
                <tr class="hover:bg-white/5 transition border-b border-white/5">
                    <td class="px-6 py-4">
                        <div class="font-bold text-gray-200">${safeLeadName}</div>
                        <div class="text-gray-300 text-xs mt-1"><i class="fa-solid fa-phone mr-1 text-gray-500"></i> ${escapeHTML(maskedPhone)}</div>
                        <div class="text-gray-400 text-xs"><i class="fa-solid fa-envelope mr-1 text-gray-500"></i> ${escapeHTML(maskedEmail)}</div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full text-xs mb-2 inline-block truncate max-w-[200px] font-bold">${safeComboName}</span><br>
                        <span class="text-gray-400 text-xs font-medium"><i class="fa-solid fa-store mr-1 text-yellow-500"></i> ${safePartnerName}</span>
                        <div class="text-gray-500 text-xs mt-1 font-medium">Gói: <span class="text-gray-300">${safePartnerPackage}</span></div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="text-white font-black font-mono block mb-1 tracking-widest text-sm">${safeVoucherCode}</span>
                        <span class="text-gray-400 text-xs font-medium">${formatVND(financials.voucherValue)}</span>
                        <div class="mt-2">${statusBadge}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-gray-300 text-xs">Mã HĐ: <span class="text-white font-bold">${escapeHTML(lead.invoiceCode || '-')}</span></div>
                        <div class="text-rose-200 font-black mt-1">${formatVND(financials.billAmount)}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-gray-400 text-xs">${(financials.cpsRate * 100).toFixed(0)}%</div>
                        <div class="text-orange-300 font-black">${formatVND(financials.cpsCommission)}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-green-300 font-bold">${formatVND(financials.netReimbursement)}</div>
                        <div class="text-red-300 text-xs mt-1">Thu thêm: ${formatVND(financials.receivableDifference)}</div>
                    </td>
                    <td class="px-6 py-4 text-xs text-gray-400 leading-relaxed">
                        <div>Issued: ${escapeHTML(lead.issuedAt || '-')}</div>
                        <div>Used: ${escapeHTML(lead.usedAt || '-')}</div>
                        <div>Reconciled: ${escapeHTML(lead.reconciledAt || '-')}</div>
                        <div>Settled: ${escapeHTML(lead.settledAt || '-')}</div>
                    </td>
                    <td class="px-6 py-4">
                        ${actionBtn || '<span class="text-gray-600 text-xs font-bold">Không có thao tác</span>'}
                    </td>
                </tr>
            `;
        });
    }
};

window.confirmVoucherUsed = async function(docId) {
    const lead = window.cloudLeads.find(item => item.firebaseId === docId);
    if (lead && !['issued', 'used_pending_bill', 'reconciled'].includes(getEffectiveLeadStatus(lead))) {
        alert("Chỉ voucher status issued mới có thể chuyển sang used_pending_bill.");
        return;
    }

    if(confirm("Xác nhận khách hàng đã đến quán và sử dụng E-Voucher này?\nTrạng thái sẽ chuyển sang used_pending_bill và chưa ghi nhận doanh thu.")) {
        try {
            const leadRef = doc(db, "leads", docId);
            const nowText = formatLeadDateTime(Date.now());
            await updateDoc(leadRef, {
                status: 'used_pending_bill',
                statusUpdatedAt: Date.now(),
                usedAt: nowText
            });
        } catch(e) {
            console.error("Lỗi cập nhật: ", e);
            alert("Lỗi kết nối Đám mây!");
        }
    }
};

window.cancelVoucher = async function(docId) {
    const lead = window.cloudLeads.find(item => item.firebaseId === docId);
    if (lead && getEffectiveLeadStatus(lead) !== 'issued') {
        alert("Chỉ voucher status issued mới có thể chuyển sang cancelled.");
        return;
    }

    if(confirm("Huy/gan khong hop le voucher nay?\nVoucher cancelled se khong duoc tinh doanh thu.")) {
        try {
            const leadRef = doc(db, "leads", docId);
            await updateDoc(leadRef, {
                status: 'cancelled',
                statusUpdatedAt: Date.now(),
                cancelledAt: formatLeadDateTime(Date.now())
            });
        } catch(e) {
            console.error("Loi cap nhat cancelled: ", e);
            alert("Loi ket noi Dam may!");
        }
    }
};

window.markVoucherExpired = async function(docId) {
    const lead = window.cloudLeads.find(item => item.firebaseId === docId);
    if (lead && ['settled', 'cancelled', 'disputed'].includes(getEffectiveLeadStatus(lead))) {
        alert("Voucher settled/cancelled/disputed khong chuyen sang expired.");
        return;
    }

    if (!confirm("Danh dau voucher nay la expired? Voucher expired khong duoc tinh doanh thu CPS.")) return;

    try {
        const leadRef = doc(db, "leads", docId);
        await updateDoc(leadRef, {
            status: 'expired',
            expiredAt: getNowText(),
            statusUpdatedAt: Date.now()
        });
    } catch(e) {
        console.error("Loi cap nhat expired: ", e);
        alert("Loi ket noi Dam may!");
    }
};

window.confirmVoucher = window.confirmVoucherUsed;

window.reconcileBill = async function(docId, domId) {
    const invoiceCode = String(document.getElementById(`${domId}-invoice`)?.value || '').trim();
    const billAmount = toSafeNumber(document.getElementById(`${domId}-bill`)?.value, NaN);
    const voucherValue = toSafeNumber(document.getElementById(`${domId}-voucher`)?.value, DEFAULT_VOUCHER_VALUE);
    const partnerPackage = normalizePartnerPackage(document.getElementById(`${domId}-package`)?.value);

    if (!invoiceCode) {
        alert("Vui lòng nhập mã hóa đơn.");
        return;
    }
    if (!Number.isFinite(billAmount) || billAmount <= 0) {
        alert("Tổng bill đối soát phải lớn hơn 0.");
        return;
    }

    const lead = window.cloudLeads.find(item => item.firebaseId === docId);
    const currentStatus = lead ? getEffectiveLeadStatus(lead) : 'used_pending_bill';
    const isEditingSettled = currentStatus === 'settled';
    if (lead && !['used_pending_bill', 'settled'].includes(currentStatus)) {
        alert("Chỉ voucher used_pending_bill mới được nhập bill đối soát.");
        return;
    }

    const packageConfig = getPartnerPackageConfig(partnerPackage);
    if (isEditingSettled && !confirm("Giao dịch đã settled. Việc sửa sẽ ảnh hưởng báo cáo tài chính. Bạn chắc chắn muốn tiếp tục?")) {
        return;
    }

    const settlement = calculateCpsSettlement({
        billAmount,
        voucherValue,
        cpsRate: packageConfig.cpsRate
    });

    if (!confirm(`Xác nhận đối soát bill ${invoiceCode}?\nCPS commission: ${formatVND(settlement.cpsCommission)}\nHoàn cho quán: ${formatVND(settlement.netReimbursement)}\nChênh lệch cần thu: ${formatVND(settlement.receivableDifference)}`)) {
        return;
    }

    try {
        const leadRef = doc(db, "leads", docId);
        await updateDoc(leadRef, {
            partnerPackage,
            voucherValue,
            invoiceCode,
            billAmount,
            cpsRate: packageConfig.cpsRate,
            cpsCommission: settlement.cpsCommission,
            netReimbursement: settlement.netReimbursement,
            receivableDifference: settlement.receivableDifference,
            reconciledAt: isEditingSettled ? (lead.reconciledAt || getNowText()) : getNowText(),
            status: isEditingSettled ? 'settled' : 'reconciled',
            statusUpdatedAt: Date.now(),
            updatedAt: getNowText(),
            editedAfterSettlement: isEditingSettled ? true : false
        });
    } catch(e) {
        console.error("Lỗi nhập bill đối soát: ", e);
        alert("Lỗi kết nối Đám mây!");
    }
};

window.reconcileVoucherFromRow = window.reconcileBill;

window.markAsSettled = async function(docId) {
    const lead = window.cloudLeads.find(item => item.firebaseId === docId);
    if (lead && getEffectiveLeadStatus(lead) !== 'reconciled') {
        alert("Chỉ voucher reconciled mới có thể chuyển sang settled.");
        return;
    }

    if (!confirm("Xác nhận settled giao dịch này?\nSau bước này CPS commission mới được tính vào doanh thu B2B.")) return;

    try {
        const leadRef = doc(db, "leads", docId);
        await updateDoc(leadRef, {
            status: 'settled',
            settledAt: formatLeadDateTime(Date.now()),
            statusUpdatedAt: Date.now()
        });
    } catch(e) {
        console.error("Lỗi xác nhận settled: ", e);
        alert("Lỗi kết nối Đám mây!");
    }
};

window.settleVoucher = window.markAsSettled;

window.disputeVoucher = async function(docId) {
    const lead = window.cloudLeads.find(item => item.firebaseId === docId);
    if (lead && !['used_pending_bill', 'reconciled'].includes(getEffectiveLeadStatus(lead))) {
        alert("Chỉ voucher used_pending_bill hoặc reconciled mới có thể chuyển sang disputed.");
        return;
    }

    if (!confirm("Chuyển giao dịch này sang trạng thái disputed? Giao dịch disputed không được tính doanh thu.")) return;

    try {
        const leadRef = doc(db, "leads", docId);
        await updateDoc(leadRef, {
            status: 'disputed',
            disputedAt: formatLeadDateTime(Date.now()),
            statusUpdatedAt: Date.now()
        });
    } catch(e) {
        console.error("Lỗi cập nhật disputed: ", e);
        alert("Lỗi kết nối Đám mây!");
    }
};

window.clearDemoDataInternalOnly = async function() {
    alert("MVP khong cho xoa cung toan bo du lieu Firebase tu client. Hay dung cancelled/expired/disputed hoac xoa mem combo.");
    return;
    if (!confirm("Chức năng nội bộ: xóa toàn bộ dữ liệu demo trên Cloud. Tiếp tục?")) return;

    const typedText = prompt(`Nhập chính xác "${confirmText}" để xác nhận xóa dữ liệu demo:`);
    if (typedText !== confirmText) {
        alert("Đã hủy xóa dữ liệu demo.");
        return;
    }

    try {
        const querySnapshot = await getDocs(leadsCollection);
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
    let csvContent = "";
    csvContent += "Họ tên,Số điện thoại,Email,Combo,Đối tác,Gói đối tác,Mã voucher,Trạng thái,Giá trị voucher,Mã hóa đơn,Bill đối soát,CPS rate,CPS commission,Số tiền hoàn cho quán,Khoản chênh lệch cần thu,Ngày issued,Ngày used,Ngày reconciled,Ngày settled\n";

    leads.forEach(row => {
        const status = getEffectiveLeadStatus(row);
        const statusText = (LEAD_STATUS_META[status] || LEAD_STATUS_META.issued).csvLabel;
        const financials = getLeadFinancials(row);
        csvContent += [
            row.name,
            row.phone,
            row.email,
            row.combo,
            row.partner || 'Doi tac khac',
            getLeadPartnerPackage(row),
            getLeadVoucherCode(row),
            statusText,
            financials.voucherValue,
            row.invoiceCode || '',
            financials.billAmount,
            financials.cpsRate,
            financials.cpsCommission,
            financials.netReimbursement,
            financials.receivableDifference,
            row.issuedAt || row.date || formatLeadDateTime(row.timestamp),
            row.usedAt || '',
            row.reconciledAt || '',
            row.settledAt || ''
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

window.exportCombosToCSV = function() {
    const allCombos = getAllCombos();
    if (allCombos.length === 0) {
        alert('Chua co combo de xuat CSV.');
        return;
    }

    const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    let csvContent = "ID,Ten combo,Doi tac,Goi doi tac,Gia,Uu dai,Voucher value,Category,Target,District,Active,Deleted,UpdatedAt\n";
    allCombos.forEach(combo => {
        csvContent += [
            combo.id,
            combo.title,
            combo.partner,
            combo.partnerPackage,
            Math.round(Number(combo.price) || 0),
            combo.discount,
            getVoucherValueFromCombo(combo),
            combo.category,
            combo.target,
            combo.district,
            combo.isActive !== false,
            combo.isDeleted === true,
            combo.updatedAt || ''
        ].map(csvEscape).join(',') + '\n';
    });

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `DatePlanner_Combos_${Date.now()}.csv`;
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
window.addEventListener('DOMContentLoaded', async () => {
    applyLocalComboImages();

    if (window.emailjs) {
        window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
    } else {
        console.warn("EmailJS SDK chua san sang. Voucher van duoc tao, nhung email se khong gui duoc.");
    }

    await window.loadCombos();

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
            const activeCombos = getVisibleCombos();
            if (activeCombos.length === 0) return;
            const randomCombo = activeCombos[Math.floor(Math.random() * activeCombos.length)];
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
