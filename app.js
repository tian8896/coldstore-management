// ============================================================
// CONFIG
// ============================================================
const SK = 'csm_warehouse1';
const LOCAL_STORAGE_KEY = 'csm_records_v3';

// Firebase 配置
var firebaseConfig = {
  apiKey: 'AIzaSyDOdn2Vzv3EvW_EbtGFp8mzhXLfjlVsN24',
  authDomain: 'superharves-cold-store.firebaseapp.com',
  databaseURL: 'https://superharves-cold-store-default-rtdb.firebaseio.com',
  projectId: 'superharves-cold-store',
  storageBucket: 'superharves-cold-store.firebasestorage.app',
  messagingSenderId: '379038228954',
  appId: '1:379038228954:web:e64fa3be3f2f49b3aae0e3'
};
var dbRef = null;
var purchaseRef = null;

// 冷库费率（可配置，默认值）
// 冷库1: 38 AED/托盘/周 + 5% VAT
// 冷库2/3/4: 60 AED/托盘/周 + 5% VAT
const VAT_RATE = 0.05;
const DAYS_PER_WEEK = 7;
const RATES_KEY = 'csm_warehouse_rates';

// 默认费率
var warehouseRates = {
  1: 38,
  2: 60,
  3: 60,
  4: 60
};

// 从localStorage加载费率
function loadRates() {
  try {
    var stored = localStorage.getItem(RATES_KEY);
    if (stored) {
      warehouseRates = JSON.parse(stored);
    }
  } catch(e) {
    console.log('Failed to load rates, using defaults');
  }
}

// 保存费率到localStorage
function saveRatesToStorage() {
  try {
    localStorage.setItem(RATES_KEY, JSON.stringify(warehouseRates));
  } catch(e) {
    console.error('Failed to save rates');
  }
}

// 根据冷库获取费率
function getRateByStore(store) {
  return warehouseRates[store] || 38;
}

// 保存费率设置
function saveRates() {
  warehouseRates[1] = parseFloat(gid('rate-store1').value) || 38;
  warehouseRates[2] = parseFloat(gid('rate-store2').value) || 60;
  warehouseRates[3] = parseFloat(gid('rate-store3').value) || 60;
  warehouseRates[4] = parseFloat(gid('rate-store4').value) || 60;
  saveRatesToStorage();
  clSettings();
  renderAll();
  toast('✅ 费率已保存', 'ok');
}

// 在设置面板中显示当前费率
function loadRatesToSettings() {
  gid('rate-store1').value = warehouseRates[1];
  gid('rate-store2').value = warehouseRates[2];
  gid('rate-store3').value = warehouseRates[3];
  gid('rate-store4').value = warehouseRates[4];
}

// ============================================================
// STATE
// ============================================================
var recs = [];
var currentColdStore = 1;
var currentUser = null;
var isAdmin = false;
var isLogistics = false;

var USERS_KEY = 'csm_users_v2';

// ============================================================
// INIT
// ============================================================
window.addEventListener('load', function() {
  initFirebase();
  setDefTimes();
  loadSettings();
});

function initFirebase() {
  // 加载 Firebase SDK
  var s1 = document.createElement('script');
  s1.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js';
  s1.onload = function() {
    var s2 = document.createElement('script');
    s2.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js';
    s2.onload = function() {
      initApp();
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

function initApp() {
  // 加载保存的费率
  loadRates();
  
  try {
    firebase.initializeApp(firebaseConfig);
    dbRef = firebase.database().ref(SK);
    purchaseRef = firebase.database().ref('csm_purchase');
    
    // 监听数据变化
    dbRef.on('value', function(snap) {
      var data = snap.val() || {};
      recs = Object.keys(data).map(function(k) {
        data[k].id = k;
        return data[k];
      });
      renderAll();
    });
    
    // 监听采购数据
    purchaseRef.on('value', function(snap) {
      purchaseRecs = [];
      var data = snap.val() || {};
      Object.keys(data).forEach(function(k) {
        var item = data[k];
        item.id = k;
        purchaseRecs.push(item);
      });
      renderPurchase();
    });
    
    toast('✅ Firebase 连接成功', 'ok');
    
    // 初始化默认账号
    initDefaultUsers();
    
    // 显示登录弹窗
    showLoginModal();
  } catch(e) {
    console.error('Firebase init error:', e);
    toast('❌ Firebase 连接失败: ' + e.message, 'err');
  }
}

// 初始化默认账号
function initDefaultUsers() {
  var users = getUsers();
  if (Object.keys(users).length === 0) {
    users = {
      'admin': { password: 'admin123', role: 'admin', name: '管理员' }
    };
    saveUsers(users);
  }
}

// 显示登录弹窗
function showLoginModal() {
  gid('loginModal').classList.add('sh');
  gid('login-username').value = '';
  gid('login-password').value = '';
  gid('login-error').style.display = 'none';
}

// 登录处理
function doLogin() {
  var username = (gid('login-username').value || '').trim();
  var password = (gid('login-password').value || '').trim();
  
  if (!username || !password) {
    gid('login-error').textContent = '请输入用户名和密码';
    gid('login-error').style.display = 'block';
    return;
  }
  
  var users = getUsers();
  var user = users[username];
  
  if (!user || user.password !== password) {
    gid('login-error').textContent = '用户名或密码错误';
    gid('login-error').style.display = 'block';
    return;
  }
  
  currentUser = username;
  isAdmin = user.role === 'admin';
  isLogistics = user.role === 'customs';
  
  gid('loginModal').classList.remove('sh');
  
  if (isLogistics) {
    showLogisticsView();
  } else {
    showAdminView();
  }
  
  var roleText = isAdmin ? '管理员' : '清关公司';
  toast('✅ 欢迎 ' + (user.name || username) + '（' + roleText + '）', 'ok');
}

// 显示管理员视图
function showAdminView() {
  gid('logisticsView').style.display = 'none';
  document.querySelectorAll('.right')[1].style.display = 'block';
  gid('userInfo').style.display = 'flex';
  updateSettingsButton();
  renderPurchase();
}

// 显示清关公司视图
function showLogisticsView() {
  document.querySelectorAll('.right')[1].style.display = 'none';
  gid('logisticsView').style.display = 'block';
  gid('userInfo').style.display = 'none';
  document.querySelector('header h1').textContent = '物流公司系统 / Logistics System';
  gid('logisticsUserName').textContent = getUsers()[currentUser].name || currentUser;
  updateSettingsButton();
  renderLogisticsTable();
}

// 更新设置按钮显示状态
function updateSettingsButton() {
  var settingsBtn = document.querySelector('button[onclick="openSettings()"]');
  if (settingsBtn) {
    settingsBtn.style.display = isAdmin ? 'inline-block' : 'none';
  }
}

// 退出登录
function handleLogout() {
  currentUser = null;
  isAdmin = false;
  isLogistics = false;
  document.querySelector('header h1').textContent = '迪拜大丰收冷库管理系统 - Warehouse 1';
  document.querySelector('header p').textContent = '';
  showLoginModal();
}

// ============================================================
// UTILS
// ============================================================
function gid(id) { return document.getElementById(id); }

function pad2(n) { return String(n).padStart(2, '0'); }

function nowFmt() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
}

function setDefTimes() {
  var v = nowFmt();
  if (gid('f-at')) gid('f-at').value = v;
  if (gid('f-dt')) gid('f-dt').value = v;
}

function fdt(iso) {
  if (!iso) return '-';
  var d = new Date(iso);
  return pad2(d.getDate()) + '/' + pad2(d.getMonth()+1) + '/' + d.getFullYear();
}

function toast(msg, type) {
  var t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.remove(); }, 3000);
}

// ============================================================
// CHECK IN
// ============================================================
function checkIn() {
  console.log('checkIn called, isCheckingIn:', isCheckingIn);
  if (isCheckingIn) {
    console.log('Already checking in, ignoring');
    return;
  }
  isCheckingIn = true;
  var cn = (gid('f-cn').value || '').trim().toUpperCase();
  var supplier = (gid('f-supplier').value || '').trim();
  var product = (gid('f-product').value || '').trim();
  var pallets = parseInt(gid('f-pallets').value) || 1;
  var items = parseInt(gid('f-items').value) || 1;
  var at = gid('f-at').value;

  console.log('checkIn values:', {cn: cn, supplier: supplier, product: product, pallets: pallets, items: items, at: at});

  if (!cn || cn.length < 2) { toast('请输入有效的集装箱号码 (至少2个字符)', 'err'); console.log('validation failed: cn, length:', cn ? cn.length : 0); return; }
  if (!product) { toast('请输入品名', 'err'); console.log('validation failed: product'); return; }
  if (!at) { toast('请输入入库日期', 'err'); console.log('validation failed: at'); return; }

  console.log('validation passed, checking exists...');

  // 检查是否已存在
  var exists = recs.some(function(r) { 
    return r.cn === cn && !r.dep && r.store === currentColdStore && !r.type; 
  });
  if (exists) {
    toast('集装箱 ' + cn + ' 已在冷库 ' + currentColdStore, 'err');
    return;
  }

  var id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  var rec = {
    id: id,
    cn: cn,
    supplier: supplier,
    product: product,
    pallets: pallets,
    items: items,
    store: currentColdStore,
    arr: new Date(at).toISOString(),
    dep: null,
    pallets_out: 0,
    items_out: 0
  };

  // 保存到 Firebase
  if (dbRef) {
    dbRef.child(id).set(rec).then(function() {
      console.log('Check-in saved:', id);
      // Firebase 监听器会自动更新 recs，不需要手动 push
      isCheckingIn = false;
      // 改变按钮状态为已入库
      var btn = gid('checkInBtn');
      console.log('Changing button status, btn:', btn);
      if (btn) {
        btn.classList.remove('btn-s');
        btn.classList.add('btn-g');
        btn.innerHTML = '✓ 已入库 Checked In';
        btn.disabled = true;
        console.log('Button changed to green');
      } else {
        console.log('Button not found!');
      }
      toast('✅ 入库成功: ' + cn, 'ok');
      // 清空表单
      gid('f-cn').value = '';
      gid('f-supplier').value = '';
      gid('f-product').value = '';
      gid('f-pallets').value = '1';
      gid('f-items').value = '1';
    }).catch(function(e) {
      console.error('Check-in error:', e);
      toast('入库失败: ' + e.message, 'err');
      isCheckingIn = false;
    });
  } else {
    console.error('dbRef is null');
    toast('数据库未连接', 'err');
    isCheckingIn = false;
  }
}

// ============================================================
// CHECK OUT
// ============================================================
function checkOut() {
  var cn = (gid('f-cno').value || '').trim().toUpperCase();
  var pallets_out = parseInt(gid('f-pallets-out').value) || 1;
  var items_out = parseInt(gid('f-items-out').value) || 1;
  var dt = gid('f-dt').value;

  if (!cn || cn.length < 4) { toast('请输入集装箱号码', 'err'); return; }
  if (!dt) { toast('请输入出库日期', 'err'); return; }

  // 找到入库记录
  var rec = recs.find(function(r) { 
    return r.cn === cn && !r.dep && !r.type; 
  });
  if (!rec) { 
    toast('未找到在库记录: ' + cn, 'err'); 
    return; 
  }

  var remaining_pallets = rec.pallets - (rec.pallets_out || 0);
  var remaining_items = rec.items - (rec.items_out || 0);

  if (pallets_out > remaining_pallets) {
    toast('出库托盘数超过剩余数量', 'err');
    return;
  }
  if (items_out > remaining_items) {
    toast('出库件数超过剩余数量', 'err');
    return;
  }

  // 创建新的出库记录
  var outId = 'out_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  var outRec = {
    id: outId,
    type: 'checkout',
    refId: rec.id,
    cn: cn,
    supplier: rec.supplier,
    product: rec.product,
    store: rec.store,
    pallets_out: pallets_out,
    items_out: items_out,
    inPallets: rec.pallets,
    inItems: rec.items,
    inDate: rec.arr,
    dep: new Date(dt).toISOString()
  };
  
  // 保存出库记录到 Firebase
  if (dbRef) {
    dbRef.child(outId).set(outRec);
  }

  // 更新原入库记录的出库数量
  rec.pallets_out = (rec.pallets_out || 0) + pallets_out;
  rec.items_out = (rec.items_out || 0) + items_out;

  // 如果全部出库，标记为已出库
  if (rec.pallets_out >= rec.pallets) {
    rec.dep = new Date(dt).toISOString();
  }
  
  // 更新 Firebase
  if (dbRef) {
    dbRef.child(rec.id).set(rec);
  }
  
  toast('✅ 出库成功: ' + cn + ' 托盘: ' + pallets_out + ' 件数: ' + items_out, 'ok');

  gid('f-cno').value = '';
  gid('f-pallets-out').value = '1';
  gid('f-items-out').value = '1';
}

// ============================================================
// SAVE & RENDER
// ============================================================
function saveData() {
  // Firebase 自动同步，这里只需要更新
  // 找到最后添加的记录
  var lastRec = recs[recs.length - 1];
  if (lastRec && lastRec.id && dbRef) {
    dbRef.child(lastRec.id).set(lastRec);
  }
}

function saveRecord(rec) {
  if (dbRef && rec.id) {
    dbRef.child(rec.id).set(rec);
  }
}

function deleteRecord(id) {
  if (dbRef && id) {
    dbRef.child(id).remove();
  }
}

function renderAll() {
  renderRecords();
  renderCheckout();
  updStats();
}

function renderRecords() {
  // 只显示入库记录
  var inRecs = recs.filter(function(r) { return r.store === currentColdStore && !r.type; })
    .sort(function(a, b) { return new Date(b.arr) - new Date(a.arr); });

  var tb = gid('tb-all');
  var es = gid('es-all');
  if (!tb || !es) return;

  if (inRecs.length === 0) {
    tb.innerHTML = ''; es.style.display = 'block'; return;
  }
  es.style.display = 'none';

  var html = inRecs.map(function(r) {
    var remaining_pallets = r.pallets - (r.pallets_out || 0);
    var remaining_items = r.items - (r.items_out || 0);
    
    // 计算已产生的实际费用（从出库记录表）
    var actualFee = calcActualFee(r);
    
    // 判断是否已全部出库
    var isFullyCheckedOut = remaining_pallets === 0 && r.dep;
    
    var status = r.dep ? '<span class="bdg bdg-d">已出库</span>' : '<span class="bdg bdg-a">在库</span>';
    
    // 管理员才显示修改按钮
    var editBtn = isAdmin ? '<button class="abtn" onclick="showEditRecord(\'' + r.id + '\')" style="margin-left:4px">✏️</button>' : '';
    
    // 费用显示逻辑：
    // 1. 在库（未出库或部分出库）：黄色背景显示预估费用
    // 2. 已全部出库：显示实际冷库费总和（关联出库记录）
    var feeDisplay;
    if (isFullyCheckedOut && actualFee > 0) {
      // 已全部出库，显示实际费用总和，蓝色加大加粗
      feeDisplay = '<strong style="color:#0066cc;font-size:16px">' + actualFee.toFixed(2) + ' AED</strong>';
    } else if (actualFee > 0) {
      // 部分出库，显示已产生的费用，黄色背景
      feeDisplay = '<strong style="color:#ff9900;background:#fff8e1;padding:2px 6px;border-radius:3px">' + actualFee.toFixed(2) + ' AED</strong>';
    } else {
      // 刚入库未出库，显示 "-"
      feeDisplay = '<span style="color:#999">-</span>';
    }
    
    return '<tr style="background:#fff">' +
      '<td><strong>' + r.cn + '</strong></td>' +
      '<td style="font-family:Arial;text-transform:capitalize">' + (r.supplier || '-') + '</td><td style="font-family:Arial;text-transform:capitalize">' + r.product + '</td>' +
      '<td>冷库 ' + r.store + '</td>' +
      '<td>' + r.pallets + ' / <span style="color:#ff9900">' + remaining_pallets + '</span></td>' +
      '<td>' + r.items + ' / <span style="color:#ff9900">' + remaining_items + '</span></td>' +
      '<td>' + fdt(r.arr) + '</td><td>' + fdt(r.dep) + '</td>' +
      '<td>' + feeDisplay + '</td>' +
      '<td>' + status + '</td>' +
      '<td><button class="abtn" onclick="showDet(\'' + r.id + '\')">详情</button>' + editBtn + '</td></tr>';
  });

  tb.innerHTML = html.join('');
}

// 计算已产生的实际费用（基于出库记录表的逻辑）
function calcActualFee(inRec) {
  // 获取该集装箱的所有出库记录
  var outRecs = recs.filter(function(r) { 
    return r.type === 'checkout' && r.cn === inRec.cn; 
  }).sort(function(a, b) { return new Date(a.dep) - new Date(b.dep); });
  
  if (outRecs.length === 0) return 0;
  
  var startDate = new Date(inRec.arr);
  var endDate = new Date(outRecs[outRecs.length - 1].dep);
  
  var totalFee = 0;
  var currentDate = new Date(startDate);
  var palletsAtWeekStart = inRec.pallets;
  
  while (currentDate < endDate) {
    var weekStart = new Date(currentDate);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    var actualEnd = weekEnd < endDate ? weekEnd : endDate;
    
    // 该周费用 = 托盘数 × 费率 × 1.05
    var rate = getRateByStore(inRec.store);
    var amount = palletsAtWeekStart > 0 ? (palletsAtWeekStart * rate) : 0;
    var vat = amount * VAT_RATE;
    var weeklyTotal = amount + vat;
    
    if (weeklyTotal > 0) {
      totalFee += weeklyTotal;
    }
    
    // 该周出库托盘数
    var weekOutPallets = 0;
    outRecs.forEach(function(or) {
      var od = new Date(or.dep);
      if (od >= weekStart && od <= weekEnd) {
        weekOutPallets += or.pallets_out;
      }
    });
    
    // 下周起始托盘数
    palletsAtWeekStart = Math.max(0, palletsAtWeekStart - weekOutPallets);
    
    // 如果托盘已全部出库，结束计算
    if (palletsAtWeekStart === 0) break;
    
    currentDate = new Date(weekEnd);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return totalFee;
}

function calcFee(r) {
  if (!r.arr) return 0;
  
  var start = new Date(r.arr);
  var end = r.dep ? new Date(r.dep) : new Date();
  var days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  
  if (days <= 0) return 0;
  
  var weeks = Math.ceil(days / 7);
  var totalPallets = r.pallets - (r.pallets_out || 0);
  var rate = getRateByStore(r.store);
  
  return weeks * totalPallets * rate * (1 + VAT_RATE);
}

function updStats() {
  // 只统计入库记录（排除出库记录类型）
  var inRecsAll = recs.filter(function(r) { return !r.type; });
  var inRecs = inRecsAll.filter(function(r) { return r.store === currentColdStore && !r.dep; });
  
  // 顶部统计显示当前冷库的在库数据
  gid('s-total').textContent = inRecs.length;
  gid('s-pallets').textContent = inRecs.reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);
  gid('s-items').textContent = inRecs.reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);

  // 冷库1统计（只统计入库记录且在库的）
  var store1Recs = inRecsAll.filter(function(r) { return r.store === 1 && !r.dep; });
  gid('stat-store1-count').textContent = store1Recs.length;
  gid('stat-store1-pallets').textContent = store1Recs.reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);
  gid('stat-store1-items').textContent = store1Recs.reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);

  // 冷库2统计
  var store2Recs = inRecsAll.filter(function(r) { return r.store === 2 && !r.dep; });
  gid('stat-store2-count').textContent = store2Recs.length;
  gid('stat-store2-pallets').textContent = store2Recs.reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);
  gid('stat-store2-items').textContent = store2Recs.reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);

  // 冷库3统计
  var store3Recs = inRecsAll.filter(function(r) { return r.store === 3 && !r.dep; });
  gid('stat-store3-count').textContent = store3Recs.length;
  gid('stat-store3-pallets').textContent = store3Recs.reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);
  gid('stat-store3-items').textContent = store3Recs.reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);

  // 冷库4统计
  var store4Recs = inRecsAll.filter(function(r) { return r.store === 4 && !r.dep; });
  gid('stat-store4-count').textContent = store4Recs.length;
  gid('stat-store4-pallets').textContent = store4Recs.reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);
  gid('stat-store4-items').textContent = store4Recs.reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);
}

function renderCheckout() {
  // 按集装箱号分组出库记录（只显示当前冷库的）
  var cnGroups = {};
  recs.filter(function(r) { return r.type === 'checkout' && r.store === currentColdStore; }).forEach(function(r) {
    if (!cnGroups[r.cn]) {
      cnGroups[r.cn] = {
        recs: [],
        inRec: null
      };
    }
    cnGroups[r.cn].recs.push(r);
  });

  // 为每个集装箱找到对应的入库记录
  Object.keys(cnGroups).forEach(function(cn) {
    var outs = cnGroups[cn].recs;
    if (outs.length > 0) {
      cnGroups[cn].inRec = recs.find(function(r) { return r.id === outs[0].refId; });
    }
  });

  // 添加没有出库记录的入库集装箱（只显示当前冷库的）
  var allInRecs = recs.filter(function(r) { return !r.type && r.store === currentColdStore; });
  allInRecs.forEach(function(inRec) {
    if (!cnGroups[inRec.cn]) {
      cnGroups[inRec.cn] = {
        recs: [],
        inRec: inRec
      };
    } else if (!cnGroups[inRec.cn].inRec) {
      cnGroups[inRec.cn].inRec = inRec;
    }
  });

  var tb = gid('tb-checkout');
  var es = gid('es-checkout');
  if (!tb || !es) return;

  // 检查是否有任何入库记录
  if (allInRecs.length === 0) {
    tb.innerHTML = '';
    es.style.display = 'block';
    return;
  }

  es.style.display = 'none';
  var html = [];

  // 按集装箱号排序
  Object.keys(cnGroups).sort().forEach(function(cn) {
    var group = cnGroups[cn];
    var inRec = group.inRec;
    var outRecs = (group.recs || []).sort(function(a, b) { return new Date(a.dep) - new Date(b.dep); });

    if (!inRec) return;
    
    // 应用搜索筛选
    if (!matchSearchFilters(inRec)) return;

    var startDate = new Date(inRec.arr);
    
    // 如果有出库记录，使用最后出库日期作为结束日期
    // 如果没有出库记录，使用当前日期显示第一周
    var endDate = outRecs.length > 0 ? new Date(outRecs[outRecs.length - 1].dep) : new Date();

    // 计算每周费用
    var totalFee = 0;
    var currentDate = new Date(startDate);
    var weekNum = 1;
    var palletsAtWeekStart = inRec.pallets;
    var itemsOutSoFar = 0;
    var palletsOutSoFar = 0;

    // 生成每周汇总记录
    // 至少显示第一周
    var firstLoop = true;
    while (firstLoop || (currentDate <= endDate && outRecs.length > 0)) {
      firstLoop = false;
      var weekStart = new Date(currentDate);
      var weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      var actualEnd = weekEnd < endDate ? weekEnd : endDate;

      // 该周费用 = 该周第一天的托盘数 × 费率 × 5%
      var prevPallets = palletsAtWeekStart;
      // 金额 = 单价 × 托盘数量（根据冷库选择费率）
      var rate = getRateByStore(inRec.store);
      var amount = prevPallets > 0 ? (prevPallets * rate) : 0;
      // 5% VAT = 金额 × 5%
      var vat = amount * VAT_RATE;
      // 合计 = 金额 + VAT
      var weeklyTotal = amount + vat;
      if (weeklyTotal > 0) {
        totalFee += weeklyTotal;
      }

      // 格式：第N周 (MM/DD-MM/DD)
      var startStr = (weekStart.getMonth() + 1) + '/' + weekStart.getDate();
      var endStr = (weekEnd.getMonth() + 1) + '/' + weekEnd.getDate();
      var weekLabel = '第' + weekNum + '周 (' + startStr + '-' + endStr + ')';

      // 该周出库托盘数
      var weekOutPallets = 0;
      var weekOutItems = 0;
      outRecs.forEach(function(or) {
        var od = new Date(or.dep);
        if (od >= weekStart && od <= weekEnd) {
          weekOutPallets += or.pallets_out;
          weekOutItems += or.items_out;
        }
      });

      // 下周起始托盘数
      var prevPallets = palletsAtWeekStart;
      palletsAtWeekStart = Math.max(0, palletsAtWeekStart - weekOutPallets);

      // 判断是否是最后一周（全部出库完成）
      var isLastWeek = palletsAtWeekStart === 0;
      var isFirstWeek = weekNum === 1;

      // 托盘数和件数显示逻辑：0显示为"-"
      var displayPallets = prevPallets > 0 ? prevPallets : '-';
      var displayOutPallets = weekOutPallets > 0 ? ('-' + weekOutPallets) : '-';
      var displayOutItems = weekOutItems > 0 ? ('-' + weekOutItems) : '-';

      // 入库件数只在第一周显示
      var displayInItems = isFirstWeek ? '<strong style="color:#ff9900">' + inRec.items + '</strong>' : '-';

      // 每周汇总行 - 显示本周开始时的剩余件数
      // 如果托盘已全部出库，剩余件数必须为0
      var remainingItemsAtWeekStart;
      if (isLastWeek) {
        remainingItemsAtWeekStart = 0;
      } else {
        remainingItemsAtWeekStart = inRec.items - itemsOutSoFar;
      }
      var displayRemItems = remainingItemsAtWeekStart > 0 ? remainingItemsAtWeekStart : '0';

      // 第一周用中黄色，最后一周用淡绿色，其他用淡黄色
      var rowBg = isFirstWeek ? 'background:#fff59d' : (isLastWeek ? 'background:#e8f5e9' : 'background:#fff3cd');

      // 本周合计 = 金额 + VAT
      var weekTotal = amount + vat;
      
      // 合计显示逻辑：最后一周显示总金额，其他周显示本周合计
      var weekTotalDisplay;
      if (isLastWeek && totalFee > 0) {
        // 最后一周显示总冷库费（累计），加大加粗蓝色
        weekTotalDisplay = '<strong style="color:#0066cc;font-size:18px">' + totalFee.toFixed(2) + '</strong>';
      } else if (weekTotal > 0) {
        // 其他周显示本周合计
        weekTotalDisplay = '<strong style="color:#0066cc">' + weekTotal.toFixed(2) + '</strong>';
      } else {
        weekTotalDisplay = '-';
      }

      html.push('<tr style="' + rowBg + '">' +
        '<td><strong style="cursor:pointer;color:#0066cc;text-decoration:underline" onclick="showCheckoutDetail(\'' + cn + '\')">' + cn + '</strong></td>' +
        '<td style="font-family:Arial;text-transform:capitalize">' + (inRec.supplier || '-') + '</td>' +
        '<td style="font-family:Arial;text-transform:capitalize">' + inRec.product + '</td>' +
        '<td style="font-weight:bold;color:#0066cc">' + weekLabel + '</td>' +
        '<td><strong>' + displayPallets + '</strong></td>' +
        '<td><span style="color:#cc0000">' + displayOutPallets + '</span></td>' +
        '<td><span style="color:#cc0000">' + displayOutItems + '</span></td>' +
        '<td><strong style="color:#00aa00">' + displayRemItems + '</strong></td>' +
        '<td>' + displayInItems + '</td>' +
        '<td>' + (prevPallets > 0 ? rate.toFixed(2) : '-') + '</td>' +
        '<td>' + (prevPallets > 0 ? amount.toFixed(2) : '-') + '</td>' +
        '<td>' + (prevPallets > 0 ? vat.toFixed(2) : '-') + '</td>' +
        '<td>' + weekTotalDisplay + '</td>' +
        '</tr>');

      // 该周的出库明细（绿色背景，显示在该周下面）
      var weekOutRecs = outRecs.filter(function(or) {
        var od = new Date(or.dep);
        return od >= weekStart && od <= weekEnd;
      });
      weekOutRecs.forEach(function(or) {
        // 累计到当前出库的总件数（包括之前周的）
        itemsOutSoFar += or.items_out;
        palletsOutSoFar += or.pallets_out;
        // 计算出库后的剩余件数 = 入库件数 - 累计出库件数
        var outRemItems = inRec.items - itemsOutSoFar;
        // 计算出库后的剩余托盘数 = 入库托盘数 - 累计出库托盘数
        var outRemPallets = inRec.pallets - palletsOutSoFar;
        
        // 如果剩余托盘为0，剩余件数也必须为0
        if (outRemPallets === 0) {
          outRemItems = 0;
        }
        
        // 管理员才显示修改按钮
        var editOutBtn = isAdmin ? '<button class="abtn" onclick="showEditOutRecord(\'' + or.id + '\')" style="margin-left:4px">✏️</button>' : '';
        
        html.push('<tr style="background:#f0fff0">' +
          '<td style="padding-left:20px;color:#999">' + cn + '</td>' +
          '<td style="color:#999;font-family:Arial;text-transform:capitalize">' + (or.supplier || '-') + '</td>' +
          '<td style="color:#999;font-family:Arial;text-transform:capitalize">' + or.product + '</td>' +
          '<td style="color:#00aa00;font-weight:bold">' + fdt(or.dep) + '</td>' +
          '<td>-</td>' +
          '<td><span style="color:#cc0000;font-weight:bold">' + or.pallets_out + '</span> / <strong style="color:#00aa00">' + (outRemPallets >= 0 ? outRemPallets : '0') + '</strong></td>' +
          '<td><span style="color:#cc0000;font-weight:bold">' + or.items_out + '</span></td>' +
          '<td><strong style="color:#00aa00">' + (outRemItems >= 0 ? outRemItems : '0') + '</strong></td>' +
          '<td>-</td>' +
          '<td>-</td>' +
          '<td>-</td>' +
          '<td>-</td>' +
          '<td>' + editOutBtn + '</td>' +
          '</tr>');
      });

      currentDate = new Date(weekEnd);
      currentDate.setDate(currentDate.getDate() + 1);
      weekNum++;
    }
  });

  tb.innerHTML = html.join('');
}

// ============================================================
// 搜索和导出功能
// ============================================================
var checkoutSearchFilters = {
  cn: '',
  supplier: '',
  product: '',
  dateStart: '',
  dateEnd: ''
};

function applySearch() {
  checkoutSearchFilters = {
    cn: (gid('search-cn').value || '').trim().toLowerCase(),
    supplier: (gid('search-supplier').value || '').trim().toLowerCase(),
    product: (gid('search-product').value || '').trim().toLowerCase(),
    dateStart: gid('search-date-start').value || '',
    dateEnd: gid('search-date-end').value || ''
  };
  renderCheckout();
  toast('✅ 筛选条件已应用', 'ok');
}

function resetSearch() {
  gid('search-cn').value = '';
  gid('search-supplier').value = '';
  gid('search-product').value = '';
  gid('search-date-start').value = '';
  gid('search-date-end').value = '';
  checkoutSearchFilters = {
    cn: '',
    supplier: '',
    product: '',
    dateStart: '',
    dateEnd: ''
  };
  renderCheckout();
  toast('✅ 已重置筛选条件', 'ok');
}

function matchSearchFilters(inRec) {
  var f = checkoutSearchFilters;
  
  // 集装箱号匹配
  if (f.cn && (inRec.cn || '').toLowerCase().indexOf(f.cn) < 0) {
    return false;
  }
  
  // 供应商匹配
  if (f.supplier && (inRec.supplier || '').toLowerCase().indexOf(f.supplier) < 0) {
    return false;
  }
  
  // 品名匹配
  if (f.product && (inRec.product || '').toLowerCase().indexOf(f.product) < 0) {
    return false;
  }
  
  // 日期范围匹配
  if (f.dateStart || f.dateEnd) {
    var arrDate = new Date(inRec.arr);
    if (f.dateStart && arrDate < new Date(f.dateStart)) {
      return false;
    }
    if (f.dateEnd && arrDate > new Date(f.dateEnd)) {
      return false;
    }
  }
  
  return true;
}

function exportCheckout() {
  // 获取搜索后的数据（只显示当前冷库的）
  var data = [];
  var cnGroups = {};
  
  recs.filter(function(r) { return r.type === 'checkout' && r.store === currentColdStore; }).forEach(function(r) {
    if (!cnGroups[r.cn]) {
      cnGroups[r.cn] = { recs: [], inRec: null };
    }
    cnGroups[r.cn].recs.push(r);
  });
  
  Object.keys(cnGroups).forEach(function(cn) {
    var outs = cnGroups[cn].recs;
    if (outs.length > 0) {
      cnGroups[cn].inRec = recs.find(function(r) { return r.id === outs[0].refId; });
    }
  });
  
  // 添加没有出库记录的入库集装箱（只显示当前冷库的）
  var allInRecs = recs.filter(function(r) { return !r.type && r.store === currentColdStore; });
  allInRecs.forEach(function(inRec) {
    if (!cnGroups[inRec.cn]) {
      cnGroups[inRec.cn] = { recs: [], inRec: inRec };
    } else if (!cnGroups[inRec.cn].inRec) {
      cnGroups[inRec.cn].inRec = inRec;
    }
  });
  
  // 表头
  data.push(['集装箱号', '供应商', '品名', '周/日期', '托盘数', '出库托盘', '出库件数', '剩余件数', '入库件数', '单价', '金额', '5% VAT', '合计']);
  
  // 按集装箱号排序
  Object.keys(cnGroups).sort().forEach(function(cn) {
    var group = cnGroups[cn];
    var inRec = group.inRec;
    var outRecs = (group.recs || []).sort(function(a, b) { return new Date(a.dep) - new Date(b.dep); });
    
    if (!inRec) return;
    
    // 应用搜索筛选
    if (!matchSearchFilters(inRec)) return;
    
    var startDate = new Date(inRec.arr);
    var endDate = outRecs.length > 0 ? new Date(outRecs[outRecs.length - 1].dep) : new Date();
    
    var totalFee = 0;
    var currentDate = new Date(startDate);
    var weekNum = 1;
    var palletsAtWeekStart = inRec.pallets;
    var itemsOutSoFar = 0;
    var palletsOutSoFar = 0;
    var firstLoop = true;
    
    while (firstLoop || (currentDate <= endDate && outRecs.length > 0)) {
      firstLoop = false;
      var weekStart = new Date(currentDate);
      var weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      var prevPallets = palletsAtWeekStart;
      var rate = getRateByStore(inRec.store);
      var amount = prevPallets > 0 ? (prevPallets * rate) : 0;
      var vat = amount * VAT_RATE;
      var weeklyTotal = amount + vat;
      if (weeklyTotal > 0) totalFee += weeklyTotal;
      
      var startStr = (weekStart.getMonth() + 1) + '/' + weekStart.getDate();
      var endStr = (weekEnd.getMonth() + 1) + '/' + weekEnd.getDate();
      var weekLabel = '第' + weekNum + '周 (' + startStr + '-' + endStr + ')';
      
      var weekOutPallets = 0;
      var weekOutItems = 0;
      outRecs.forEach(function(or) {
        var od = new Date(or.dep);
        if (od >= weekStart && od <= weekEnd) {
          weekOutPallets += or.pallets_out;
          weekOutItems += or.items_out;
        }
      });
      
      palletsAtWeekStart = Math.max(0, palletsAtWeekStart - weekOutPallets);
      var isLastWeek = palletsAtWeekStart === 0;
      
      var displayPallets = prevPallets > 0 ? prevPallets : 0;
      var displayOutPallets = weekOutPallets > 0 ? weekOutPallets : 0;
      var displayOutItems = weekOutItems > 0 ? weekOutItems : 0;
      var displayInItems = weekNum === 1 ? inRec.items : 0;
      
      var remainingItemsAtWeekStart = isLastWeek ? 0 : (inRec.items - itemsOutSoFar);
      
      data.push([
        inRec.cn,
        inRec.supplier || '-',
        inRec.product || '-',
        weekLabel,
        displayPallets,
        displayOutPallets,
        displayOutItems,
        remainingItemsAtWeekStart,
        displayInItems,
        prevPallets > 0 ? rate.toFixed(2) : '-',
        prevPallets > 0 ? amount.toFixed(2) : '-',
        prevPallets > 0 ? vat.toFixed(2) : '-',
        totalFee.toFixed(2)
      ]);
      
      currentDate = new Date(weekEnd);
      currentDate.setDate(currentDate.getDate() + 1);
      weekNum++;
    }
  });
  
  // 导出为 CSV
  var csvContent = '\uFEFF'; // BOM for Excel
  data.forEach(function(row) {
    csvContent += row.map(function(cell) {
      return '"' + String(cell).replace(/"/g, '""') + '"';
    }).join(',') + '\n';
  });
  
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = '出库记录_' + new Date().toISOString().slice(0, 10) + '.csv';
  link.click();
  
  toast('✅ 导出成功', 'ok');
}

// ============================================================
// DETAIL MODAL
// ============================================================
function showDet(id) {
  var r = recs.find(function(x) { return x.id === id; });
  if (!r || r.type === 'checkout') return;

  var remaining_pallets = r.pallets - (r.pallets_out || 0);
  var remaining_items = r.items - (r.items_out || 0);
  var fee = calcFee(r);

  // 获取所有出库记录
  var outRecs = recs.filter(function(x) { return x.refId === r.id && x.type === 'checkout'; });

  var mcon = gid('mcon');
  if (mcon) {
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">';
    html += '<div class="mr"><span class="ml">集装箱号</span><span class="mv"><strong>' + r.cn + '</strong></span></div>';
    html += '<div class="mr"><span class="ml">供应商</span><span class="mv">' + (r.supplier || '-') + '</span></div>';
    html += '<div class="mr"><span class="ml">品名</span><span class="mv">' + r.product + '</span></div>';
    html += '<div class="mr"><span class="ml">冷库</span><span class="mv">冷库 ' + r.store + '</span></div>';
    html += '<div class="mr"><span class="ml">入库时间</span><span class="mv">' + fdt(r.arr) + '</span></div>';
    html += '<div class="mr"><span class="ml">出库时间</span><span class="mv">' + fdt(r.dep) + '</span></div>';
    html += '<div class="mr"><span class="ml">入库托盘</span><span class="mv">' + r.pallets + '</span></div>';
    html += '<div class="mr"><span class="ml">已出托盘</span><span class="mv" style="color:#cc0000">' + (r.pallets_out || 0) + '</span></div>';
    html += '<div class="mr"><span class="ml">剩余托盘</span><span class="mv" style="color:#ff9900;font-weight:bold">' + remaining_pallets + '</span></div>';
    html += '<div class="mr"><span class="ml">入库件数</span><span class="mv">' + r.items + '</span></div>';
    html += '<div class="mr"><span class="ml">已出件数</span><span class="mv" style="color:#cc0000">' + (r.items_out || 0) + '</span></div>';
    html += '<div class="mr"><span class="ml">剩余件数</span><span class="mv" style="color:#ff9900;font-weight:bold">' + remaining_items + '</span></div>';
    html += '<div class="mr"><span class="ml">冷库费用</span><span class="mv" style="color:#0066cc;font-weight:bold;font-size:16px">' + fee.toFixed(2) + ' AED</span></div>';
    html += '</div>';

    // 出库记录表格（横向）
    if (outRecs.length > 0) {
      html += '<div style="margin-top:14px;border-top:1px solid #ddd;padding-top:12px">';
      html += '<div style="font-size:11px;color:#666;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">出库记录 (' + outRecs.length + ' 次)</div>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #ddd">';
      html += '<tr style="background:#f5f5f5"><th style="padding:6px;border:1px solid #ddd">#</th>';
      html += '<th style="padding:6px;border:1px solid #ddd">出库日期</th>';
      html += '<th style="padding:6px;border:1px solid #ddd">托盘</th>';
      html += '<th style="padding:6px;border:1px solid #ddd">件数</th></tr>';
      outRecs.forEach(function(or, i) {
        html += '<tr><td style="padding:6px;border:1px solid #ddd;text-align:center">' + (i+1) + '</td>';
        html += '<td style="padding:6px;border:1px solid #ddd">' + fdt(or.dep) + '</td>';
        html += '<td style="padding:6px;border:1px solid #ddd;color:#cc0000">' + or.pallets_out + '</td>';
        html += '<td style="padding:6px;border:1px solid #ddd;color:#cc0000">' + or.items_out + '</td></tr>';
      });
      html += '</table></div>';
    }

    html += '<div style="margin-top:10px;padding:8px;background:#f0f0f0;border-radius:4px;font-size:11px;color:#666">';
    var rate = getRateByStore(r.store);
    html += '费率: ' + rate + ' AED/托盘/周 + ' + (VAT_RATE*100) + '% VAT = ' + (rate * (1 + VAT_RATE)).toFixed(2) + ' AED/托盘/周';
    html += '</div>';

    mcon.innerHTML = html;
  }

  gid('modal').classList.add('sh');
}

function clModal() {
  gid('modal').classList.remove('sh');
}

// ============================================================
// 出库记录详情 - 点击集装箱号显示剩余托盘和件数
// ============================================================
function showCheckoutDetail(cn) {
  // 找到该集装箱的入库记录
  var inRec = recs.find(function(r) { return r.cn === cn && !r.type; });
  if (!inRec) return;

  var remaining_pallets = inRec.pallets - (inRec.pallets_out || 0);
  var remaining_items = inRec.items - (inRec.items_out || 0);

  // 显示弹窗
  var mcon = gid('mcon');
  if (mcon) {
    mcon.innerHTML = '<div style="text-align:center;padding:20px">' +
      '<div style="font-size:18px;font-weight:bold;margin-bottom:16px">' + cn + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;text-align:center">' +
        '<div style="background:#fff3cd;padding:16px;border-radius:8px">' +
          '<div style="font-size:12px;color:#666;margin-bottom:4px">剩余托盘</div>' +
          '<div style="font-size:28px;font-weight:bold;color:#ff9900">' + remaining_pallets + '</div>' +
        '</div>' +
        '<div style="background:#e8f4ff;padding:16px;border-radius:8px">' +
          '<div style="font-size:12px;color:#666;margin-bottom:4px">剩余件数</div>' +
          '<div style="font-size:28px;font-weight:bold;color:#0066cc">' + remaining_items + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:16px;padding:12px;background:#f5f5f5;border-radius:6px;font-size:12px;color:#666">' +
        '入库时间: ' + fdt(inRec.arr) + '<br>' +
        '入库托盘: ' + inRec.pallets + ' | 入库件数: ' + inRec.items +
      '</div>' +
    '</div>';
  }
  gid('modal').classList.add('sh');
}

// ============================================================
// 出库记录详情
// ============================================================
function showOutDet(id) {
  var r = recs.find(function(x) { return x.id === id; });
  if (!r || r.type !== 'checkout') return;

  // 获取原始入库记录来计算剩余数量
  var inRec = recs.find(function(x) { return x.id === r.refId; });
  var remaining_pallets = inRec ? (inRec.pallets - (inRec.pallets_out || 0)) : 0;
  var remaining_items = inRec ? (inRec.items - (inRec.items_out || 0)) : 0;

  var mcon = gid('mcon');
  if (mcon) {
    mcon.innerHTML = '<div style="text-align:center;padding:20px">' +
      '<div style="font-size:18px;font-weight:bold;margin-bottom:16px">' + r.cn + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;text-align:center">' +
        '<div style="background:#e8f4ff;padding:16px;border-radius:8px">' +
          '<div style="font-size:12px;color:#666;margin-bottom:4px">出库托盘</div>' +
          '<div style="font-size:28px;font-weight:bold;color:#cc0000">' + r.pallets_out + '</div>' +
        '</div>' +
        '<div style="background:#e8f4ff;padding:16px;border-radius:8px">' +
          '<div style="font-size:12px;color:#666;margin-bottom:4px">出库件数</div>' +
          '<div style="font-size:28px;font-weight:bold;color:#cc0000">' + r.items_out + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:16px;padding:12px;background:#f5f5f5;border-radius:6px;font-size:12px;color:#666">' +
        '出库时间: ' + fdt(r.dep) +
      '</div>' +
    '</div>';
  }
  gid('modal').classList.add('sh');
}

// ============================================================
// 编辑入库记录（管理员权限）
// ============================================================
function showEditRecord(id) {
  if (!isAdmin) {
    toast('需要管理员权限', 'err');
    return;
  }
  var r = recs.find(function(x) { return x.id === id; });
  if (!r || r.type === 'checkout') return;
  
  gid('edit-record-id').value = id;
  gid('edit-cn').value = r.cn;
  gid('edit-pallets').value = r.pallets;
  gid('edit-items').value = r.items;
  gid('editRecordModal').classList.add('sh');
}

function closeEditRecordModal() {
  gid('editRecordModal').classList.remove('sh');
}

function saveEditRecord() {
  var id = gid('edit-record-id').value;
  var r = recs.find(function(x) { return x.id === id; });
  if (!r) return;
  
  var newPallets = parseInt(gid('edit-pallets').value) || 0;
  var newItems = parseInt(gid('edit-items').value) || 0;
  
  if (newPallets < (r.pallets_out || 0)) {
    toast('入库托盘不能小于已出库托盘', 'err');
    return;
  }
  if (newItems < (r.items_out || 0)) {
    toast('入库件数不能小于已出库件数', 'err');
    return;
  }
  
  r.pallets = newPallets;
  r.items = newItems;
  
  // 保存到 Firebase
  if (dbRef) {
    dbRef.child(id).set(r);
  }
  
  closeEditRecordModal();
  renderAll();
  toast('✅ 修改成功', 'ok');
}

// ============================================================
// 清空记录功能
// ============================================================
function showClearModal(type) {
  gid('clear-type').value = type;
  gid('clear-option').value = 'all';
  gid('clear-cn-select-container').style.display = 'none';
  
  // 填充集装箱号选项
  var cnSelect = gid('clear-cn-select');
  cnSelect.innerHTML = '';
  
  if (type === 'records') {
    // 库存记录：获取所有入库记录的集装箱号
    var inRecs = recs.filter(function(r) { return !r.type; });
    var cns = [...new Set(inRecs.map(function(r) { return r.cn; }))];
    cns.sort().forEach(function(cn) {
      cnSelect.innerHTML += '<option value="' + cn + '">' + cn + '</option>';
    });
  } else if (type === 'checkout') {
    // 出库记录：获取所有出库记录的集装箱号
    var outRecs = recs.filter(function(r) { return r.type === 'checkout'; });
    var cns = [...new Set(outRecs.map(function(r) { return r.cn; }))];
    cns.sort().forEach(function(cn) {
      cnSelect.innerHTML += '<option value="' + cn + '">' + cn + '</option>';
    });
  }
  
  gid('clearModal').classList.add('sh');
}

function closeClearModal() {
  gid('clearModal').classList.remove('sh');
}

// 监听清空选项变化
document.addEventListener('DOMContentLoaded', function() {
  var clearOption = gid('clear-option');
  if (clearOption) {
    clearOption.addEventListener('change', function() {
      var cnContainer = gid('clear-cn-select-container');
      if (this.value === 'by-cn') {
        cnContainer.style.display = 'block';
      } else {
        cnContainer.style.display = 'none';
      }
    });
  }
});

function confirmClear() {
  var type = gid('clear-type').value;
  var option = gid('clear-option').value;
  var cn = gid('clear-cn-select').value;
  
  var confirmMsg = '';
  var idsToDelete = [];
  
  if (type === 'records') {
    if (option === 'all') {
      confirmMsg = '确定要清空所有库存记录吗？这将同时删除相关的出库记录！';
      idsToDelete = recs.filter(function(r) { return !r.type || r.type === 'checkout'; }).map(function(r) { return r.id; });
    } else {
      confirmMsg = '确定要清空集装箱 ' + cn + ' 的所有记录吗？这将同时删除相关的出库记录！';
      var inRec = recs.find(function(r) { return r.cn === cn && !r.type; });
      if (inRec) {
        idsToDelete.push(inRec.id);
        // 同时删除相关的出库记录
        recs.filter(function(r) { return r.type === 'checkout' && r.cn === cn; }).forEach(function(r) {
          idsToDelete.push(r.id);
        });
      }
    }
  } else if (type === 'checkout') {
    if (option === 'all') {
      confirmMsg = '确定要清空所有出库记录吗？';
      idsToDelete = recs.filter(function(r) { return r.type === 'checkout'; }).map(function(r) { return r.id; });
    } else {
      confirmMsg = '确定要清空集装箱 ' + cn + ' 的出库记录吗？';
      idsToDelete = recs.filter(function(r) { return r.type === 'checkout' && r.cn === cn; }).map(function(r) { return r.id; });
    }
  }
  
  if (idsToDelete.length === 0) {
    toast('没有可清空的记录', 'err');
    closeClearModal();
    return;
  }
  
  if (!confirm(confirmMsg + '\n\n共 ' + idsToDelete.length + ' 条记录将被删除！')) {
    return;
  }
  
  // 二次确认
  if (!confirm('⚠️ 最后确认：此操作不可恢复！确定继续吗？')) {
    return;
  }
  
  // 执行删除
  idsToDelete.forEach(function(id) {
    if (dbRef) {
      dbRef.child(id).remove();
    }
  });
  
  closeClearModal();
  toast('✅ 已清空 ' + idsToDelete.length + ' 条记录', 'ok');
}

// ============================================================
// 编辑出库记录（管理员权限）
// ============================================================
function showEditOutRecord(id) {
  if (!isAdmin) {
    toast('需要管理员权限', 'err');
    return;
  }
  var r = recs.find(function(x) { return x.id === id; });
  if (!r || r.type !== 'checkout') return;
  
  gid('edit-out-id').value = id;
  gid('edit-out-cn').value = r.cn;
  gid('edit-out-pallets').value = r.pallets_out;
  gid('edit-out-items').value = r.items_out;
  gid('editOutRecordModal').classList.add('sh');
}

function closeEditOutRecordModal() {
  gid('editOutRecordModal').classList.remove('sh');
}

function saveEditOutRecord() {
  var id = gid('edit-out-id').value;
  var r = recs.find(function(x) { return x.id === id; });
  if (!r) return;
  
  var inRec = recs.find(function(x) { return x.id === r.refId; });
  if (!inRec) return;
  
  var oldPalletsOut = r.pallets_out;
  var oldItemsOut = r.items_out;
  var newPalletsOut = parseInt(gid('edit-out-pallets').value) || 0;
  var newItemsOut = parseInt(gid('edit-out-items').value) || 0;
  
  // 计算入库记录的新出库总数
  var totalPalletsOut = (inRec.pallets_out || 0) - oldPalletsOut + newPalletsOut;
  var totalItemsOut = (inRec.items_out || 0) - oldItemsOut + newItemsOut;
  
  if (totalPalletsOut > inRec.pallets) {
    toast('出库托盘总数超过入库托盘', 'err');
    return;
  }
  if (totalItemsOut > inRec.items) {
    toast('出库件数总数超过入库件数', 'err');
    return;
  }
  
  // 更新出库记录
  r.pallets_out = newPalletsOut;
  r.items_out = newItemsOut;
  
  // 更新入库记录的出库总数
  inRec.pallets_out = totalPalletsOut;
  inRec.items_out = totalItemsOut;
  
  // 检查是否全部出库
  if (inRec.pallets_out >= inRec.pallets && !inRec.dep) {
    inRec.dep = r.dep;
  }
  
  // 保存到 Firebase
  if (dbRef) {
    dbRef.child(id).set(r);
    dbRef.child(inRec.id).set(inRec);
  }
  
  closeEditOutRecordModal();
  renderAll();
  toast('✅ 修改成功', 'ok');
}

// ============================================================
// COLD STORE SWITCH
// ============================================================
function selectColdStore(n) {
  currentColdStore = n;
  document.querySelectorAll('.warehouse-btn').forEach(function(btn, i) {
    btn.classList.toggle('active', i + 1 === n);
  });
  renderAll();
}

// ============================================================
// TAB SWITCH
// ============================================================
function swTab(tab) {
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('ac'); });
  document.querySelectorAll('.tc').forEach(function(t) { t.classList.remove('ac'); });
  
  var tabNames = ['purchase', 'records', 'checkout', 'stats'];
  var idx = tabNames.indexOf(tab);
  
  document.querySelectorAll('.tab')[idx].classList.add('ac');
  document.getElementById('tc-' + tab).classList.add('ac');
}

// ============================================================
// PURCHASE RECORDS
// ============================================================
var PURCHASE_KEY = 'csm_purchase_v1';
var purchaseRecs = [];

function loadPurchase() {
  try {
    var stored = localStorage.getItem(PURCHASE_KEY);
    purchaseRecs = stored ? JSON.parse(stored) : [];
  } catch(e) { purchaseRecs = []; }
}

function savePurchase() {
  // Firebase 自动同步
}

function savePurchaseItem(item) {
  if (purchaseRef && item.id) {
    purchaseRef.child(item.id).set(item);
  }
}

function openPurchaseForm() {
  // 重置入库按钮状态
  var checkInBtn = gid('checkInBtn');
  if (checkInBtn) {
    checkInBtn.classList.remove('btn-g');
    checkInBtn.classList.add('btn-s');
    checkInBtn.innerHTML = '✓ 入库 Check In';
    checkInBtn.disabled = false;
  }
  
  // 重置表单
  var cnField = gid('fp-cn');
  var supplierField = gid('fp-supplier');
  var dateField = gid('fp-date');
  var itemsBody = gid('purchaseItemsBody');
  purchaseItemRowCounter = 0;
  
  if (cnField) cnField.value = '';
  if (supplierField) supplierField.value = '';
  if (dateField) dateField.value = nowFmt();
  if (itemsBody) {
    itemsBody.innerHTML = '<tr class="purchase-item-row">' +
      '<td style="padding:4px;border:1px solid #ddd;position:relative">' +
        '<input type="text" class="item-product" placeholder="品名" data-rowid="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px" oninput="showSuggestPurchaseItem(this)" onfocus="showSuggestPurchaseItem(this)" onblur="setTimeout(function(){hideSuggest(\'purchase-item-0\')},200)">' +
        '<div class="suggest-list" id="suggest-purchase-item-0"></div>' +
      '</td>' +
      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-qty" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-demurrage" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-customs" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-coldfee" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-attestation" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-repack" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
      '<td style="padding:4px;border:1px solid #ddd;text-align:center"><button type="button" class="abtn x" onclick="removePurchaseItem(this)" style="color:#ff4444;font-size:16px">×</button></td>' +
      '</tr>';
  }
  gid('purchaseModal').classList.add('sh');
}

function clPurchaseModal() {
  // 重置表单
  var cnField = gid('fp-cn');
  var supplierField = gid('fp-supplier');
  var dateField = gid('fp-date');
  var itemsBody = gid('purchaseItemsBody');
  purchaseItemRowCounter = 0;
  
  if (cnField) cnField.value = '';
  if (supplierField) supplierField.value = '';
  if (dateField) dateField.value = '';
  if (itemsBody) {
    itemsBody.innerHTML = '<tr class="purchase-item-row">' +
      '<td style="padding:4px;border:1px solid #ddd;position:relative">' +
        '<input type="text" class="item-product" placeholder="品名" data-rowid="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px" oninput="showSuggestPurchaseItem(this)" onfocus="showSuggestPurchaseItem(this)" onblur="setTimeout(function(){hideSuggest(\'purchase-item-0\')},200)">' +
        '<div class="suggest-list" id="suggest-purchase-item-0"></div>' +
      '</td>' +
      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-qty" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-demurrage" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-customs" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-coldfee" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-attestation" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-repack" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
      '<td style="padding:4px;border:1px solid #ddd;text-align:center"><button type="button" class="abtn x" onclick="removePurchaseItem(this)" style="color:#ff4444;font-size:16px">×</button></td>' +
      '</tr>';
  }
  
  gid('purchaseModal').classList.remove('sh');
}

function addPurchase() {
  console.log('addPurchase called');
  var cn = (gid('fp-cn').value || '').trim().toUpperCase();
  var supplier = (gid('fp-supplier').value || '').trim();
  var purchaseDate = gid('fp-date').value;

  if (!cn) { toast('请输入集装箱号 / Enter container no.', 'err'); return; }
  if (!supplier) { toast('请输入供应商', 'err'); return; }

  // 获取所有品名行
  var rows = document.querySelectorAll('.purchase-item-row');
  console.log('Found rows:', rows.length);
  var items = [];
  
  rows.forEach(function(row, idx) {
    var productInput = row.querySelector('.item-product');
    var product = (productInput.value || '').trim();
    console.log('Row', idx, 'product:', product);
    if (!product) return; // 跳过空品名行
    
    var item = {
      qty: parseFloat(row.querySelector('.item-qty').value) || 0,
      demurrage: parseFloat(row.querySelector('.item-demurrage').value) || 0,
      customs: parseFloat(row.querySelector('.item-customs').value) || 0,
      coldFee: parseFloat(row.querySelector('.item-coldfee').value) || 0,
      attestation: parseFloat(row.querySelector('.item-attestation').value) || 0,
      repack: parseFloat(row.querySelector('.item-repack').value) || 0
    };
    
    // 为每个品名创建单独的采购记录
    var id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    var rec = {
      id: id,
      cn: cn,
      supplier: supplier,
      product: product,
      purchaseDate: purchaseDate,
      qty: item.qty,
      demurrage: item.demurrage,
      customs: item.customs,
      coldFee: item.coldFee,
      attestation: item.attestation,
      repack: item.repack,
      waste: 0,
      other: 0
    };
    
    items.push(rec);
    console.log('Added item:', rec.product);
    
    // 保存到 Firebase
    if (purchaseRef) {
      purchaseRef.child(id).set(rec).then(function(){console.log('Saved:',id);}).catch(function(e){console.error('Error:',e);});
    }
  });

  console.log('Total items to add:', items.length);

  if (items.length === 0) {
    toast('请至少添加一个品名', 'err');
    return;
  }

  // 注意：数据会通过 Firebase 监听器自动添加到 purchaseRecs，这里不需要手动 concat
  // 只需要保存到 Firebase 即可

  // 重置表单
  gid('fp-cn').value = '';
  gid('fp-supplier').value = '';
  gid('fp-date').value = '';
  gid('purchaseItemsBody').innerHTML = '<tr class="purchase-item-row">' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="text" class="item-product" placeholder="品名" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px"></td>' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-qty" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-demurrage" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-customs" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-coldfee" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-attestation" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-repack" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
    '<td style="padding:4px;border:1px solid #ddd;text-align:center"><button type="button" class="abtn x" onclick="removePurchaseItem(this)" style="color:#ff4444;font-size:16px">×</button></td>' +
    '</tr>';

  clPurchaseModal();
  renderPurchase();
  toast('✅ 已添加 ' + items.length + ' 条采购记录', 'ok');
}

// 添加品名行
function addPurchaseItem() {
  purchaseItemRowCounter++;
  var rowId = purchaseItemRowCounter;
  var newRow = document.createElement('tr');
  newRow.className = 'purchase-item-row';
  newRow.innerHTML = 
    '<td style="padding:4px;border:1px solid #ddd;position:relative">' +
      '<input type="text" class="item-product" placeholder="品名" data-rowid="' + rowId + '" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px" oninput="showSuggestPurchaseItem(this)" onfocus="showSuggestPurchaseItem(this)" onblur="setTimeout(function(){hideSuggest(\'purchase-item-' + rowId + '\')},200)">' +
      '<div class="suggest-list" id="suggest-purchase-item-' + rowId + '"></div>' +
    '</td>' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-qty" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-demurrage" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-customs" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-coldfee" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-attestation" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-repack" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +
    '<td style="padding:4px;border:1px solid #ddd;text-align:center"><button type="button" class="abtn x" onclick="removePurchaseItem(this)" style="color:#ff4444;font-size:16px">×</button></td>';
  document.getElementById('purchaseItemsBody').appendChild(newRow);
}

// 删除品名行
function removePurchaseItem(btn) {
  var rows = document.querySelectorAll('.purchase-item-row');
  if (rows.length > 1) {
    btn.closest('tr').remove();
  } else {
    toast('至少保留一行品名', 'err');
  }
}

function delPurchase(id) {
  if (!confirm('确认删除这条采购记录？ / Confirm delete?')) return;
  if (purchaseRef) {
    purchaseRef.child(id).remove();
  }
}

function filterPurchase() { renderPurchase(); }

function resetPurchaseSearch() {
  gid('search-purchase-date').value = '';
  gid('search-purchase-cn').value = '';
  gid('search-purchase-supplier').value = '';
  renderPurchase();
}

function renderPurchase() { console.log("purchaseRecs:", purchaseRecs);
  var tb = gid('tb-purchase');
  var es = gid('es-purchase');
  if (!tb || !es) return;
  
  // 获取搜索条件
  var searchDate = (gid('search-purchase-date').value || '').trim();
  var searchCn = (gid('search-purchase-cn').value || '').trim().toUpperCase();
  var searchSupplier = (gid('search-purchase-supplier').value || '').trim().toUpperCase();
  
  // 过滤记录
  var filteredRecs = purchaseRecs.filter(function(r) {
    var matchDate = !searchDate || (r.purchaseDate || '').indexOf(searchDate) !== -1;
    var matchCn = !searchCn || (r.cn || '').indexOf(searchCn) !== -1;
    var matchSupplier = !searchSupplier || (r.supplier || '').toUpperCase().indexOf(searchSupplier) !== -1;
    return matchDate && matchCn && matchSupplier;
  });
  
  if (filteredRecs.length === 0) { tb.innerHTML = ''; es.style.display = 'block'; return; }
  es.style.display = 'none';

  // 按集装箱号分组
  var cnGroups = {};
  filteredRecs.forEach(function(r) {
    var key = r.cn || '_empty_';
    if (!cnGroups[key]) cnGroups[key] = [];
    cnGroups[key].push(r);
  });

  var html = '';
  Object.keys(cnGroups).sort().forEach(function(cn) {
    var items = cnGroups[cn];
    var groupId = 'group-' + cn.replace(/[^a-zA-Z0-9]/g, '');
    var firstItem = items[0];
    var totalItems = items.length;
    var totalAmount = items.reduce(function(s, r) { return s + ((r.demurrage||0)+(r.customs||0)+(r.coldFee||0)+(r.attestation||0)+(r.repack||0)+(r.waste||0)+(r.other||0)); }, 0);
    var purchaseDate = firstItem.purchaseDate ? fdt(firstItem.purchaseDate+'T00:00:00') : '-';
    
    // 检查是否有入库记录
    var hasInRec = false;
    var coldFeeDisplay = '-';
    for (var i = 0; i < recs.length; i++) {
      if (recs[i].cn === cn && !recs[i].type && recs[i].store === currentColdStore) {
        hasInRec = true;
        var actualFee = calcActualFee(recs[i]);
        var remaining_pallets = recs[i].pallets - (recs[i].pallets_out || 0);
        var isFullyCheckedOut = remaining_pallets === 0 && recs[i].dep;
        if (actualFee > 0) {
          if (isFullyCheckedOut) {
            coldFeeDisplay = '<strong style="color:#0066cc;font-size:15px">' + actualFee.toFixed(2) + '</strong>';
          } else {
            coldFeeDisplay = '<strong style="color:#ff9900;background:#fff8e1;padding:2px 6px;border-radius:3px">' + actualFee.toFixed(2) + '</strong>';
          }
        }
        break;
      }
    }
    
    if (cn === '_empty_') cn = '-';
    
    // 主行：集装箱号 + 展开按钮
    var expandBtn = totalItems > 1 ? 
      '<button type="button" class="abtn" style="background:#f0f0f0;border:1px solid #ddd;padding:2px 6px;font-size:14px" onclick="togglePurchaseGroup(\'' + groupId + '\',this)">+</button>' : '';
    
    var firstProduct = firstItem.product || '-';
    var firstQty = firstItem.qty || '-';
    
    html += '<tr style="background:#f9f9f9;font-weight:bold" id="pur-main-' + groupId + '">' +
      '<td>' + expandBtn + ' <button type="button" class="abtn" style="background:#e8f4ff;border-color:#00bfff;color:#00bfff;padding:2px 6px;font-size:11px" onclick="quickCheckIn(\'' + firstItem.id + '\')">📥</button> ' + cn + ' <span style="color:#999;font-size:11px">(' + totalItems + '品名)</span></td>' +
      '<td style="font-family:Arial;text-transform:capitalize">'+(firstItem.supplier||'-')+'</td><td style="font-family:Arial">'+firstProduct+'</td><td>'+purchaseDate+'</td><td style="font-family:Arial">'+firstQty+'</td><td>-</td>' +
      '<td>-</td><td>-</td><td>'+coldFeeDisplay+'</td><td>-</td><td>-</td><td>-</td><td>-</td>' +
      '<td><strong style="color:#0066cc">'+totalAmount.toFixed(2)+'</strong></td>' +
      '<td><button type="button" class="abtn x" onclick="delPurchaseGroup(\'' + cn + '\')">🗑</button></td></tr>';
    
    // 子行：每个品名
    items.forEach(function(r) {
      var total = (r.demurrage||0)+(r.customs||0)+(r.coldFee||0)+(r.attestation||0)+(r.repack||0)+(r.waste||0)+(r.other||0);
      html += '<tr class="purchase-sub-row ' + groupId + '" style="display:none;background:#fff">' +
        '<td style="padding-left:40px;color:#666">└ '+(r.product||'-')+'</td>' +
        '<td style="font-family:Arial;text-transform:capitalize;color:#666">'+(r.supplier||'-')+'</td><td style="font-family:Arial;text-transform:capitalize">'+(r.product||'-')+'</td><td>-</td><td>'+(r.qty||0)+'</td>' +
        '<td>'+(r.demurrage||0)+'</td><td>'+(r.customs||0)+'</td><td>-</td>' +
        '<td>'+(r.attestation||0)+'</td><td>'+(r.repack||0)+'</td><td>'+(r.waste||0)+'</td><td>'+(r.other||0)+'</td>' +
        '<td><strong style="color:#0066cc">'+total.toFixed(2)+'</strong></td>' +
        '<td><button type="button" class="abtn" onclick="openEditPurchase(\''+r.id+'\')">✏️</button><button type="button" class="abtn x" onclick="delPurchase(\''+r.id+'\')">🗑</button></td></tr>';
    });
  });
  
  tb.innerHTML = html;
}

// 展开/折叠采购组
function togglePurchaseGroup(groupId, btn) { console.log('togglePurchaseGroup:', groupId);
  var rows = document.querySelectorAll('.purchase-sub-row.' + groupId);
  var isExpanded = btn.textContent === '-';
  
  rows.forEach(function(row) {
    row.style.display = isExpanded ? 'none' : '';
  });
  btn.textContent = isExpanded ? '+' : '-';
}

// 删除整组采购记录
function delPurchaseGroup(cn) {
  if (!confirm('确认删除集装箱 ' + cn + ' 的所有采购记录？')) return;
  var toDelete = purchaseRecs.filter(function(r) { return r.cn === cn; });
  toDelete.forEach(function(r) {
    if (purchaseRef) purchaseRef.child(r.id).remove();
  });
}

// ============================================================
// SETTINGS - Supplier & Product Management
// ============================================================
var SETTINGS_KEY = 'csm_settings_v1';
var settData = { suppliers: [], products: [] };

function loadSettings() {
  try {
    var stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) settData = JSON.parse(stored);
  } catch(e) { settData = { suppliers: [], products: [] }; }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settData));
}

function openSettings() {
  loadSettings();
  renderSettList('supplier');
  renderSettList('product');
  renderAccountList();
  loadRatesToSettings();
  gid('settingsModal').classList.add('sh');
}

function clSettings() {
  gid('settingsModal').classList.remove('sh');
}

// ============================================================
// ACCOUNT MANAGEMENT
// ============================================================
function getUsers() {
  try {
    var stored = localStorage.getItem(USERS_KEY);
    if (stored) {
      var data = JSON.parse(stored);
      // 兼容旧格式
      if (typeof data.admin === 'string') {
        var newData = {
          'admin': { password: data.admin, role: 'admin', name: '管理员' }
        };
        saveUsers(newData);
        return newData;
      }
      return data;
    }
    return {
      'admin': { password: 'admin123', role: 'admin', name: '管理员' }
    };
  } catch(e) { 
    return { 
      'admin': { password: 'admin123', role: 'admin', name: '管理员' }
    }; 
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function addAccount() {
  var username = (gid('sett-user-input').value || '').trim();
  var password = (gid('sett-pass-input').value || '').trim();
  var role = gid('sett-role-select') ? gid('sett-role-select').value : 'admin';
  var name = gid('sett-name-input') ? (gid('sett-name-input').value || '').trim() : username;
  
  if (!username) { toast('请输入用户名', 'err'); return; }
  if (!password) { toast('请输入密码', 'err'); return; }
  
  var users = getUsers();
  if (users[username]) { toast('用户名已存在', 'err'); return; }
  
  users[username] = { password: password, role: role, name: name };
  saveUsers(users);
  gid('sett-user-input').value = '';
  gid('sett-pass-input').value = '';
  if (gid('sett-name-input')) gid('sett-name-input').value = '';
  renderAccountList();
  toast('✅ 账号已添加: ' + username + ' (' + (role === 'admin' ? '管理员' : '清关公司') + ')', 'ok');
}

function delAccount(username) {
  if (username === 'admin') { toast('不能删除管理员账号', 'err'); return; }
  if (!confirm('确认删除账号: ' + username + ' ？')) return;
  var users = getUsers();
  delete users[username];
  saveUsers(users);
  renderAccountList();
  toast('✅ 账号已删除: ' + username, 'ok');
}

function renderAccountList() {
  var el = gid('sett-account-list');
  if (!el) return;
  var users = getUsers();
  var html = '';
  for (var u in users) {
    html += '<span class="sett-tag">' + u + 
      ' <span style="color:#999;font-size:11px">****</span>' +
      (u !== 'admin' ? ' <span class="del" onclick="delAccount(\'' + u + '\')">✕</span>' : ' <span style="color:#999;font-size:10px">(管理员)</span>') +
      '</span>';
  }
  el.innerHTML = html || '<div style="color:#999;font-size:12px;padding:4px">暂无数据</div>';
}

function addSettItem(type) {
  var inputId = 'sett-' + type + '-input';
  var val = (gid(inputId).value || '').trim();
  if (!val) return;
  // 首字母大写格式
  val = val.toLowerCase().replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  
  var list = type === 'supplier' ? settData.suppliers : settData.products;
  if (list.indexOf(val) !== -1) {
    toast('已存在: ' + val, 'err');
    return;
  }
  
  if (!confirm('确认添加 ' + (type === 'supplier' ? '供应商' : '品名') + ': ' + val + ' ？')) return;
  
  list.push(val);
  saveSettings();
  gid(inputId).value = '';
  renderSettList(type);
  toast('✅ 已添加: ' + val, 'ok');
}

function delSettItem(type, val) {
  if (!confirm('确认删除 ' + (type === 'supplier' ? '供应商' : '品名') + ': ' + val + ' ？')) return;
  if (type === 'supplier') {
    settData.suppliers = settData.suppliers.filter(function(s) { return s !== val; });
  } else {
    settData.products = settData.products.filter(function(s) { return s !== val; });
  }
  saveSettings();
  renderSettList(type);
  toast('✅ 已删除: ' + val, 'ok');
}

function renderSettList(type) {
  var listId = 'sett-' + type + '-list';
  var el = gid(listId);
  if (!el) return;
  var items = type === 'supplier' ? settData.suppliers : settData.products;
  if (items.length === 0) {
    el.innerHTML = '<div style="color:#999;font-size:12px;padding:4px">暂无数据 / No data</div>';
    return;
  }
  el.innerHTML = items.map(function(item) {
    return '<span class="sett-tag">' + item + ' <span class="del" onclick="delSettItem(\'' + type + '\',\'' + item.replace(/'/g, "\\'") + '\')">✕</span></span>';
  }).join('');
}

// ============================================================
// EDIT PURCHASE RECORD
// ============================================================
function openEditPurchase(id) {
  var r = purchaseRecs.find(function(x) { return x.id === id; });
  if (!r) return;
  gid('fe-id').value = r.id;
  gid('fe-cn').value = r.cn || '';
  gid('fe-supplier').value = r.supplier || '';
  gid('fe-product').value = r.product || '';
  gid('fe-qty').value = r.qty || 0;
  gid('fe-demurrage').value = r.demurrage || 0;
  gid('fe-customs').value = r.customs || 0;
  gid('fe-coldfee').value = r.coldFee || 0;
  gid('fe-attestation').value = r.attestation || 0;
  gid('fe-repack').value = r.repack || 0;
  gid('fe-waste').value = r.waste || 0;
  gid('fe-other').value = r.other || 0;
  gid('editPurchaseModal').classList.add('sh');
}

function clEditPurchaseModal() {
  gid('editPurchaseModal').classList.remove('sh');
}

function saveEditPurchase() {
  var id = gid('fe-id').value;
  var r = purchaseRecs.find(function(x) { return x.id === id; });
  if (!r) return;

  r.cn = (gid('fe-cn').value || '').trim().toUpperCase();
  r.supplier = (gid('fe-supplier').value || '').trim();
  r.product = (gid('fe-product').value || '').trim();
  r.qty = parseFloat(gid('fe-qty').value) || 0;
  r.demurrage = parseFloat(gid('fe-demurrage').value) || 0;
  r.customs = parseFloat(gid('fe-customs').value) || 0;
  r.coldFee = parseFloat(gid('fe-coldfee').value) || 0;
  r.attestation = parseFloat(gid('fe-attestation').value) || 0;
  r.repack = parseFloat(gid('fe-repack').value) || 0;
  r.waste = parseFloat(gid('fe-waste').value) || 0;
  r.other = parseFloat(gid('fe-other').value) || 0;

  // 保存到 Firebase
  if (purchaseRef) {
    purchaseRef.child(id).set(r);
  }
  
  clEditPurchaseModal();
  toast('✅ 采购记录已修改', 'ok');
}

// ============================================================
// QUICK CHECK IN FROM PURCHASE
// ============================================================
var quickInData = null;

function quickCheckIn(purchaseId) { console.log('quickCheckIn called:', purchaseId);
  if (!purchaseRecs || purchaseRecs.length === 0) {
    toast('采购数据未加载，请刷新页面重试', 'err');
    return;
  }
  
  var r = purchaseRecs.find(function(x) { return x.id === purchaseId; });

  if (!r) {
    toast('未找到采购记录', 'err');
    return;
  }

  // 查找同一集装箱号的所有品名
  var sameCnItems = purchaseRecs.filter(function(x) { return x.cn === r.cn; });
  var productSelect = gid('quickInProductSelect');
  var productDropdown = gid('quickInProductDropdown');
  var quickInInfo = gid('quickInInfo');
  
  if (sameCnItems.length > 1) {
    // 多个品名，显示下拉选择（不显示数量）
    productSelect.style.display = 'block';
    quickInInfo.innerHTML = '📦 <strong>' + r.cn + '</strong> | ' + r.supplier + '<br><span style="font-size:11px;color:#999">选择入库品名</span>';
    
    // 填充下拉选项（只显示品名）
    productDropdown.innerHTML = sameCnItems.map(function(item, idx) {
      return '<option value="' + item.id + '">' + (item.product || '品名' + (idx+1)) + '</option>';
    }).join('');
    
    // 保存所有品名数据
    window.quickInMultiData = sameCnItems;
  } else {
    // 单个品名
    productSelect.style.display = 'none';
    quickInInfo.innerHTML = '📦 <strong>' + r.cn + '</strong> | ' + r.supplier + ' | ' + r.product;
    
    // 保存采购记录数据
    quickInData = r;
    window.quickInMultiData = null;
  }

  gid('quickInModal').classList.add('sh');
}

function clQuickInModal() {
  gid('quickInModal').classList.remove('sh');
  quickInData = null;
  window.quickInMultiData = null;
}

var isCheckingIn = false;

function doQuickIn(storeNum) { console.log('doQuickIn called, storeNum:', storeNum, 'quickInData:', quickInData);
  if (isCheckingIn) { console.log('Already checking in, ignoring'); return; }
  isCheckingIn = true;
  // 获取选中的品名
  var selectedData = null;
  
  if (window.quickInMultiData) {
    // 多个品名的情况
    var dropdown = gid('quickInProductDropdown');
    var selectedId = dropdown.value;
    selectedData = window.quickInMultiData.find(function(x) { return x.id === selectedId; });
    
    if (!selectedData) {
      toast('请选择入库品名', 'err');
      isCheckingIn = false;
      return;
    }
  } else if (quickInData) {
    // 单个品名
    selectedData = quickInData;
  }
  
  if (!selectedData) {
    toast('未选择入库信息', 'err');
    isCheckingIn = false;
    return;
  }
  
  console.log('selectedData:', selectedData);
  console.log('selectedData.cn:', selectedData.cn);
  
  // 切换冷库
  selectColdStore(storeNum);
  
  // 自动填入入库表单
  gid('f-cn').value = selectedData.cn || '';
  console.log('f-cn value after set:', gid('f-cn').value);
  gid('f-supplier').value = selectedData.supplier || '';
  gid('f-product').value = selectedData.product || '';
  gid('f-items').value = selectedData.qty || '1';
  gid('f-pallets').value = '1';
  
  // 设置入库日期为今天
  gid('f-at').value = nowFmt();
  
  clQuickInModal();
  
  // 重置入库按钮状态（确保是黄色，等待用户手动确认）
  isCheckingIn = false;
  var checkInBtn = gid('checkInBtn');
  if (checkInBtn) {
    checkInBtn.classList.remove('btn-g');
    checkInBtn.classList.add('btn-s');
    checkInBtn.innerHTML = '✓ 入库 Check In';
    checkInBtn.disabled = false;
  }
  
  // 切换到库存记录 tab，让用户手动点击入库按钮确认
  swTab('records');
  
  // 滚动到入库表单
  document.querySelector('.left').scrollTop = 0;
}

// ============================================================
// AUTOCOMPLETE SUGGEST
// ============================================================
function showSuggest(inputEl, type) {
  var val = (inputEl.value || '').trim().toLowerCase();
  var list = type === 'supplier' ? settData.suppliers : settData.products;
  var suggestEl = gid('suggest-' + type);
  if (!suggestEl || list.length === 0) { return; }

  var filtered = val ? list.filter(function(item) {
    return item.toLowerCase().indexOf(val) !== -1;
  }) : list;

  if (filtered.length === 0) {
    suggestEl.classList.remove('show');
    suggestEl.innerHTML = '';
    return;
  }

  suggestEl.innerHTML = filtered.map(function(item) {
    return '<div class="suggest-item" onmousedown="pickSuggest(this,\'' + type + '\')">' + item + '</div>';
  }).join('');
  suggestEl.classList.add('show');
}

// 品名表格行的模糊搜索
var purchaseItemRowCounter = 1;

function showSuggestPurchaseItem(inputEl) {
  var val = (inputEl.value || '').trim().toLowerCase();
  var rowId = inputEl.getAttribute('data-rowid');
  var suggestEl = gid('suggest-purchase-item-' + rowId);
  if (!suggestEl || settData.products.length === 0) return;

  var filtered = val ? settData.products.filter(function(item) {
    return item.toLowerCase().indexOf(val) !== -1;
  }) : settData.products;

  if (filtered.length === 0) {
    suggestEl.classList.remove('show');
    suggestEl.innerHTML = '';
    return;
  }

  suggestEl.innerHTML = filtered.map(function(item) {
    return '<div class="suggest-item" onmousedown="pickSuggestPurchaseItem(this,\'' + rowId + '\')">' + item + '</div>';
  }).join('');
  suggestEl.classList.add('show');
}

function pickSuggestPurchaseItem(el, rowId) {
  var val = el.textContent;
  var inputEl = document.querySelector('.item-product[data-rowid="' + rowId + '"]');
  if (inputEl) inputEl.value = val;
  hideSuggest('purchase-item-' + rowId);
}

function hideSuggest(type) {
  var suggestEl = gid('suggest-' + type);
  if (suggestEl) suggestEl.classList.remove('show');
}

function pickSuggest(el, type) {
  var val = el.textContent;
  if (type === 'supplier') {
    gid('fp-supplier').value = val;
  } else {
    gid('fp-product').value = val;
  }
  hideSuggest(type);
}

function showSuggestEdit(inputEl, type) {
  var val = (inputEl.value || '').trim().toLowerCase();
  var list = type === 'supplier' ? settData.suppliers : settData.products;
  var suggestEl = gid('suggest-edit-' + type);
  if (!suggestEl || list.length === 0) return;

  var filtered = val ? list.filter(function(item) {
    return item.toLowerCase().indexOf(val) !== -1;
  }) : list;

  if (filtered.length === 0) {
    suggestEl.classList.remove('show');
    suggestEl.innerHTML = '';
    return;
  }

  suggestEl.innerHTML = filtered.map(function(item) {
    return '<div class="suggest-item" onmousedown="pickSuggestEdit(this,\'' + type + '\')">' + item + '</div>';
  }).join('');
  suggestEl.classList.add('show');
}

function pickSuggestEdit(el, type) {
  var val = el.textContent;
  if (type === 'supplier') {
    gid('fe-supplier').value = val;
  } else {
    gid('fe-product').value = val;
  }
  hideSuggest('edit-' + type);
}

// ============================================================
// CHECKOUT CONTAINER SUGGEST
// ============================================================
function showSuggestCn(inputEl) {
  var val = (inputEl.value || '').trim().toUpperCase();
  var suggestEl = gid('suggest-checkout-cn');
  if (!suggestEl) return;

  // 只显示当前冷库在库的集装箱
  var inRecs = recs.filter(function(r) {
    return r.store === currentColdStore && !r.dep;
  });

  var filtered = val ? inRecs.filter(function(r) {
    return r.cn.toUpperCase().indexOf(val) !== -1;
  }) : inRecs;

  if (filtered.length === 0) {
    suggestEl.classList.remove('show');
    suggestEl.innerHTML = '';
    return;
  }

  suggestEl.innerHTML = filtered.map(function(r) {
    return '<div class="suggest-item" onmousedown="pickCnSuggest(this)" style="font-size:12px">' +
      '<strong>' + r.cn + '</strong> <span style="color:#999">| ' + r.product + ' | 剩余托盘: ' + (r.pallets - (r.pallets_out||0)) + '</span></div>';
  }).join('');
  suggestEl.classList.add('show');
}

function pickCnSuggest(el) {
  var text = el.textContent;
  var cn = text.split('|')[0].trim();
  gid('f-cno').value = cn;
  hideSuggest('checkout-cn');
}

// ============================================================
// CUSTOMS COMPANY FUNCTIONS
// ============================================================
var LOGISTICS_KEY = 'csm_customs_fees';

function getLogisticsFees() {
  try {
    var stored = localStorage.getItem(LOGISTICS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch(e) { return []; }
}

function saveLogisticsFees(fees) {
  localStorage.setItem(LOGISTICS_KEY, JSON.stringify(fees));
}

function openLogisticsAddForm(id) {
  gid('logisticsModalTitle').textContent = id ? '编辑物流费用' : '添加物流费用';
  gid('logistics-cn').value = '';
  gid('logistics-date').value = '';
  gid('logistics-fee').value = '0';
  gid('logistics-discount').value = '0';
  gid('logistics-remark').value = '';
  gid('logistics-id').value = id || '';
  
  if (id) {
    var fees = getLogisticsFees();
    var fee = fees.find(function(f) { return f.id === id; });
    if (fee) {
      gid('logistics-cn').value = fee.cn || '';
      gid('logistics-date').value = fee.product || '';
      gid('logistics-fee').value = fee.fee || 0;
      gid('logistics-discount').value = fee.discount || 0;
      gid('logistics-remark').value = fee.remark || '';
    }
  }
  
  gid('logisticsModal').classList.add('sh');
}

function clLogisticsModal() {
  gid('logisticsModal').classList.remove('sh');
}

function saveLogisticsFee() {
  var cn = (gid('logistics-cn').value || '').trim().toUpperCase();
  var addDate = (gid('logistics-date').value || '').trim();
  var fee = parseFloat(gid('logistics-fee').value) || 0;
  var discount = parseFloat(gid('logistics-discount').value) || 0;
  var remark = (gid('logistics-remark').value || '').trim();
  var id = gid('logistics-id').value;
  
  if (!cn) { toast('请输入集装箱号 / Enter container no.', 'err'); return; }
  if (!addDate) { toast('请选择日期 / Select date', 'err'); return; }
  
  var fees = getLogisticsFees();
  
  if (id) {
    var idx = fees.findIndex(function(f) { return f.id === id; });
    if (idx !== -1) {
      fees[idx].cn = cn;
      fees[idx].addDate = addDate;
      fees[idx].fee = fee;
      fees[idx].discount = discount;
      fees[idx].remark = remark;
      fees[idx].updatedBy = currentUser;
      fees[idx].updateTime = new Date().toISOString();
      fees[idx].confirmed = false;
    }
    toast('✅ 物流费用已更新 / Updated', 'ok');
  } else {
    fees.push({
      id: Date.now().toString(),
      cn: cn,
      addDate: addDate,
      fee: fee,
      discount: discount,
      remark: remark,
      addedBy: currentUser,
      addTime: new Date().toISOString(),
      confirmed: false,
      confirmedBy: null,
      confirmTime: null
    });
    toast('✅ 物流费用已添加 / Added', 'ok');
  }
  
  saveLogisticsFees(fees);
  clLogisticsModal();
  renderLogisticsTable();
}

function delLogisticsFee(id) {
  if (!confirm('确认删除这条物流记录？')) return;
  var fees = getLogisticsFees();
  fees = fees.filter(function(f) { return f.id !== id; });
  saveLogisticsFees(fees);
  renderLogisticsTable();
}

function confirmLogisticsFee(id) {
  var fees = getLogisticsFees();
  var idx = fees.findIndex(function(f) { return f.id === id; });
  if (idx !== -1) {
    fees[idx].confirmed = true;
    fees[idx].confirmedBy = currentUser;
    fees[idx].confirmTime = new Date().toISOString();
    saveLogisticsFees(fees);
    renderLogisticsTable();
    toast('✅ 已确认物流费用 / Confirmed', 'ok');
  }
}

function unconfirmLogisticsFee(id) {
  var fees = getLogisticsFees();
  var idx = fees.findIndex(function(f) { return f.id === id; });
  if (idx !== -1) {
    fees[idx].confirmed = false;
    fees[idx].confirmedBy = null;
    fees[idx].confirmTime = null;
    saveLogisticsFees(fees);
    renderLogisticsTable();
    toast('✅ 已取消确认 / Unconfirmed', 'ok');
  }
}

function filterLogisticsTable() {
  renderLogisticsTable();
}

function renderLogisticsTable() {
  var tb = gid('tb-logistics');
  var es = gid('es-logistics');
  if (!tb || !es) return;
  
  var searchVal = (gid('logistics-search-cn').value || '').trim().toUpperCase();
  var fees = getLogisticsFees();
  
  if (searchVal) {
    fees = fees.filter(function(f) {
      return (f.cn || '').toUpperCase().indexOf(searchVal) !== -1 ||
             (f.addDate || '').indexOf(searchVal) !== -1;
    });
  }
  
  if (fees.length === 0) {
    tb.innerHTML = '';
    es.style.display = 'block';
    return;
  }
  es.style.display = 'none';
  
  var html = fees.map(function(f) {
    var statusText = f.confirmed ? '<span style="color:#00aa00;font-weight:bold;background:#e8f5e9;padding:2px 8px;border-radius:4px">APPROVED</span>' : '<span style="color:#ff9900;background:#fff8e1;padding:2px 8px;border-radius:4px">PENDING</span>';
    var statusClass = f.confirmed ? 'background:#e8f5e9' : 'background:#fff8e1';
    
    var actionBtns = '';
    if (isAdmin) {
      if (f.confirmed) {
        actionBtns = '<button class="abtn" onclick="unconfirmLogisticsFee(\'' + f.id + '\')" style="color:#ff9900">取消确认</button> ';
      } else {
        actionBtns = '<button class="abtn" onclick="confirmLogisticsFee(\'' + f.id + '\')" style="background:#4CAF50;color:#fff;border:none;padding:2px 8px;border-radius:3px">确认</button> ';
      }
    }
    actionBtns += '<button class="abtn" onclick="openLogisticsAddForm(\'' + f.id + '\')">✏️</button> <button class="abtn x" onclick="delLogisticsFee(\'' + f.id + '\')">🗑</button>';
    
    var purchaseMatch = '';
    var matchedPurchase = purchaseRecs.find(function(p) { return p.cn === f.cn; });
    if (matchedPurchase) {
      purchaseMatch = '<span style="background:#e8f5e9;color:#00aa00;font-size:10px;padding:1px 4px;border-radius:2px;margin-left:4px">采购</span>';
    }
    
    return '<tr style="' + statusClass + '">' +
      '<td><strong>' + (f.cn || '-') + '</strong>' + purchaseMatch + '</td>' +
      '<td>' + (f.addDate || '-') + '</td>' +
      '<td>' + f.fee.toFixed(2) + ' AED</td>' +
      '<td style="color:#ff4444">-' + f.discount.toFixed(2) + ' AED</td>' +
      '<td>' + statusText + '</td>' +
      '<td>' + actionBtns + '</td></tr>';
  }).join('');
  
  var totalFee = fees.reduce(function(s, f) { return s + (f.fee || 0); }, 0);
  var totalDiscount = fees.reduce(function(s, f) { return s + (f.discount || 0); }, 0);
  
  tb.innerHTML = html + '<tr style="background:#e8f5e9;font-weight:bold"><td colspan="2">📊 总计 Total</td><td>' + totalFee.toFixed(2) + ' AED</td><td style="color:#ff4444">-' + totalDiscount.toFixed(2) + ' AED</td><td></td><td></td></tr>';
}

function getPurchaseContainers() {
  var containers = [];
  var seen = {};
  purchaseRecs.forEach(function(p) {
    if (p.cn && !seen[p.cn]) {
      seen[p.cn] = true;
      containers.push({
        cn: p.cn,
        product: p.product,
        supplier: p.supplier,
        qty: p.qty
      });
    }
  });
  return containers.sort(function(a, b) { return a.cn.localeCompare(b.cn); });
}

function openLogisticsFromPurchase() {
  var containers = getPurchaseContainers();
  var modal = gid('logisticsFromPurchaseModal');
  var list = gid('logistics-purchase-list');
  
  if (containers.length === 0) {
    toast('暂无采购记录 / No purchase records', 'err');
    return;
  }
  
  list.innerHTML = containers.map(function(c) {
    var existingFee = getLogisticsFees().find(function(f) { return f.cn === c.cn; });
    var badge = existingFee ? '<span style="background:#4CAF50;color:#fff;font-size:10px;padding:1px 4px;border-radius:2px">已添加</span>' : '';
    
    return '<div style="padding:8px 12px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center">' +
      '<div><strong>' + c.cn + '</strong><br><span style="font-size:12px;color:#666">' + (c.product || '-') + '</span></div>' +
      '<div>' + badge + ' <button class="abtn" style="background:#4CAF50;color:#fff;border:none;padding:4px 8px;border-radius:3px" onclick="selectLogisticsCn(\'' + c.cn + '\')">+ 添加</button></div>' +
      '</div>';
  }).join('');
  
  modal.classList.add('sh');
}

function clLogisticsFromPurchaseModal() {
  gid('logisticsFromPurchaseModal').classList.remove('sh');
}

function selectLogisticsCn(cn) {
  clLogisticsFromPurchaseModal();
  openLogisticsAddForm('');
  gid('logistics-cn').value = cn;
}

















