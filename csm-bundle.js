// ============================================================
// CONFIG
// ============================================================
const SK = 'csm_warehouse1';const LOCAL_STORAGE_KEY = 'csm_records_v3';
// Firebase 配置
var firebaseConfig = {  apiKey: 'AIzaSyDOdn2Vzv3EvW_EbtGFp8mzhXLfjlVsN24',  authDomain: 'superharves-cold-store.firebaseapp.com',  databaseURL: 'https://superharves-cold-store-default-rtdb.firebaseio.com',  projectId: 'superharves-cold-store',  storageBucket: 'superharves-cold-store.firebasestorage.app',  messagingSenderId: '379038228954',  appId: '1:379038228954:web:e64fa3be3f2f49b3aae0e3'};var dbRef = null;var legacyDbRef = null;var purchaseRef = null;var salesCustomersRef = null;var salesOrdersRef = null;var auth = null;var primaryRecsVal = {};var legacyRecsVal = {};
var salesCustomers = [];var salesOrders = [];var salesSubView = 'dash';
// 冷库费率（可配置，默认值）
// HK Store (store 1): 38 AED/托盘/周 + 5% VAT
// Primer / Super / Cold Store 4 (store 2–4): 60 AED/托盘/周 + 5% VAT
const VAT_RATE = 0.05;
const DAYS_PER_WEEK = 7;const RATES_KEY = 'csm_warehouse_rates';
// 默认费率
var warehouseRates = {  1: 38,  2: 60,  3: 60,  4: 60};
// 从localStorage加载费率
function loadRates() {  try {    var stored = localStorage.getItem(RATES_KEY);    if (stored) {      warehouseRates = JSON.parse(stored);    }  } catch(e) {    console.log('Failed to load rates, using defaults');  }}
// 保存费率到localStorage
function saveRatesToStorage() {
try {    localStorage.setItem(RATES_KEY, JSON.stringify(warehouseRates));  } catch(e) {    console.error('Failed to save rates');  }}
// 根据冷库获取费率
function getRateByStore(store) {  return warehouseRates[store] || 38;}
var CSM_STORE_NAMES = { 1: 'HK Store', 2: 'Primer Store', 3: 'Super Store', 4: 'Cold Store 4' };
function getStoreDisplayName(store) {
  var n = parseInt(String(store), 10);
  if (CSM_STORE_NAMES[n]) return CSM_STORE_NAMES[n];
  if (store === null || store === undefined || store === '') return '-';
  return 'Store ' + String(store);
}
// 保存费率设置
function saveRates() {  warehouseRates[1] = parseFloat(gid('rate-store1').value) || 38;  warehouseRates[2] = parseFloat(gid('rate-store2').value) || 60;  warehouseRates[3] = parseFloat(gid('rate-store3').value) || 60;  warehouseRates[4] = parseFloat(gid('rate-store4').value) || 60;  saveRatesToStorage();  clSettings();  renderAll();  toast('✅ 费率已保存', 'ok');}
// 在设置面板中显示当前费率
function loadRatesToSettings() {  gid('rate-store1').value = warehouseRates[1];  gid('rate-store2').value = warehouseRates[2];  gid('rate-store3').value = warehouseRates[3];  gid('rate-store4').value = warehouseRates[4];}
// ============================================================
// STATE
// ============================================================
var recs = [];var currentColdStore = 1;var currentUser = null;var currentUserEmail = null;var isAdmin = false;var isLogistics = false;var isSupplier = false;var currentSupplierName = null; 
// 管理员主界面：Warehouse1 / Warehouse2 / 公司财务 一键切换
var currentMainSuite = 'w1'; 
// 供应商自己的名称（用于在采购记录中识别）
var pendingLoginError = null;var USERS_KEY = 'csm_users_v2';
var activeDataListeners = [];
var supplierOwnedSnapshot = {};
function bindValueListener(ref, handler) {
  if (!ref || typeof ref.on !== 'function') return;
  ref.on('value', handler);
  activeDataListeners.push({ ref: ref, handler: handler });
}
function detachDataListeners() {
  activeDataListeners.forEach(function(binding) {
    try { binding.ref.off('value', binding.handler); } catch (e) {}
  });
  activeDataListeners = [];
  supplierOwnedSnapshot = {};
}
function rebuildMergedRecs() {
  var data = {};
  Object.keys(legacyRecsVal || {}).forEach(function(k) { data[k] = legacyRecsVal[k]; });
  Object.keys(primaryRecsVal || {}).forEach(function(k) {
    var prev = data[k];
    data[k] = prev ? Object.assign({}, prev, primaryRecsVal[k]) : primaryRecsVal[k];
  });
  recs = Object.keys(data).map(function(k) {
    var row = Object.assign({}, data[k]);
    row.id = k;
    return row;
  });
  renderAll();
  backfillSeq();
}
function updatePurchaseRecsFromData(data) {
  purchaseRecs = [];
  Object.keys(data || {}).forEach(function(k) {
    var item = Object.assign({}, data[k] || {});
    item.id = k;
    purchaseRecs.push(item);
  });
  renderPurchase();
  backfillPurchaseSeq();
}
function updateSupplierRecsFromData(data, canMigrateStatus) {
  supplierRecs = [];
  var hasMigration = false;
  Object.keys(data || {}).forEach(function(k) {
    var item = Object.assign({}, data[k] || {});
    item.id = k;
    if (!item.status) {
      item.status = 'draft';
      hasMigration = true;
    }
    supplierRecs.push(item);
  });
  if (canMigrateStatus) {
    supplierRecs.forEach(function(r) {
      if (r.id && (!r.status || r.status === 'draft')) {
        supplierRef.child(r.id).update({ status: 'draft' }).catch(function() {});
      }
    });
  }
  if (isAdmin || isLogistics) {
    renderPurchase();
  }
  if (isSupplier) renderSupplierTable();
}
function mergeSupplierScopedData() {
  var merged = {};
  Object.keys(supplierOwnedSnapshot || {}).forEach(function(k) { merged[k] = supplierOwnedSnapshot[k]; });
  updateSupplierRecsFromData(merged, false);
}
function supplierRecOwnedByCurrentUser(rec) {
  if (!rec) return false;
  if (rec.ownerUid && currentUser && rec.ownerUid === currentUser) return true;
  if (!rec.ownerUid && currentSupplierName && String(rec.supplier || '').trim() === String(currentSupplierName).trim()) return true;
  return false;
}
function attachDataListenersForRole() {
  detachDataListeners();
  primaryRecsVal = {};
  legacyRecsVal = {};
  purchaseRecs = [];
  supplierRecs = [];
  if (isAdmin || isLogistics) {
    bindValueListener(dbRef, function(snap) {
      primaryRecsVal = snap.val() || {};
      rebuildMergedRecs();
    });
    if (legacyDbRef) {
      bindValueListener(legacyDbRef, function(snap) {
        legacyRecsVal = snap.val() || {};
        rebuildMergedRecs();
      });
    }
    bindValueListener(purchaseRef, function(snap) {
      updatePurchaseRecsFromData(snap.val() || {});
    });
  }
  if (isAdmin || isLogistics) {
    bindValueListener(supplierRef, function(snap) {
      updateSupplierRecsFromData(snap.val() || {}, isAdmin);
    });
    if (isAdmin && salesCustomersRef && salesOrdersRef) {
      bindValueListener(salesCustomersRef, function(snap) {
        salesCustomers = csmSalesObjToArr(snap.val(), false);
        refreshSalesUi();
      });
      bindValueListener(salesOrdersRef, function(snap) {
        salesOrders = csmSalesObjToArr(snap.val(), true);
        refreshSalesUi();
      });
    }
    return;
  }
  if (isSupplier) {
    if (supplierRef && currentUser) {
      bindValueListener(supplierRef.orderByChild('ownerUid').equalTo(currentUser), function(snap) {
        supplierOwnedSnapshot = snap.val() || {};
        mergeSupplierScopedData();
      });
    }
  }
}
function createPurchaseRecordFromSupplierRec(rec, id, item) {
  var sourceItem = item || (typeof normalizeSupplierRecItems === 'function' ? normalizeSupplierRecItems(rec)[0] : null) || {
    product: rec.product || '',
    qty: rec.qty || 0
  };
  return {
    id: id,
    seq: rec.seq || '',
    cn: rec.cn || '',
    supplier: rec.supplier || '',
    product: sourceItem.product || rec.product || '',
    purchaseDate: rec.purchaseDate || '',
    qty: sourceItem.qty || rec.qty || 0,
    demurrage: 0,
    customs: 0,
    coldFee: 0,
    attestation: 0,
    repack: 0,
    waste: 0,
    other: 0,
    shipname: rec.shipname || '',
    bl: rec.bl || '',
    etd: rec.etd || '',
    eta: rec.eta || '',
    sourceSupplierRecId: rec.id || ''
  };
}
function makePurchaseRecordId() {
  return 'pur_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
// ============================================================
// SEQUENCE NUMBER GENERATOR
// ============================================================
var seqCounterRef = null;function generateSeq(cb, dateOverride) {  
// seq format: YYYYMMDD + 3-digit daily counter (e.g. 20260410001)  
// dateOverride: optional Date object to use instead of today (for purchase/checkout dates)  
if (!dbRef) { cb && cb(''); return; }  if (!seqCounterRef) {    seqCounterRef = dbRef.parent.child('csm_seq_counter');  }  var useDate = dateOverride || new Date();  var y = useDate.getFullYear();  var m = ('0' + (useDate.getMonth() + 1)).slice(-2);  var d = ('0' + (useDate.getDate())).slice(-2);  var dateStr = '' + y + m + d; 
// e.g. "20260410"
seqCounterRef.once('value').then(
function(snap) {    var data = snap.val() || {};    var cnt = (data[dateStr] || 0) + 1;    seqCounterRef.child(dateStr).set(cnt).then(function() {      var seq = dateStr + ('00' + cnt).slice(-3);      cb && cb(seq);    });  }).catch(function() {    cb && cb(dateStr + '001');  });}
// 为已有记录补充 seq（根据入库日期生成）
function backfillSeq() {  if (!dbRef || !seqCounterRef) return;  var recsWithoutSeq = recs.filter(function(r) { return !r.seq && !r.type; });  if (recsWithoutSeq.length === 0) return;  console.log('Backfilling seq for', recsWithoutSeq.length, 'records');  
// 按入库日期排序，依次分配序号  
recsWithoutSeq.sort(function(a, b) { return new Date(a.arr) - new Date(b.arr); });  
// 按日期分组统计  
var byDate = {};  recsWithoutSeq.forEach(function(r) {    var d = new Date(r.arr);    var y = d.getFullYear();    var m = ('0' + (d.getMonth() + 1)).slice(-2);    var dd = ('0' + d.getDate()).slice(-2);    var key = '' + y + m + dd;    byDate[key] = (byDate[key] || 0) + 1;  });  
// 获取当前计数器  
seqCounterRef.once('value').then(function(snap) {    var counters = Object.assign({}, snap.val() || {});    var batch = {};    var pending = recsWithoutSeq.length;    recsWithoutSeq.forEach(function(r) {      var d = new Date(r.arr);      var y = d.getFullYear();      var m = ('0' + (d.getMonth() + 1)).slice(-2);      var dd = ('0' + d.getDate()).slice(-2);      var key = '' + y + m + dd;      counters[key] = (counters[key] || 0) + 1;      var seq = key + ('00' + counters[key]).slice(-3);      batch['csm_seq_counter/' + key] = counters[key];      batch['csm_records_v3/' + r.id + '/seq'] = seq;    });    
// 批量写入    
dbRef.parent.update(batch).then(function() {      console.log('Backfill complete');    }).catch(function(e) {      console.error('Backfill error:', e);    });  });}
// 为已有出库记录补充 seq（根据出库日期生成）
function backfillCheckoutSeq() {  if (!dbRef || !seqCounterRef) return;  var recsWithoutSeq = recs.filter(function(r) { return r.type === 'checkout' && !r.seq; });  if (recsWithoutSeq.length === 0) return;  console.log('Backfilling checkout seq for', recsWithoutSeq.length, 'records');  recsWithoutSeq.sort(function(a, b) { return new Date(a.dep || 0) - new Date(b.dep || 0); });  seqCounterRef.once('value').then(function(snap) {    var counters = Object.assign({}, snap.val() || {});    var batch = {};    recsWithoutSeq.forEach(function(r) {      var d = r.dep ? new Date(r.dep) : new Date();      var y = d.getFullYear();      var m = ('0' + (d.getMonth() + 1)).slice(-2);      var dd = ('0' + (d.getDate())).slice(-2);      var key = '' + y + m + dd;      counters[key] = (counters[key] || 0) + 1;      var seq = key + ('00' + counters[key]).slice(-3);      batch['csm_seq_counter/' + key] = counters[key];      batch['csm_records_v3/' + r.id + '/seq'] = seq;    });    dbRef.parent.update(batch).then(function() {      console.log('Checkout backfill complete');    }).catch(function(e) {      console.error('Checkout backfill error:', e);    });  });}
// 为已有采购记录补充 seq（根据采购日期生成）
function backfillPurchaseSeq() {  if (!purchaseRef || !seqCounterRef) return;  var recsWithoutSeq = purchaseRecs.filter(function(r) { return !r.seq; });  if (recsWithoutSeq.length === 0) return;  console.log('Backfilling purchase seq for', recsWithoutSeq.length, 'records');  recsWithoutSeq.sort(function(a, b) { return new Date(a.purchaseDate || 0) - new Date(b.purchaseDate || 0); });  seqCounterRef.once('value').then(function(snap) {    var counters = Object.assign({}, snap.val() || {});    var batch = {};    recsWithoutSeq.forEach(function(r) {      var d = r.purchaseDate ? new Date(r.purchaseDate + 'T00:00:00') : new Date();      var y = d.getFullYear();      var m = ('0' + (d.getMonth() + 1)).slice(-2);      var dd = ('0' + (d.getDate())).slice(-2);      var key = '' + y + m + dd;      counters[key] = (counters[key] || 0) + 1;      var seq = key + ('00' + counters[key]).slice(-3);      batch['csm_seq_counter/' + key] = counters[key];      batch['csm_purchase/' + r.id + '/seq'] = seq;    });    dbRef.parent.update(batch).then(function() {      console.log('Purchase backfill complete');    }).catch(function(e) {      console.error('Purchase backfill error:', e);    });  });}
// ============================================================
// INIT
// ============================================================
(function () {  function csmBoot() {    initFirebase();    setDefTimes();    loadSettings();  }  if (document.readyState === 'loading') {    window.addEventListener('DOMContentLoaded', csmBoot);  } else {    csmBoot();  }})();function initFirebase() {  if (typeof firebase !== 'undefined' && firebase.initializeApp) {    initApp();    return;  }  var ver = '10.14.1';  var bases = ['https://cdn.jsdelivr.net/npm/firebase@' + ver + '/', 'https://www.gstatic.com/firebasejs/' + ver + '/'];  function loadScriptsSequential(urls, i, onOk, onFail) {    if (i >= urls.length) { onOk(); return; }    var s = document.createElement('script');    s.src = urls[i];    s.onload = function() { loadScriptsSequential(urls, i + 1, onOk, onFail); };    s.onerror = function() { onFail(); };    document.head.appendChild(s);  }  function tryBase(bi) {    if (bi >= bases.length) {      toast('❌ Firebase 无法加载，请换网络或稍后再试', 'err');      showLoginModal();      return;    }    var b = bases[bi];    var urls = [b + 'firebase-app-compat.js', b + 'firebase-database-compat.js', b + 'firebase-auth-compat.js'];    loadScriptsSequential(urls, 0, function() { initApp(); }, function() { tryBase(bi + 1); });  }  tryBase(0);}function initApp() {  if (window.__csmInitDone) return;  window.__csmInitDone = true;  
// 加载保存的费率  
loadRates();  try {    if (!firebase.apps || !firebase.apps.length) { firebase.initializeApp(firebaseConfig); }    auth = firebase.auth();    try { window.csmAuth = auth; } catch (e1) {}    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});    dbRef = firebase.database().ref(SK);    purchaseRef = firebase.database().ref('csm_purchase');    supplierRef = firebase.database().ref('csm_supplier_recs');    salesCustomersRef = firebase.database().ref('csm_sales_w1/customers');    salesOrdersRef = firebase.database().ref('csm_sales_w1/orders');    legacyDbRef = (SK !== LOCAL_STORAGE_KEY) ? firebase.database().ref(LOCAL_STORAGE_KEY) : null;    
// 初始化序号计数器引用（必须在这里做，避免 onAuthStateChanged 同步触发时 seqCounterRef 为 null）
seqCounterRef = dbRef.parent.child('csm_seq_counter');    
// Firebase Auth 状态监听    
auth.onAuthStateChanged(function(user) {      if (user) {        
// 用户已登录        
console.log('Firebase Auth: User logged in', user.email);        currentUser = user.uid;        currentUserEmail = user.email;        setLoginVerifyTimer();        
// 登录弹窗在资料校验通过后再关闭，避免「闪一下又退回登录」        
// 获取用户角色（异步，精确更新显示）        
var usersRef = firebase.database().ref('csm_users/' + user.uid);        usersRef.once('value').then(function(snap) {          var userData = snap.val();          var userDisplay = gid('currentUserDisplay');          var rootRef = firebase.database().ref();          function applyProfile(ud) {            ud = ud || {};            var r = String(ud.role != null ? ud.role : '').toLowerCase().replace(/\s/g, '');            isAdmin = r === 'admin';            isLogistics = r === 'logistics';            isSupplier = r === 'supplier';            currentSupplierName = ud.supplierName || null;            attachDataListenersForRole();            var newRoleText = isLogistics ? '物流公司' : (isSupplier ? '供应商' : '管理员');            if (userDisplay) { userDisplay.textContent = (user.email || 'User') + ' (' + newRoleText + ')'; }            if (isLogistics) { showLogisticsView(); }            else if (isSupplier) { showSupplierView(); }            else { isAdmin = true; showAdminView(); }          }          function bootstrapFirstAdmin() {            var profile = { email: user.email || '', role: 'admin', createdAt: firebase.database.ServerValue.TIMESTAMP };            var upd = {};            upd['csm_users/' + user.uid] = profile;            upd['csm_meta/site_initialized'] = true;            rootRef.update(upd).then(function() {              clearLoginVerifyTimer();              try {                applyProfile(profile);                toast('✅ 首次登录：已创建管理员', 'ok');                var lm0 = gid('loginModal');                if (lm0) { lm0.style.display = 'none'; lm0.classList.remove('sh'); }                var le0 = gid('login-error');                if (le0) { le0.style.display = 'none'; le0.style.color = ''; }              } catch (uiErr2) {                console.error('csm first-admin UI error', uiErr2);                pendingLoginError = '已写入管理员资料，但界面加载失败：' + (uiErr2 && uiErr2.message ? uiErr2.message : String(uiErr2));                toast('界面加载失败', 'err');                clearLoginVerifyTimer();                auth.signOut();              }            }).catch(function(e) {              console.error(e);              pendingLoginError = '首次初始化写入失败：' + (e.message || e) + '。规则需允许：已登录用户 update 写入 csm_users 下自己的节点，以及 csm_meta/site_initialized。';              toast('❌ 数据库写入失败', 'err');              clearLoginVerifyTimer();              auth.signOut();            });          }          if (userData) {            clearLoginVerifyTimer();            try {              applyProfile(userData);              toast('✅ 欢迎 ' + (user.email || 'User'), 'ok');              var lmOk = gid('loginModal');              if (lmOk) { lmOk.style.display = 'none'; lmOk.classList.remove('sh'); }              var leOk = gid('login-error');              if (leOk) { leOk.style.display = 'none'; leOk.style.color = ''; }            } catch (uiErr) {              console.error('csm login UI error', uiErr);              pendingLoginError = '登录成功但界面加载失败：' + (uiErr && uiErr.message ? uiErr.message : String(uiErr)) + '。请打开控制台查看 csm login UI error。';              toast('界面加载失败', 'err');              clearLoginVerifyTimer();              auth.signOut();            }          } else {            rootRef.child('csm_meta/site_initialized').once('value').then(function(metaSnap) {              if (metaSnap.val() === true) {                pendingLoginError = '您的账号未在 csm_users 中登记。请让管理员在「设置 → 用户管理」中添加，或在 Firebase 控制台手动添加 csm_users/' + user.uid;                toast('⚠️ 账号未注册', 'err');                clearLoginVerifyTimer();                auth.signOut();                return;              }              rootRef.child('csm_users').once('value').then(function(allSnap) {                var all = allSnap.val() || {};                var n = Object.keys(all).length;                if (n > 0) {                  rootRef.child('csm_meta/site_initialized').set(true).catch(function() {});                  pendingLoginError = '数据库里已有 ' + n + ' 个用户资料，但当前账号未登记。请管理员在「用户管理」中添加您，或手动写入 csm_users/' + user.uid;                  toast('⚠️ 账号未注册', 'err');                  clearLoginVerifyTimer();                  auth.signOut();                } else {                  bootstrapFirstAdmin();                }              }).catch(function(e) {                console.error(e);                pendingLoginError = '无法读取 csm_users（常被数据库规则拦截）。请在规则中为 csm_users 增加 ".read": "auth != null"，或手动在控制台添加 csm_users 节点与 csm_meta/site_initialized=true。详情：' + (e.message || e);                toast('❌ 无法校验用户表', 'err');                clearLoginVerifyTimer();                auth.signOut();              });            }).catch(function(e) {              console.error(e);              pendingLoginError = '无法读取 csm_meta/site_initialized：' + (e.message || e) + '。请在规则中为 csm_meta 增加已登录可读。';              toast('❌ 数据库读取失败', 'err');              clearLoginVerifyTimer();              auth.signOut();            });          }        }).catch(function(e) {          console.error('csm_users profile read error', e);          var permHint = (e && e.code === 'PERMISSION_DENIED') ? '（PERMISSION_DENIED：请在 Realtime Database 规则中允许已登录用户读取 csm_users 与 csm_meta。）' : '';          pendingLoginError = '读取个人资料失败：' + (e.message || e) + permHint + ' 路径：csm_users/' + (firebase.auth().currentUser && firebase.auth().currentUser.uid);          toast('❌ 读取用户失败', 'err');          clearLoginVerifyTimer();          auth.signOut();        });      } else {        clearLoginVerifyTimer();        
// 用户未登录，显示登录弹窗        
console.log('Firebase Auth: User not logged in');        currentUser = null;        currentUserEmail = null;        isAdmin = false;        isLogistics = false;        isSupplier = false;        currentSupplierName = null;        currentMainSuite = 'w1';        try { sessionStorage.removeItem('csm_main_suite'); } catch (eAu) {}        var shellAu = gid('adminPortalShell');        if (shellAu) { shellAu.style.display = 'none'; shellAu.setAttribute('aria-hidden', 'true'); }        if (typeof resetMainSuiteForNonAdmin === 'function') resetMainSuiteForNonAdmin();        var h1Au = gid('headerTitle');        var hpAu = gid('headerSubtitle');        if (h1Au) h1Au.textContent = '🧊 迪拜大丰收冷库管理系统';        if (hpAu) hpAu.textContent = 'Super Harvest Cold Store Management System - Warehouse 1';        var ls = document.querySelector('.login-screen');        if (ls) ls.classList.remove('hidden');        showLoginModal();      }    });    
toast('✅ Firebase 连接成功', 'ok');  } catch(e) {    console.error('Firebase init error:', e);    window.__csmInitDone = false;    toast('❌ Firebase 连接失败: ' + e.message, 'err');    showLoginModal();  }}
// 初始化默认账号
function initDefaultUsers() {  var users = getUsers();  if (Object.keys(users).length === 0) {    users = {      'admin': { password: 'admin123', role: 'admin', name: '管理员' }    };    saveUsers(users);  }}function clearLoginVerifyTimer() {  if (window.__csmLoginVerifyTimer) {    clearTimeout(window.__csmLoginVerifyTimer);    window.__csmLoginVerifyTimer = null;  }}function setLoginVerifyTimer() {  clearLoginVerifyTimer();  window.__csmLoginVerifyTimer = setTimeout(function() {    window.__csmLoginVerifyTimer = null;    if (!auth || typeof firebase === 'undefined' || !firebase.auth().currentUser) return;    var le = gid('login-error');    if (le && /正在验证|验证账号/.test(le.textContent || '')) {      pendingLoginError = '登录验证超时（45秒）。请检查：① Realtime Database 规则是否允许已登录用户读取 csm_users、csm_meta；② Firebase「身份验证 → 设置 → 已授权网域」是否包含当前主机名「' + location.hostname + '」（只填域名，不要带页面路径）；③ Network 里 database 请求是否失败。';      toast('登录验证超时', 'err');      clearLoginVerifyTimer();      auth.signOut();    }  }, 45000);}
var CSM_SECONDARY_APP_NAME = 'csm_AccountCreateOnly';
function getSecondaryAuthForUserCreation() {
  if (typeof firebase === 'undefined' || !firebase.initializeApp) return null;
  var app;
  try {
    app = firebase.app(CSM_SECONDARY_APP_NAME);
  } catch (e1) {
    try {
      app = firebase.initializeApp(firebaseConfig, CSM_SECONDARY_APP_NAME);
    } catch (e2) {
      console.error('[CSM] secondary app init failed', e2);
      return null;
    }
  }
  return app.auth();
}
function runChunkedRootUpdate(updates) {
  var keys = Object.keys(updates);
  if (keys.length === 0) return Promise.resolve(0);
  var i = 0;
  var chunkSize = 180;
  function nextChunk() {
    if (i >= keys.length) return Promise.resolve(keys.length);
    var chunk = {};
    var end = Math.min(i + chunkSize, keys.length);
    for (; i < end; i++) chunk[keys[i]] = updates[keys[i]];
    return firebase.database().ref().update(chunk).then(nextChunk);
  }
  return nextChunk();
}
function refreshSupplierShipCompanyOptions(selectedValue) {
  loadSettings();
  var el = gid('supplier-shipcompany');
  if (!el) return;
  var current = String(selectedValue != null ? selectedValue : el.value || '').trim();
  var list = (settData.shipCompanies || []).slice().sort(function(a, b) { return String(a).localeCompare(String(b)); });
  var html = '<option value="">请选择船公司</option>' + list.map(function(name) {
    var safe = String(name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    var selected = current && current === String(name) ? ' selected' : '';
    return '<option value="' + safe + '"' + selected + '>' + safe + '</option>';
  }).join('');
  if (current && list.indexOf(current) === -1) {
    var safeCurrent = current.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    html += '<option value="' + safeCurrent + '" selected>' + safeCurrent + '（旧值）</option>';
  }
  el.innerHTML = html;
}
function propagateSupplierDisplayName(oldName, newName, ownerUid) {
  oldName = String(oldName || '').trim();
  newName = String(newName || '').trim();
  ownerUid = ownerUid || '';
  if (!oldName || !newName || oldName === newName) return Promise.resolve();
  var updates = {};
  var p1 = supplierRef.once('value').then(function(snap) {
    snap.forEach(function(ch) {
      var rec = ch.val() || {};
      var s = String(rec.supplier || '').trim();
      var owned = ownerUid && rec.ownerUid === ownerUid;
      if (owned || s === oldName) {
        updates['csm_supplier_recs/' + ch.key + '/supplier'] = newName;
      }
    });
  });
  var p2 = purchaseRef.once('value').then(function(snap) {
    snap.forEach(function(ch) {
      var rec = ch.val() || {};
      if (String(rec.supplier || '').trim() === oldName) {
        updates['csm_purchase/' + ch.key + '/supplier'] = newName;
      }
    });
  });
  var p3 = dbRef.once('value').then(function(snap) {
    snap.forEach(function(ch) {
      var rec = ch.val() || {};
      if (String(rec.supplier || '').trim() === oldName) {
        updates[SK + '/' + ch.key + '/supplier'] = newName;
      }
    });
  });
  var p4 = legacyDbRef ? legacyDbRef.once('value').then(function(snap) {
    snap.forEach(function(ch) {
      var rec = ch.val() || {};
      if (String(rec.supplier || '').trim() === oldName) {
        updates[LOCAL_STORAGE_KEY + '/' + ch.key + '/supplier'] = newName;
      }
    });
  }) : Promise.resolve();
  return Promise.all([p1, p2, p3, p4]).then(function() {
    return runChunkedRootUpdate(updates).then(function() {
      try {
        loadSettings();
        var ix = settData.suppliers.indexOf(oldName);
        if (ix !== -1) {
          settData.suppliers[ix] = newName;
          saveSettings();
        }
      } catch (eLs) {}
      var nKeys = Object.keys(updates).length;
      if (nKeys) toast('已同步更新 ' + nKeys + ' 处供应商名称', 'ok');
      if (typeof renderPurchase === 'function' && (isAdmin || isLogistics)) renderPurchase();
      if (typeof renderSupplierTable === 'function' && isSupplier) renderSupplierTable();
      if (typeof renderAll === 'function') renderAll();
    });
  }).catch(function(err) {
    console.error('propagateSupplierDisplayName', err);
    toast('供应商名称已保存，但同步业务表失败: ' + (err.message || err), 'err');
  });
}
function resetLoginSliderState() {
  window.__csmLoginSlideVerified = false;
  var thumb = gid('login-slide-thumb');
  var fill = gid('login-slide-fill');
  var track = gid('login-slide-track');
  var hint = gid('login-slide-hint');
  if (thumb) {
    thumb.style.left = '2px';
    thumb.classList.remove('ok');
    thumb.textContent = '⟩⟩⟩';
  }
  if (fill) fill.style.width = '0';
  if (hint) hint.textContent = '完成滑动后方可点击登录';
}
function initLoginSliderOnce() {
  if (window.__csmLoginSliderInited) return;
  window.__csmLoginSliderInited = true;
  var track = gid('login-slide-track');
  var thumb = gid('login-slide-thumb');
  var fill = gid('login-slide-fill');
  var hint = gid('login-slide-hint');
  if (!track || !thumb) return;
  var dragging = false;
  var startX = 0;
  var startLeft = 0;
  function maxLeft() {
    return Math.max(0, track.offsetWidth - thumb.offsetWidth - 4);
  }
  function setPos(leftPx) {
    var maxL = maxLeft();
    var x = Math.max(2, Math.min(maxL + 2, leftPx));
    thumb.style.left = x + 'px';
    if (fill) fill.style.width = Math.max(0, x - 2 + thumb.offsetWidth * 0.25) + 'px';
    if (maxL <= 0) return;
    if (x - 2 >= maxL * 0.92) {
      window.__csmLoginSlideVerified = true;
      thumb.classList.add('ok');
      thumb.textContent = '✓';
      if (hint) hint.textContent = '验证通过，可点击登录';
    } else {
      window.__csmLoginSlideVerified = false;
      thumb.classList.remove('ok');
      thumb.textContent = '⟩⟩⟩';
      if (hint) hint.textContent = '完成滑动后方可点击登录';
    }
  }
  function onDown(clientX) {
    if (window.__csmLoginSlideVerified) return;
    dragging = true;
    startX = clientX;
    startLeft = parseFloat(thumb.style.left) || 2;
  }
  function onMove(clientX) {
    if (!dragging) return;
    var dx = clientX - startX;
    setPos(startLeft + dx);
  }
  function onUp() {
    dragging = false;
    if (!window.__csmLoginSlideVerified) {
      thumb.style.transition = 'left .2s ease';
      if (fill) fill.style.transition = 'width .2s ease';
      setPos(2);
      setTimeout(function() {
        thumb.style.transition = '';
        if (fill) fill.style.transition = '';
      }, 220);
    }
  }
  thumb.addEventListener('mousedown', function(e) { e.preventDefault(); onDown(e.clientX); });
  document.addEventListener('mousemove', function(e) { onMove(e.clientX); });
  document.addEventListener('mouseup', onUp);
  thumb.addEventListener('touchstart', function(e) { if (e.touches[0]) onDown(e.touches[0].clientX); }, { passive: true });
  document.addEventListener('touchmove', function(e) { if (e.touches[0]) onMove(e.touches[0].clientX); }, { passive: true });
  document.addEventListener('touchend', onUp);
  window.addEventListener('resize', function() { if (!window.__csmLoginSlideVerified) setPos(2); });
}
function sendLoginPasswordReset() {
  var email = (gid('login-username').value || '').trim().toLowerCase();
  var le = gid('login-error');
  if (!email) {
    if (le) { le.textContent = '请先填写邮箱，再点「忘记密码」'; le.style.color = '#cc0000'; le.style.display = 'block'; }
    return;
  }
  if (!auth) {
    if (le) { le.textContent = 'Firebase 未就绪，请稍候再试'; le.style.display = 'block'; }
    return;
  }
  auth.sendPasswordResetEmail(email).then(function() {
    toast('重置邮件已发送（若邮箱未注册则无邮件）', 'ok');
    if (le) { le.style.color = '#0066cc'; le.textContent = '若该邮箱已注册，请查收重置密码邮件。'; le.style.display = 'block'; }
  }).catch(function(err) {
    var m = err.message || String(err);
    if (le) { le.textContent = '发送失败: ' + m; le.style.color = '#cc0000'; le.style.display = 'block'; }
    toast('发送失败', 'err');
  });
}
function sendUserPasswordResetEmail(email) {
  var em = String(email || '').trim().toLowerCase();
  if (!em) { toast('无邮箱', 'err'); return; }
  if (!auth) { toast('Firebase 未就绪', 'err'); return; }
  auth.sendPasswordResetEmail(em).then(function() {
    toast('已向 ' + em + ' 发送重置密码邮件', 'ok');
  }).catch(function(err) {
    toast('发送失败: ' + (err.message || err), 'err');
  });
}
function toggleNewUserPassword(isSecond) {
  var id = isSecond ? 'new-user-password2' : 'new-user-password';
  var el = gid(id);
  if (!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
}
// 显示登录弹窗
function showLoginModal() {  var modal = gid('loginModal');  if (modal) {    modal.style.display = 'flex';    modal.classList.add('sh');    gid('login-username').value = '';    gid('login-password').value = '';    var le = gid('login-error');    if (pendingLoginError) {      le.textContent = pendingLoginError;      le.style.display = 'block';      le.style.fontWeight = 'bold';      le.style.color = '#cc0000';      pendingLoginError = null;    } else {      le.textContent = '';      le.style.display = 'none';      le.style.fontWeight = '';      le.style.color = '';    }    resetLoginSliderState();    initLoginSliderOnce();  }}
// Firebase Auth 登录处理
function doLogin() {  var email = (gid('login-username').value || '').trim().toLowerCase();  var password = (gid('login-password').value || '').trim();  if (!email || !password) {    var le1 = gid('login-error');    le1.textContent = '请输入邮箱和密码';    le1.style.color = '#cc0000';    le1.style.display = 'block';    return;  }  if (!window.__csmLoginSlideVerified) {    var le0 = gid('login-error');    le0.textContent = '请先向右滑动完成验证';    le0.style.color = '#cc0000';    le0.style.display = 'block';    return;  }  gid('login-error').style.display = 'none';  gid('login-error').style.color = '#cc0000';  
// 使用 Firebase Auth 登录  
if (!auth) {    gid('login-error').textContent = '系统仍在加载 Firebase，请等 1～2 秒后再点登录，或刷新页面';    gid('login-error').style.display = 'block';    toast('请稍候：Firebase 尚未就绪', 'err');    console.warn('auth is null — 页面 load 完成前点击了登录，或脚本未加载');    return;  }  auth.signInWithEmailAndPassword(email, password)    .then(function(userCredential) {      console.log('Firebase Auth: Login success', userCredential.user.email);      var le = gid('login-error');      if (le) {        le.style.color = '#0066cc';        le.textContent = '正在验证账号与权限…';        le.style.display = 'block';      }    })    .catch(function(error) {      console.error('Firebase Auth: Login failed', error);      var errorMsg = '登录失败';      if (error.code === 'auth/user-not-found') {        errorMsg = '用户不存在';      } else if (error.code === 'auth/wrong-password') {        errorMsg = '密码错误';      } else if (error.code === 'auth/invalid-email') {        errorMsg = '邮箱格式错误';      } else if (error.code === 'auth/too-many-requests') {        errorMsg = '尝试次数过多，请稍后再试';      } else if (error.code === 'auth/invalid-credential') {        errorMsg = '邮箱或密码错误';      } else if (error.code === 'auth/network-request-failed') {        errorMsg = '网络错误，请检查网络连接';      } else if (error.code === 'auth/invalid-api-key') {        errorMsg = 'Firebase 配置错误，请联系管理员';      } else if (error.code === 'auth/unauthorized-domain') {        errorMsg = '当前域名未授权：请在 Firebase 控制台 → 身份验证 → 设置 → 已授权网域 中添加本站点域名';      } else if (error.code === 'auth/operation-not-allowed') {        errorMsg = '未启用邮箱/密码登录：请在 Firebase 控制台 → 身份验证 → 登录方法 中启用「电子邮件/密码」';      }      var lec = gid('login-error');      lec.textContent = errorMsg + ' (' + (error.code || 'unknown') + ')';      lec.style.color = '#cc0000';      lec.style.fontWeight = 'bold';      lec.style.display = 'block';      toast(errorMsg, 'err');      resetLoginSliderState();    });}window.__csmRealDoLogin=doLogin;
// 注册新用户
function doRegister() {  var email = (gid('login-username').value || '').trim();  var password = (gid('login-password').value || '').trim();  if (!email || !password) {    gid('login-error').textContent = '请输入邮箱和密码';    gid('login-error').style.display = 'block';    return;  }  if (password.length < 6) {    gid('login-error').textContent = '密码至少6位';    gid('login-error').style.display = 'block';    return;  }  gid('login-error').style.display = 'none';  
// 使用 Firebase Auth 注册（独立 App，避免切换当前会话）
var secReg = getSecondaryAuthForUserCreation();
if (!secReg) {    gid('login-error').textContent = '无法初始化注册通道，请刷新页面';    gid('login-error').style.display = 'block';    return;  }
secReg.createUserWithEmailAndPassword(email, password)    .then(function(userCredential) {      console.log('Firebase Auth: Register success', userCredential.user.email);      secReg.signOut().catch(function() {});      
// 创建用户角色记录 - 新用户默认是物流公司      
var userId = userCredential.user.uid;      firebase.database().ref('csm_users/' + userId).set({        email: email,        role: 'logistics', 
// 默认物流公司角色        
createdAt: firebase.database.ServerValue.TIMESTAMP      });      toast('✅ 注册成功', 'ok');    })    .catch(function(error) {      console.error('Firebase Auth: Register failed', error);      var errorMsg = '注册失败';      if (error.code === 'auth/email-already-in-use') {        errorMsg = '邮箱已被注册';      } else if (error.code === 'auth/invalid-email') {        errorMsg = '邮箱格式错误';      } else if (error.code === 'auth/weak-password') {        errorMsg = '密码强度不足';      }      gid('login-error').textContent = errorMsg;      gid('login-error').style.display = 'block';    });}
// 退出登录
function doLogout() {  auth.signOut()    .then(function() {      console.log('Firebase Auth: Logged out');      currentUser = null;      currentUserEmail = null;      isAdmin = false;      isLogistics = false;      isSupplier = false;      currentSupplierName = null;      currentMainSuite = 'w1';      try { sessionStorage.removeItem('csm_main_suite'); } catch (eLo) {}      
// 重置界面      
var userDisplay = gid('currentUserDisplay');      if (userDisplay) {        userDisplay.textContent = '未登录';      }      var shellLo = gid('adminPortalShell');      if (shellLo) { shellLo.style.display = 'none'; shellLo.setAttribute('aria-hidden', 'true'); }      resetMainSuiteForNonAdmin();      var h1 = gid('headerTitle') || document.querySelector('header h1');      var hp = gid('headerSubtitle') || document.querySelector('header p');      if (h1) h1.textContent = '🧊 迪拜大丰收冷库管理系统';      if (hp) hp.textContent = 'Super Harvest Cold Store Management System - Warehouse 1';      toast('已退出登录', 'ok');    })    .catch(function(error) {      console.error('Firebase Auth: Logout failed', error);    });}
// Google 登录
function doGoogleLogin() {  var provider = new firebase.auth.GoogleAuthProvider();  auth.signInWithPopup(provider)    .then(function(result) {      console.log('Firebase Auth: Google login success', result.user.email);      
// 保存或更新用户信息到数据库      
var userId = result.user.uid;      firebase.database().ref('csm_users/' + userId).update({        email: result.user.email,        name: result.user.displayName || '',        photoURL: result.user.photoURL || '',        lastLogin: firebase.database.ServerValue.TIMESTAMP      }).catch(function(e) {        
// 如果节点不存在，先创建        
firebase.database().ref('csm_users/' + userId).set({          email: result.user.email,          name: result.user.displayName || '',          photoURL: result.user.photoURL || '',          role: 'admin', 
// Google用户默认管理员          
createdAt: firebase.database.ServerValue.TIMESTAMP,          lastLogin: firebase.database.ServerValue.TIMESTAMP        });      });    })    .catch(function(error) {      console.error('Firebase Auth: Google login failed', error);      var errorMsg = 'Google 登录失败';      if (error.code === 'auth/popup-closed-by-user') {        errorMsg = '登录窗口已关闭';      }      gid('login-error').textContent = errorMsg;      gid('login-error').style.display = 'block';    });}
// 旧版登录处理（保留用于兼容）
function handleLogout() {  doLogout();}
function syncAdminPortalButtons() {
  var map = { w1: 'portalBtnW1', w2: 'portalBtnW2', fin: 'portalBtnFin' };
  Object.keys(map).forEach(function(k) {
    var el = gid(map[k]);
    if (el) el.classList.toggle('ac', k === currentMainSuite);
  });
}
function applyPortalHeaderTitles(mode) {
  var ht = gid('headerTitle');
  var hs = gid('headerSubtitle');
  if (mode === 'w2') {
    if (ht) ht.textContent = '❄️ Warehouse 2';
    if (hs) hs.textContent = '独立业务域 · 与 W1/财务数据分离，将来可通过引用或同步产生关联';
  } else if (mode === 'fin') {
    if (ht) ht.textContent = '💼 公司财务 · Company Financial';
    if (hs) hs.textContent = '独立业务域 · 与 W1/W2 仓储数据分离，将来可通过单号/金额快照等建立关联';
  } else {
    if (ht) ht.textContent = '🧊 迪拜大丰收冷库管理系统';
    if (hs) hs.textContent = 'Warehouse 1 独立域 · Super Harvest — 与 W2、财务域分离，可按引用/聚合与它们联动（规划中）';
  }
}
function updateAdminPortalShellVisibility() {
  var shell = gid('adminPortalShell');
  if (!shell) return;
  if (isAdmin) {
    shell.style.display = 'block';
    shell.setAttribute('aria-hidden', 'false');
  } else {
    shell.style.display = 'none';
    shell.setAttribute('aria-hidden', 'true');
  }
}
function resetMainSuiteForNonAdmin() {
  var s1 = gid('suiteWarehouse1');
  var s2 = gid('suiteWarehouse2');
  var sf = gid('suiteCompanyFinancial');
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  if (sf) sf.style.display = 'none';
  currentMainSuite = 'w1';
  syncAdminPortalButtons();
  applyPortalHeaderTitles('w1');
}
function switchMainSuite(mode) {
  if (!isAdmin) {
    toast('仅管理员可使用顶部模块切换', 'err');
    return;
  }
  if (mode !== 'w1' && mode !== 'w2' && mode !== 'fin') mode = 'w1';
  currentMainSuite = mode;
  try { sessionStorage.setItem('csm_main_suite', mode); } catch (e0) {}
  var s1 = gid('suiteWarehouse1');
  var s2 = gid('suiteWarehouse2');
  var sf = gid('suiteCompanyFinancial');
  if (s1) s1.style.display = mode === 'w1' ? 'block' : 'none';
  if (s2) s2.style.display = mode === 'w2' ? 'block' : 'none';
  if (sf) sf.style.display = mode === 'fin' ? 'block' : 'none';
  syncAdminPortalButtons();
  applyPortalHeaderTitles(mode);
}
try { window.switchMainSuite = switchMainSuite; } catch (eSw) {}
// 显示管理员视图
function showAdminView() {  var lv = gid('logisticsView');  var sv = gid('supplierView');  if (lv) lv.style.display = 'none';  if (sv) sv.style.display = 'none';  var rights = document.querySelectorAll('.right');  if (rights[2]) rights[2].style.display = 'block';  var ui = gid('userInfo');  if (ui) ui.style.display = 'flex';  updateAdminPortalShellVisibility();  try { currentMainSuite = sessionStorage.getItem('csm_main_suite') || 'w1'; } catch (e1) { currentMainSuite = 'w1'; }  if (currentMainSuite !== 'w1' && currentMainSuite !== 'w2' && currentMainSuite !== 'fin') currentMainSuite = 'w1';  switchMainSuite(currentMainSuite);  updateSettingsButton();  renderPurchase();}
// 显示清关公司视图
function showLogisticsView() {  var shell = gid('adminPortalShell');  if (shell) { shell.style.display = 'none'; shell.setAttribute('aria-hidden', 'true'); }  resetMainSuiteForNonAdmin();  var sv = gid('supplierView');  if (sv) sv.style.display = 'none';  var rights = document.querySelectorAll('.right');  if (rights[2]) rights[2].style.display = 'none';  var lv2 = gid('logisticsView');  if (lv2) lv2.style.display = 'block';  var ui2 = gid('userInfo');  if (ui2) ui2.style.display = 'none';  var h1a = gid('headerTitle') || document.querySelector('header h1');  if (h1a) h1a.textContent = '物流公司系统 / Logistics System';  var hs = gid('headerSubtitle');  if (hs) hs.textContent = 'Logistics fee tracking';  var lname = gid('logisticsUserName');  if (lname) lname.textContent = currentUserEmail || currentUser;  updateSettingsButton();  renderLogisticsTable();}
// 显示供应商视图
function showSupplierView() {  var shell2 = gid('adminPortalShell');  if (shell2) { shell2.style.display = 'none'; shell2.setAttribute('aria-hidden', 'true'); }  resetMainSuiteForNonAdmin();  var lv3 = gid('logisticsView');  if (lv3) lv3.style.display = 'none';  var rights2 = document.querySelectorAll('.right');  if (rights2[2]) rights2[2].style.display = 'none';  var sv2 = gid('supplierView');  if (sv2) sv2.style.display = 'block';  var ui3 = gid('userInfo');  if (ui3) ui3.style.display = 'none';  var h1b = gid('headerTitle') || document.querySelector('header h1');  if (h1b) h1b.textContent = '🏭 供应商采购系统 / Supplier Portal';  var hs2 = gid('headerSubtitle');  if (hs2) hs2.textContent = 'Supplier purchase portal';  var sname = gid('supplierUserName');  if (sname) sname.textContent = currentUserEmail || currentUser;  updateSettingsButton();  renderSupplierTable();}
// 清空供应商搜索
function clearSupplierSearch() {  if (gid('supplier-search-date-start')) gid('supplier-search-date-start').value = '';  if (gid('supplier-search-date-end')) gid('supplier-search-date-end').value = '';  if (gid('supplier-search-cn')) gid('supplier-search-cn').value = '';  renderSupplierTable();}
// 切换用户角色时显示/隐藏供应商名称字段
function onUserRoleChange() {  var role = gid('new-user-role') ? gid('new-user-role').value : 'admin';  var nameRow = gid('supplier-name-row');  if (nameRow) {    nameRow.style.display = (role === 'supplier') ? 'flex' : 'none';  }}
// ============================================================
// SUPPLIER PURCHASE RECORDS
// ============================================================
var supplierFormRowCounter = 0;
function normalizeSupplierRecItems(rec) {
  var raw = Array.isArray(rec && rec.items) ? rec.items : [];
  var items = raw.map(function(item) {
    var product = String(item && item.product || '').trim();
    var qty = parseFloat(item && item.qty);
    if (!product) return null;
    return { product: product, qty: qty > 0 ? qty : 0 };
  }).filter(function(item) {
    return !!item;
  });
  if (!items.length && rec) {
    var legacyProduct = String(rec.product || '').trim();
    if (legacyProduct) {
      items.push({
        product: legacyProduct,
        qty: parseFloat(rec.qty) || 0
      });
    }
  }
  return items;
}
function getSupplierQtyTotal(rec) {
  return normalizeSupplierRecItems(rec).reduce(function(sum, item) {
    return sum + (parseFloat(item.qty) || 0);
  }, 0);
}
function createSupplierItemSummaryText(rec) {
  return normalizeSupplierRecItems(rec).map(function(item) {
    return item.product;
  }).join(' / ');
}
function createSupplierItemSummaryHtml(rec) {
  var items = normalizeSupplierRecItems(rec);
  if (!items.length) return '-';
  return '<div style="line-height:1.5">' + items.map(function(item) {
    var qtyText = items.length > 1 ? '<span style="color:#888;font-size:12px"> x ' + (item.qty || 0) + '</span>' : '';
    return '<div style="font-family:Arial;text-transform:capitalize">' + fmtTitleCase(item.product) + qtyText + '</div>';
  }).join('') + '</div>';
}
function createSupplierItemRow(rowId, item) {
  var row = document.createElement('tr');
  row.className = 'supplier-item-row';
  row.innerHTML =
    '<td style="padding:4px;border:1px solid #ddd;position:relative">' +
      '<input type="text" class="supplier-item-product" placeholder="输入品名" data-rowid="' + rowId + '" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px" oninput="showSuggestSupplierItem(this)" onfocus="showSuggestSupplierItem(this)" onblur="setTimeout(function(){hideSuggest(\'supplier-item-' + rowId + '\')},200)">' +
      '<div class="suggest-list" id="suggest-supplier-item-' + rowId + '"></div>' +
    '</td>' +
    '<td style="padding:4px;border:1px solid #ddd">' +
      '<input type="number" class="supplier-item-qty" placeholder="数量" min="0" value="" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center">' +
    '</td>' +
    '<td style="padding:4px;border:1px solid #ddd;text-align:center">' +
      '<button type="button" class="abtn x" onclick="removeSupplierItem(this)" style="color:#ff4444;font-size:16px">×</button>' +
    '</td>';
  if (item) {
    var productInput = row.querySelector('.supplier-item-product');
    var qtyInput = row.querySelector('.supplier-item-qty');
    if (productInput) productInput.value = item.product || '';
    if (qtyInput && item.qty !== undefined && item.qty !== null && item.qty !== '') qtyInput.value = item.qty;
  }
  return row;
}
function resetSupplierItemRows(items) {
  var body = gid('supplierItemsBody');
  if (!body) return;
  var list = items && items.length ? items : [{ product: '', qty: '' }];
  body.innerHTML = '';
  supplierFormRowCounter = -1;
  list.forEach(function(item, index) {
    supplierFormRowCounter = index;
    body.appendChild(createSupplierItemRow(index, item));
  });
  if (supplierFormRowCounter < 0) {
    supplierFormRowCounter = 0;
    body.appendChild(createSupplierItemRow(0, { product: '', qty: '' }));
  }
}
function addSupplierItem(productValue, qtyValue) {
  var body = gid('supplierItemsBody');
  if (!body) return;
  supplierFormRowCounter += 1;
  body.appendChild(createSupplierItemRow(supplierFormRowCounter, {
    product: productValue || '',
    qty: qtyValue || ''
  }));
}
function removeSupplierItem(btn) {
  var rows = document.querySelectorAll('#supplierItemsBody .supplier-item-row');
  if (rows.length > 1) {
    btn.closest('tr').remove();
  } else {
    toast('至少保留一行品名', 'err');
  }
}
function collectSupplierFormItems() {
  var rows = document.querySelectorAll('#supplierItemsBody .supplier-item-row');
  var items = [];
  var error = '';
  rows.forEach(function(row) {
    if (error) return;
    var product = String((row.querySelector('.supplier-item-product') || {}).value || '').trim();
    var qtyRaw = String((row.querySelector('.supplier-item-qty') || {}).value || '').trim();
    if (!product && !qtyRaw) return;
    var qty = parseFloat(qtyRaw);
    if (!product) {
      error = '请填写品名 / Enter product name';
      return;
    }
    if (!(qty > 0)) {
      error = '请输入数量，且必须大于 0 / Quantity is required';
      return;
    }
    items.push({ product: product, qty: qty });
  });
  return { items: items, error: error };
}
function openSupplierForm() {
  var now = new Date();
  var y = now.getFullYear();
  var mm = String(now.getMonth() + 1).padStart(2, '0');
  var dd = String(now.getDate()).padStart(2, '0');
  var hh = String(now.getHours()).padStart(2, '0');
  var mi = String(now.getMinutes()).padStart(2, '0');
  gid('supplier-id').value = '';
  gid('supplier-cn').value = '';
  gid('supplier-date').value = y + '-' + mm + '-' + dd;
  gid('supplier-time').value = hh + ':' + mi;
  gid('supplier-supplier').value = currentSupplierName || '';
  resetSupplierItemRows();
  gid('supplier-shipname').value = '';
  refreshSupplierShipCompanyOptions('');
  gid('supplier-bl').value = '';
  gid('supplier-etd').value = '';
  gid('supplier-eta').value = '';
  gid('supplier-modal-title').textContent = '📦 添加采购记录 / Add Purchase Record';
  gid('supplierModal').classList.add('sh');
}
function clSupplierModal() {
  gid('supplierModal').classList.remove('sh');
}
function saveSupplierRec() {
  var id = gid('supplier-id').value;
  var cn = (gid('supplier-cn').value || '').trim().toUpperCase();
  var purchaseDate = (gid('supplier-date').value || '').trim();
  var purchaseTime = (gid('supplier-time').value || '').trim();
  var supplier = (gid('supplier-supplier').value || '').trim();
  var shipname = (gid('supplier-shipname').value || '').trim();
  var shipCompany = (gid('supplier-shipcompany') ? gid('supplier-shipcompany').value : '').trim();
  var bl = (gid('supplier-bl').value || '').trim();
  var etd = (gid('supplier-etd').value || '').trim();
  var eta = (gid('supplier-eta').value || '').trim();
  var itemResult = collectSupplierFormItems();
  var supplierItems = itemResult.items;
  var product = supplierItems.map(function(item) { return item.product; }).join(' / ');
  var qty = supplierItems.reduce(function(sum, item) { return sum + (parseFloat(item.qty) || 0); }, 0);
  if (isSupplier) {
    if (!currentUser) { toast('未登录', 'err'); return; }
    if (!currentSupplierName) {
      toast('账号未配置供应商名称：请让管理员在「设置 → 用户管理」中填写 supplierName', 'err');
      return;
    }
    supplier = String(currentSupplierName).trim();
    if (gid('supplier-supplier')) gid('supplier-supplier').value = supplier;
  }
  if (!cn) { toast('请输入集装箱号 / Enter container no.', 'err'); return; }
  if (!purchaseDate) { toast('请选择采购日期 / Select purchase date', 'err'); return; }
  if (!supplier) { toast('请输入供应商名称 / Enter supplier name', 'err'); return; }
  if (itemResult.error) { toast(itemResult.error, 'err'); return; }
  if (!supplierItems.length) { toast('请至少添加一个品名 / Add at least one product item', 'err'); return; }
  if (!shipname) { toast('请输入船名 / Ship name is required', 'err'); return; }
  if (!shipCompany) { toast('请选择船公司 / Shipping company is required', 'err'); return; }
  if ((settData.shipCompanies || []).indexOf(shipCompany) === -1) {
    toast('船公司必须从设置列表中选择', 'err');
    return;
  }
  var existing = id ? supplierRecs.find(function(r) { return r.id === id; }) : null;
  if (isSupplier && existing && !supplierRecOwnedByCurrentUser(existing)) {
    toast('无权编辑该记录', 'err');
    clSupplierModal();
    return;
  }
  if (existing && existing.status === 'submitted') {
    toast('⚠️ 记录已提交，请先撤销提交 / Already submitted, undo submit first', 'err');
    clSupplierModal();
    return;
  }
  if (existing && existing.status === 'confirmed') {
    toast('⚠️ 记录已确认，无法编辑 / Already confirmed, cannot edit', 'err');
    clSupplierModal();
    return;
  }
  var rec = {
    cn: cn,
    purchaseDate: purchaseDate,
    purchaseTime: purchaseTime,
    supplier: supplier,
    product: product,
    qty: qty,
    items: supplierItems,
    shipname: shipname,
    shipCompany: shipCompany,
    bl: bl,
    etd: etd,
    eta: eta,
    addedBy: currentUserEmail,
    ownerUid: currentUser,
    addTime: new Date().toISOString(),
    status: 'draft'
  };
  if (id) {
    rec.id = id;
    rec.status = existing ? existing.status : 'draft';
    rec.ownerUid = (existing && existing.ownerUid) ? existing.ownerUid : currentUser;
    rec.updatedBy = currentUserEmail;
    rec.updateTime = new Date().toISOString();
    function writeSupplierEdit(record) {
      supplierRef.child(id).set(record).then(function() {
        toast('✅ 记录已更新 / Updated', 'ok');
        clSupplierModal();
      });
    }
    if (existing && existing.seq) {
      rec.seq = existing.seq;
      writeSupplierEdit(rec);
    } else {
      generateSeq(function(seq) {
        rec.seq = seq;
        writeSupplierEdit(rec);
      }, new Date(purchaseDate + 'T00:00:00'));
    }
  } else {
    generateSeq(function(seq) {
      rec.seq = seq;
      rec.id = 'sp_' + Date.now().toString(36);
      supplierRef.child(rec.id).set(rec).then(function() {
        toast('✅ 记录已添加，序列号：' + seq, 'ok');
        clSupplierModal();
      });
    }, new Date(purchaseDate + 'T00:00:00'));
  }
}
function delSupplierRec(id) {
  var rec = supplierRecs.find(function(r) { return r.id === id; });
  if (!rec) return;
  if (isSupplier && !supplierRecOwnedByCurrentUser(rec)) { toast('无权删除该记录', 'err'); return; }
  if (rec.status === 'confirmed') { toast('⚠️ 已确认状态，无法删除', 'err'); return; }
  if (!confirm('确认删除这条采购记录？')) return;
  supplierRef.child(id).remove().then(function() {
    toast('✅ 已删除 / Deleted', 'ok');
  });
}
function submitSupplierRec(id) {
  var rec = supplierRecs.find(function(r) { return r.id === id; });
  if (!rec) return;
  if (isSupplier && !supplierRecOwnedByCurrentUser(rec)) { toast('无权提交该记录', 'err'); return; }
  if (rec.status !== 'draft') { toast('⚠️ 只有初始状态才能提交', 'err'); return; }
  if (!confirm('确认提交这条记录？提交后将进入"已提交"状态，等待管理员确认。')) return;
  supplierRef.child(id).update({
    status: 'submitted',
    submittedBy: currentUserEmail,
    submittedAt: new Date().toISOString()
  }).then(function() {
    toast('✅ 已提交，等待管理员确认 / Submitted, awaiting admin confirmation', 'ok');
  });
}
function undoSubmitSupplierRec(id) {
  var rec = supplierRecs.find(function(r) { return r.id === id; });
  if (!rec) return;
  if (isSupplier && !supplierRecOwnedByCurrentUser(rec)) { toast('无权撤销该记录', 'err'); return; }
  if (rec.status !== 'submitted') { toast('⚠️ 只有已提交状态才能撤销', 'err'); return; }
  if (!confirm('确认撤销提交？记录将回到初始状态，可继续编辑。')) return;
  supplierRef.child(id).update({
    status: 'draft',
    submittedBy: null,
    submittedAt: null
  }).then(function() {
    toast('✅ 已撤销，可以继续编辑 / Undo submitted, can continue editing', 'ok');
  }).catch(function(err) {
    console.error('Undo submit failed', err);
    toast('❌ 撤销失败: ' + (err.message || err), 'err');
  });
}
function confirmSupplierRec(id) {
  var rec = supplierRecs.find(function(r) { return r.id === id; });
  if (!rec) return;
  var status = rec.status || 'draft';
  if (status !== 'submitted' && status !== 'confirmed') {
    toast('⚠️ 只有已提交或已确认状态才能采用', 'err');
    return;
  }
  var supplierItems = normalizeSupplierRecItems(rec);
  if (!supplierItems.length) {
    toast('❌ 该供应商记录没有有效的品名明细', 'err');
    return;
  }
  var existingPurchases = purchaseRecs.filter(function(p) {
    return p.sourceSupplierRecId === id;
  });
  var confirmText = status === 'submitted'
    ? '⚠️ 确认后将把此条供应商记录正式采用到 Warehouse1 采购列表，之后才能作为管理员采购数据使用。\n确认这条采购记录？'
    : '这条记录已经是已确认状态，但尚未采用到 Warehouse1 采购列表。\n现在采用这条记录吗？';
  if (!existingPurchases.length && !confirm(confirmText)) return;
  var purchaseIds = existingPurchases.map(function(item) { return item.id; });
  var pd = (rec.purchaseDate || '').trim();
  var dateForSeq = pd ? new Date(pd + 'T00:00:00') : new Date();
  function finishConfirm(seq) {
    var nowIso = new Date().toISOString();
    var writes = [];
    if (existingPurchases.length) {
      existingPurchases.forEach(function(item) {
        writes.push(purchaseRef.child(item.id).update({ seq: seq }));
      });
    } else {
      supplierItems.forEach(function(item) {
        var purchaseId = makePurchaseRecordId();
        var purchaseRec = createPurchaseRecordFromSupplierRec(rec, purchaseId, item);
        purchaseRec.seq = seq;
        purchaseIds.push(purchaseId);
        writes.push(purchaseRef.child(purchaseId).set(purchaseRec));
      });
    }
    var supplierUpdates = {
      status: 'confirmed',
      confirmedBy: currentUserEmail,
      confirmedAt: rec.confirmedAt || nowIso,
      adoptedPurchaseId: purchaseIds[0] || '',
      adoptedPurchaseIds: purchaseIds,
      adoptedAt: nowIso,
      seq: seq
    };
    Promise.all(writes).then(function() {
      return supplierRef.child(id).update(supplierUpdates);
    }).then(function() {
      toast('✅ 已确认并采用到 Warehouse1 采购列表', 'ok');
    }).catch(function(err) {
      console.error('Confirm supplier record failed', err);
      toast('❌ 确认失败: ' + (err.message || err), 'err');
    });
  }
  if (rec.seq) {
    finishConfirm(rec.seq);
  } else {
    generateSeq(finishConfirm, dateForSeq);
  }
}
function editSupplierRec(id) {
  var rec = supplierRecs.find(function(r) { return r.id === id; });
  if (!rec) return;
  if (isSupplier && !supplierRecOwnedByCurrentUser(rec)) { toast('无权编辑该记录', 'err'); return; }
  if (rec.status === 'submitted') { toast('⚠️ 已提交状态，请先撤销提交', 'err'); return; }
  if (rec.status === 'confirmed') { toast('⚠️ 已确认状态，无法编辑', 'err'); return; }
  gid('supplier-id').value = id;
  gid('supplier-cn').value = rec.cn || '';
  gid('supplier-date').value = rec.purchaseDate || '';
  gid('supplier-time').value = rec.purchaseTime || '';
  gid('supplier-supplier').value = rec.supplier || '';
  resetSupplierItemRows(normalizeSupplierRecItems(rec));
  gid('supplier-shipname').value = rec.shipname || '';
  refreshSupplierShipCompanyOptions(rec.shipCompany || '');
  gid('supplier-bl').value = rec.bl || '';
  gid('supplier-etd').value = rec.etd || '';
  gid('supplier-eta').value = rec.eta || '';
  gid('supplier-modal-title').textContent = '✏️ 编辑采购记录 / Edit Purchase Record';
  gid('supplierModal').classList.add('sh');
}
function filterSupplierTable() {
  renderSupplierTable();
}
function renderSupplierTable() {
  var container = gid('supplierView');
  if (!container) return;
  var searchDateStart = (gid('supplier-search-date-start') || { value: '' }).value;
  var searchDateEnd = (gid('supplier-search-date-end') || { value: '' }).value;
  var searchCn = (gid('supplier-search-cn') || { value: '' }).value.trim().toUpperCase();
  var filtered = supplierRecs.filter(function(r) {
    if (searchDateStart && r.purchaseDate < searchDateStart) return false;
    if (searchDateEnd && r.purchaseDate > searchDateEnd) return false;
    if (searchCn && (r.cn || '').indexOf(searchCn) === -1) return false;
    return true;
  });
  filtered.sort(function(a, b) {
    return new Date(b.purchaseDate) - new Date(a.purchaseDate);
  });
  var tb = gid('tb-supplier');
  var emptyMsg = gid('es-supplier');
  if (filtered.length === 0) {
    tb.innerHTML = '';
    emptyMsg.style.display = 'flex';
    return;
  }
  emptyMsg.style.display = 'none';
  var html = filtered.map(function(r) {
    var cnClickFn = "openSupplierCNDetail('" + r.id + "')";
    var status = r.status || 'draft';
    var supplierItems = normalizeSupplierRecItems(r);
    var firstItem = supplierItems[0] || { product: r.product || '-', qty: r.qty || 0 };
    var etdHtml = r.etd ? '<span style="color:#888;font-size:12px">ETD:' + r.etd + '</span>' : '';
    var etaHtml = r.eta ? '<br><span style="color:#888;font-size:12px">ETA:' + r.eta + '</span>' : '';
    var itemCount = supplierItems.length;
    var rowGroupId = 'supplier-items-' + String(r.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    var statusLabel = {
      'draft': '<span style="background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold">✏️ 初始</span>',
      'submitted': '<span style="background:#fff8e1;color:#f57f17;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold">📤 已提交</span>',
      'confirmed': '<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold">✅ 已确认</span>'
    }[status];
    var actionBtns = '';
    if (isSupplier) {
      if (status === 'draft') {
        actionBtns =
          '<button class="abtn" onclick="editSupplierRec(\'' + r.id + '\')">✏️</button> ' +
          '<button class="abtn" style="background:#1565c0;color:#fff" onclick="submitSupplierRec(\'' + r.id + '\')">📤 提交</button> ' +
          '<button class="abtn x" onclick="delSupplierRec(\'' + r.id + '\')">🗑</button>';
      } else if (status === 'submitted') {
        actionBtns = '<button class="abtn" style="background:#ffb300;color:#fff" onclick="undoSubmitSupplierRec(\'' + r.id + '\')">↩ 撤销</button>';
      } else {
        actionBtns = '<span style="color:#aaa;font-size:12px">—</span>';
      }
    } else if (isAdmin) {
      if (status === 'submitted') {
        actionBtns =
          '<button class="abtn" onclick="editSupplierRec(\'' + r.id + '\')">✏️</button> ' +
          '<button class="abtn" style="background:#2e7d32;color:#fff" onclick="confirmSupplierRec(\'' + r.id + '\')">✅ 确认</button> ' +
          '<button class="abtn x" onclick="delSupplierRec(\'' + r.id + '\')">🗑</button>';
      } else if (status === 'confirmed') {
        actionBtns = '<span style="color:#aaa;font-size:12px">已确认</span>';
      } else {
        actionBtns =
          '<button class="abtn" onclick="editSupplierRec(\'' + r.id + '\')">✏️</button> ' +
          '<button class="abtn x" onclick="delSupplierRec(\'' + r.id + '\')">🗑</button>';
      }
    } else {
      actionBtns = '<span style="color:#aaa;font-size:12px">—</span>';
    }
    var toggleBtn = itemCount > 1
      ? '<button type="button" class="abtn" style="background:#f0f0f0;border:1px solid #ddd;padding:2px 6px;font-size:14px;margin-right:6px" onclick="toggleSupplierItems(\'' + rowGroupId + '\',this)">+</button>'
      : '';
    var mainRow = '<tr style="background:' + (itemCount > 1 ? '#fffcf7' : '#fff') + '">' +
      '<td style="white-space:nowrap">' + (r.seq || '-') + '</td>' +
      '<td>' + toggleBtn + '<a href="javascript:void(0)" onclick="' + cnClickFn + '" style="color:#00bfff;font-weight:bold;text-decoration:underline">' + (r.cn || '-') + '</a>' + (itemCount > 1 ? '<div style="font-size:11px;color:#888;margin-top:3px">' + itemCount + ' 个品名</div>' : '') + '</td>' +
      '<td style="font-family:Arial">' + fmtSupplierName(r.supplier) + '</td>' +
      '<td><div style="font-family:Arial;text-transform:capitalize">' + fmtTitleCase(firstItem.product || '-') + '</div>' + (itemCount > 1 ? '<div style="font-size:11px;color:#888;margin-top:2px">其余 ' + (itemCount - 1) + ' 个品名点展开查看</div>' : '') + '</td>' +
      '<td style="white-space:nowrap">' + (r.purchaseDate || '-') + (r.purchaseTime ? '<br><span style="font-size:11px;color:#888">' + r.purchaseTime + '</span>' : '') + '</td>' +
      '<td style="text-align:center">' + getSupplierQtyTotal(r) + '</td>' +
      '<td>' + etdHtml + etaHtml + '</td>' +
      '<td style="font-family:Arial;text-transform:capitalize">' + fmtTitleCase(r.shipname) + '</td>' +
      '<td style="font-family:Arial;text-transform:capitalize">' + fmtTitleCase(r.shipCompany) + '</td>' +
      '<td>' + (r.bl || '-') + '</td>' +
      '<td>' + statusLabel + '</td>' +
      '<td>' + actionBtns + '</td>' +
    '</tr>';
    if (itemCount <= 1) return mainRow;
    var subRows = supplierItems.map(function(item, index) {
      return '<tr class="' + rowGroupId + '" style="display:none;background:#fffaf0">' +
        '<td style="color:#999">' + (index === 0 ? '└' : '') + '</td>' +
        '<td style="padding-left:38px;color:#666">明细 ' + (index + 1) + '</td>' +
        '<td style="font-family:Arial;color:#666">' + fmtSupplierName(r.supplier) + '</td>' +
        '<td style="font-family:Arial;text-transform:capitalize">' + fmtTitleCase(item.product || '-') + '</td>' +
        '<td style="color:#999">-</td>' +
        '<td style="text-align:center">' + (item.qty || 0) + '</td>' +
        '<td style="color:#999">-</td>' +
        '<td style="color:#999">-</td>' +
        '<td style="color:#999">-</td>' +
        '<td style="color:#999">-</td>' +
        '<td style="color:#999">-</td>' +
      '</tr>';
    }).join('');
    return mainRow + subRows;
  }).join('');
  tb.innerHTML = html;
}
function toggleSupplierItems(groupId, btn) {
  var rows = document.querySelectorAll('.' + groupId);
  var isExpanded = btn.textContent === '-';
  rows.forEach(function(row) {
    row.style.display = isExpanded ? 'none' : '';
  });
  btn.textContent = isExpanded ? '+' : '-';
}
function openSupplierCNDetail(id) {
  var rec = supplierRecs.find(function(r) { return r.id === id; });
  if (!rec) return;
  var linked = [];
  if (purchaseRecs && purchaseRecs.length) {
    linked = purchaseRecs.filter(function(p) { return p.sourceSupplierRecId === rec.id; });
    if (!linked.length) {
      linked = purchaseRecs.filter(function(p) { return p.cn === rec.cn; });
    }
  }
  var supplierItems = normalizeSupplierRecItems(rec);
  var status = rec.status || 'draft';
  var statusBadge = {
    'draft': '<span style="background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold">✏️ 初始</span>',
    'submitted': '<span style="background:#fff8e1;color:#f57f17;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold">📤 已提交</span>',
    'confirmed': '<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold">✅ 已确认</span>'
  }[status];
  var html = '<div style="text-align:left;min-width:320px">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:14px">';
  html += '<tr style="border-bottom:1px solid #eee"><td style="padding:6px;color:#888;width:35%">集装箱号</td><td style="padding:6px;font-weight:bold;color:#00bfff">' + (rec.cn || '-') + '</td></tr>';
  html += '<tr style="border-bottom:1px solid #eee"><td style="padding:6px;color:#888">状态</td><td style="padding:6px">' + statusBadge + '</td></tr>';
  html += '<tr style="border-bottom:1px solid #eee"><td style="padding:6px;color:#888">供应商</td><td style="padding:6px">' + (rec.supplier || '-') + '</td></tr>';
  html += '<tr style="border-bottom:1px solid #eee"><td style="padding:6px;color:#888">采购日期</td><td style="padding:6px">' + (rec.purchaseDate || '-') + (rec.purchaseTime ? ' ' + rec.purchaseTime : '') + '</td></tr>';
  html += '<tr style="border-bottom:1px solid #eee"><td style="padding:6px;color:#888">总数量</td><td style="padding:6px">' + getSupplierQtyTotal(rec) + '</td></tr>';
  html += '<tr style="border-bottom:1px solid #eee"><td style="padding:6px;color:#888">船名</td><td style="padding:6px">' + (rec.shipname || '-') + '</td></tr>';
  html += '<tr style="border-bottom:1px solid #eee"><td style="padding:6px;color:#888">船公司</td><td style="padding:6px">' + (rec.shipCompany || '-') + '</td></tr>';
  html += '<tr style="border-bottom:1px solid #eee"><td style="padding:6px;color:#888">提单号</td><td style="padding:6px">' + (rec.bl || '-') + '</td></tr>';
  html += '<tr style="border-bottom:1px solid #eee"><td style="padding:6px;color:#888">预计开船日 ETD</td><td style="padding:6px">' + (rec.etd || '-') + '</td></tr>';
  html += '<tr><td style="padding:6px;color:#888">预计到港日 ETA</td><td style="padding:6px">' + (rec.eta || '-') + '</td></tr>';
  html += '</table>';
  html += '<div style="margin-top:12px">';
  html += '<div style="font-weight:bold;margin-bottom:6px">品名明细 / Product Items</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
  html += '<tr style="background:#f5f5f5"><th style="padding:6px;text-align:left;border:1px solid #ddd">品名</th><th style="padding:6px;text-align:center;border:1px solid #ddd;width:90px">数量</th></tr>';
  html += supplierItems.map(function(item) {
    return '<tr><td style="padding:6px;border:1px solid #ddd;font-family:Arial;text-transform:capitalize">' + fmtTitleCase(item.product) + '</td><td style="padding:6px;border:1px solid #ddd;text-align:center">' + (item.qty || 0) + '</td></tr>';
  }).join('');
  html += '</table></div>';
  if (linked.length) {
    html += '<div style="margin-top:12px;padding:10px;background:#e8f5e9;border-radius:6px;border:1px solid #4CAF50">';
    html += '<div style="color:#00aa00;font-weight:bold;margin-bottom:6px">✅ Warehouse1 已采用 / Adopted in Warehouse1</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
    html += '<tr style="background:#f1fbf1"><th style="padding:4px;text-align:left;border:1px solid #c8e6c9">品名</th><th style="padding:4px;text-align:center;border:1px solid #c8e6c9;width:70px">数量</th><th style="padding:4px;text-align:center;border:1px solid #c8e6c9;width:90px">费用合计</th></tr>';
    html += linked.map(function(item) {
      var total = (item.demurrage || 0) + (item.customs || 0) + (item.coldFee || item.coldfee || 0) + (item.attestation || 0) + (item.repack || 0) + (item.waste || 0) + (item.other || 0);
      return '<tr>' +
        '<td style="padding:4px;border:1px solid #c8e6c9;font-family:Arial;text-transform:capitalize">' + fmtTitleCase(item.product || '-') + '</td>' +
        '<td style="padding:4px;border:1px solid #c8e6c9;text-align:center">' + (item.qty || 0) + '</td>' +
        '<td style="padding:4px;border:1px solid #c8e6c9;text-align:center">' + total.toFixed(2) + ' AED</td>' +
      '</tr>';
    }).join('');
    html += '</table></div>';
  } else {
    html += '<div style="margin-top:12px;padding:10px;background:#fff8e1;border-radius:6px;border:1px solid #ffb300">';
    html += '<div style="color:#ff8f00;font-weight:bold">⚠️ 尚未在 Warehouse1 采购主表采用 / Not yet adopted into Warehouse1</div>';
    html += '<div style="margin-top:4px;font-size:13px;color:#666">管理员确认后，才会在 Warehouse1 采购记录中正式采用此条数据。</div></div>';
  }
  html += '</div>';
  gid('mcon').innerHTML = html;
  gid('modal').classList.add('sh');
}
// ============================================================
// USER MANAGEMENT
// ============================================================
var allUsers = [];

// 加载所有用户
function loadAllUsers() {
  var usersRef = firebase.database().ref('csm_users');
  usersRef.once('value').then(function(snap) {
    var data = snap.val() || {};
    allUsers = Object.keys(data).map(function(uid) {
      return {
        uid: uid,
        email: data[uid].email || '',
        role: data[uid].role || 'pending',
        supplierName: data[uid].supplierName || '',
        createdAt: data[uid].createdAt
      };
    });
    renderUserMgmtList();
  });
}

// 渲染用户列表（独立用户管理弹窗 userMgmtModal，勿与设置里的 renderUserList 重名）
function renderUserMgmtList() {
  var container = document.getElementById('userListContainer');
  if (!container) return;
  
  if (allUsers.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:20px">暂无用户数据</div>';
    return;
  }
  
  var html = '<table style="width:100%;border-collapse:collapse;font-size:14px">';
  html += '<tr style="background:#f5f5f5;border-bottom:2px solid #ddd">';
  html += '<th style="padding:10px;text-align:left">邮箱</th>';
  html += '<th style="padding:10px;text-align:center">角色</th>';
  html += '<th style="padding:10px;text-align:left">供应商名称</th>';
  html += '<th style="padding:10px;text-align:center">操作</th>';
  html += '</tr>';
  
  allUsers.forEach(function(user) {
    var roleLabel = {
      'admin': '<span style="background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:10px;font-size:12px">管理员</span>',
      'logistics': '<span style="background:#fff8e1;color:#f57f17;padding:2px 8px;border-radius:10px;font-size:12px">物流公司</span>',
      'supplier': '<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:12px">供应商</span>',
      'pending': '<span style="background:#ffebee;color:#c62828;padding:2px 8px;border-radius:10px;font-size:12px">待审核</span>'
    }[user.role] || '<span style="color:#888">未知</span>';
    
    var selectOptions = '<select id="role_' + user.uid + '" style="padding:5px;border-radius:4px;border:1px solid #ddd">';
    selectOptions += '<option value="admin"' + (user.role === 'admin' ? ' selected' : '') + '>管理员</option>';
    selectOptions += '<option value="logistics"' + (user.role === 'logistics' ? ' selected' : '') + '>物流公司</option>';
    selectOptions += '<option value="supplier"' + (user.role === 'supplier' ? ' selected' : '') + '>供应商</option>';
    selectOptions += '<option value="pending"' + (user.role === 'pending' ? ' selected' : '') + '>待审核</option>';
    selectOptions += '</select>';
    
    var supplierNameInput = user.role === 'supplier' 
      ? '<input type="text" id="supplierName_' + user.uid + '" value="' + (user.supplierName || '') + '" style="padding:5px;width:120px;border:1px solid #ddd;border-radius:4px" placeholder="供应商名称">'
      : '<span style="color:#aaa">-</span>';
    
    html += '<tr style="border-bottom:1px solid #eee">';
    html += '<td style="padding:10px">' + (user.email || '-') + '</td>';
    html += '<td style="padding:10px;text-align:center">' + selectOptions + '</td>';
    html += '<td style="padding:10px">' + supplierNameInput + '</td>';
    html += '<td style="padding:10px;text-align:center;white-space:normal;max-width:200px">';
    if (user.email) {
      html += '<button type="button" onclick="sendUserPasswordResetEmail(' + JSON.stringify(String(user.email).trim()) + ')" style="padding:4px 8px;background:#0066cc;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;margin:2px">重置邮件</button>';
    }
    html += '<button type="button" onclick="saveUserRole(\'' + user.uid + '\')" style="padding:5px 12px;background:#4CAF50;color:#fff;border:none;border-radius:4px;cursor:pointer;margin:2px">保存</button></td>';
    html += '</tr>';
  });
  
  html += '</table>';
  container.innerHTML = html;
}

// 保存用户角色（独立弹窗 userMgmtModal）
function saveUserRole(uid) {
  var role = document.getElementById('role_' + uid).value;
  var supplierNameInput = document.getElementById('supplierName_' + uid);
  var supplierName = supplierNameInput ? String(supplierNameInput.value || '').trim() : '';
  firebase.database().ref('csm_users/' + uid).once('value').then(function(snap) {
    var prev = snap.val() || {};
    var oldSn = String(prev.supplierName || '').trim();
    var updates = { role: role };
    if (role === 'supplier' && supplierName) {
      updates.supplierName = supplierName;
    } else if (role !== 'supplier') {
      updates.supplierName = '';
    }
    return firebase.database().ref('csm_users/' + uid).update(updates).then(function() {
      if (role === 'supplier' && oldSn && supplierName && oldSn !== supplierName) {
        return propagateSupplierDisplayName(oldSn, supplierName, uid);
      }
    });
  }).then(function() {
    toast('✅ 用户角色已更新', 'ok');
    loadAllUsers();
  }).catch(function(e) {
    toast('❌ 更新失败: ' + e.message, 'err');
  });
}

// 打开用户管理面板
function openUserManagement() {
  var modal = document.getElementById('userMgmtModal');
  if (modal) {
    modal.style.display = 'flex';
    loadAllUsers();
  }
}

// 关闭用户管理面板
function closeUserManagement() {
  var modal = document.getElementById('userMgmtModal');
  if (modal) {
    modal.style.display = 'none';
  }
}



// 更新设置按钮显示状态
function updateSettingsButton() {  var settingsBtn = document.querySelector('button[onclick="openSettings()"]');  if (settingsBtn) {    settingsBtn.style.display = isAdmin ? 'inline-block' : 'none';  }}
// ============================================================
// UTILS
// ============================================================
function gid(id) { return document.getElementById(id); }function pad2(n) { return String(n).padStart(2, '0'); }function nowFmt() {  var d = new Date();  return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());}function setDefTimes() {  var v = nowFmt();  if (gid('f-at')) gid('f-at').value = v;  if (gid('f-dt')) gid('f-dt').value = v;}function fdt(iso) {  if (!iso) return '-';  var d = new Date(iso);  return pad2(d.getDate()) + '/' + pad2(d.getMonth()+1) + '/' + d.getFullYear();}function fmtTitleCase(name) {  var s = String(name || '').trim();  if (!s) return '-';  return s.toLowerCase().replace(/\b([a-z])/g, function(_, c) { return c.toUpperCase(); });}function fmtSupplierName(name) {  return fmtTitleCase(name); }function toast(msg, type) {  var t = document.createElement('div');  t.className = 'tst' + (type === 'ok' ? ' tst-ok' : type === 'err' ? ' tst-err' : '');  t.textContent = msg;  document.body.appendChild(t);  setTimeout(function() { t.remove(); }, 3500);}
// ============================================================
// CHECK IN
// ============================================================
function checkIn() {  console.log('checkIn called, isCheckingIn:', isCheckingIn);  if (isCheckingIn) {    console.log('Already checking in, ignoring');    return;  }  isCheckingIn = true;  var cn = (gid('f-cn').value || '').trim().toUpperCase();  var supplier = (gid('f-supplier').value || '').trim();  var product = (gid('f-product').value || '').trim();  var pallets = parseInt(gid('f-pallets').value) || 1;  var items = parseInt(gid('f-items').value) || 1;  var at = gid('f-at').value;  console.log('checkIn values:', {cn: cn, supplier: supplier, product: product, pallets: pallets, items: items, at: at});  if (!cn || cn.length < 2) { isCheckingIn = false; toast('请输入有效的集装箱号码 (至少2个字符)', 'err'); console.log('validation failed: cn, length:', cn ? cn.length : 0); return; }  if (!product) { isCheckingIn = false; toast('请输入品名', 'err'); console.log('validation failed: product'); return; }  if (!at) { isCheckingIn = false; toast('请输入入库日期', 'err'); console.log('validation failed: at'); return; }  console.log('validation passed, checking exists...');  
// 检查是否已存在  
var exists = recs.some(function(r) {    return r.cn === cn && !r.dep && r.store === currentColdStore && !r.type;  });  if (exists) {    isCheckingIn = false; toast('集装箱 ' + cn + ' 已在 ' + getStoreDisplayName(currentColdStore), 'err');    return;  }  
// 生成序列号  
generateSeq(function(seq) {    var id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);    var rec = {      id: id,      seq: seq,      cn: cn,      supplier: supplier,      product: product,      pallets: pallets,      items: items,      store: currentColdStore,      arr: new Date(at).toISOString(),      dep: null,      pallets_out: 0,      items_out: 0    };    
// 保存到 Firebase    
if (dbRef) {      dbRef.child(id).set(rec)        .then(function() {          console.log('Check-in saved:', id);          isCheckingIn = false;          
// 改变按钮状态为已入库          
var btn = gid('checkInBtn');          console.log('Changing button status, btn:', btn);          if (btn) {            btn.classList.remove('btn-s');            btn.classList.add('btn-g');            btn.innerHTML = '✓ 已入库 Checked In';            btn.disabled = true;            console.log('Button changed to green');          } else {            console.log('Button not found!');          }          toast('✅ 入库成功: ' + cn, 'ok');          
// 清空表单          
gid('f-cn').value = '';          gid('f-supplier').value = '';          gid('f-product').value = '';          gid('f-pallets').value = '1';          gid('f-items').value = '1';        })        .catch(function(e) {          console.error('Check-in error:', e);          toast('入库失败: ' + e.message, 'err');          isCheckingIn = false;        });    } else {      console.error('dbRef is null');      toast('数据库未连接', 'err');      isCheckingIn = false;    }  });}function togglePassword() {  var p = gid('login-password');  if (!p) return;  var btn = gid('btn-login-show-pw');  if (p.type === 'password') {    p.type = 'text';    if (btn) btn.textContent = '隐藏';  } else {    p.type = 'password';    if (btn) btn.textContent = '显示';  }}
// ============================================================
// CHECK OUT
// ============================================================
function checkOut() {  console.log('checkOut called');  var cn = (gid('f-cno').value || '').trim().toUpperCase();  var pallets_out = parseInt(gid('f-pallets-out').value) || 1;  var items_out = parseInt(gid('f-items-out').value) || 1;  var dt = gid('f-dt').value;  console.log('checkOut values:', {cn: cn, pallets_out: pallets_out, items_out: items_out, dt: dt});  if (!cn || cn.length < 2) { toast('请输入集装箱号码', 'err'); console.log('validation failed: cn'); return; }  if (!dt) { toast('请输入出库日期', 'err'); console.log('validation failed: dt'); return; }  
// 找到入库记录  
console.log('Searching for:', cn, 'in store:', currentColdStore);  console.log('Available records:', recs.map(function(r){return {cn:r.cn, store:r.store, dep:r.dep, type:r.type}}));  var rec = recs.find(function(r) {    return r.cn === cn && !r.dep && !r.type && r.store === currentColdStore;  });  console.log('Found record:', rec);  if (!rec) {    toast('未找到在库记录: ' + cn + '（' + getStoreDisplayName(currentColdStore) + '）', 'err');    console.log('rec not found, recs:', recs.filter(function(r){return r.cn === cn}));    return;  }  var remaining_pallets = rec.pallets - (rec.pallets_out || 0);  var remaining_items = rec.items - (rec.items_out || 0);  if (pallets_out > remaining_pallets) {    toast('出库托盘数超过剩余数量', 'err');    return;  }  if (items_out > remaining_items) {    toast('出库件数超过剩余数量', 'err');    return;  }  
// 创建新的出库记录  
var outId = 'out_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);  
// 生成序列号（使用出库日期）  
generateSeq(function(seq) {    var outRec = {      id: outId,      seq: seq,      type: 'checkout',      refId: rec.id,      cn: cn,      supplier: rec.supplier,      product: rec.product,      store: rec.store,      pallets_out: pallets_out,      items_out: items_out,      inPallets: rec.pallets,      inItems: rec.items,      inDate: rec.arr,      dep: new Date(dt).toISOString()    };    
// 保存出库记录到 Firebase    
if (dbRef) {      dbRef.child(outId).set(outRec);    }    
// 更新原入库记录的出库数量    
rec.pallets_out = (rec.pallets_out || 0) + pallets_out;    rec.items_out = (rec.items_out || 0) + items_out;    
// 如果全部出库，标记为已出库    
if (rec.pallets_out >= rec.pallets) {      rec.dep = new Date(dt).toISOString();    }    
// 更新 Firebase    
if (dbRef) {      dbRef.child(rec.id).set(rec);    }    toast('\u2705 \u51fa\u5e93\u6210\u529f: ' + cn + ' \u6258\u76d8: ' + pallets_out + ' \u4ef6\u6570: ' + items_out, 'ok');    gid('f-cno').value = '';    gid('f-pallets-out').value = '1';    gid('f-items-out').value = '1';  }, dt ? new Date(dt + 'T00:00:00') : null);}
// ============================================================
// SAVE & RENDER
// ============================================================
function saveData() {  
// Firebase 自动同步，这里只需要更新  
// 找到最后添加的记录  
var lastRec = recs[recs.length - 1];  if (lastRec && lastRec.id && dbRef) {    dbRef.child(lastRec.id).set(lastRec);  }}function saveRecord(rec) {  if (dbRef && rec.id) {    dbRef.child(rec.id).set(rec);  }}function removeRecordFromFirebase(id) {  if (!id) return;  if (dbRef) dbRef.child(id).remove();  if (legacyDbRef) legacyDbRef.child(id).remove();}function deleteRecord(id) {  removeRecordFromFirebase(id);}function renderAll() {  renderRecords();  renderCheckout();  updStats();  backfillCheckoutSeq();}function renderRecords() {  
// 只显示入库记录  
var inRecs = recs.filter(function(r) { return r.store === currentColdStore && !r.type; })    .sort(function(a, b) { return new Date(b.arr) - new Date(a.arr); });  var tb = gid('tb-all');  var es = gid('es-all');  if (!tb || !es) return;  if (inRecs.length === 0) {    tb.innerHTML = ''; es.style.display = 'block'; return;  }  es.style.display = 'none';  var html = inRecs.map(function(r) {    var remaining_pallets = r.pallets - (r.pallets_out || 0);    var remaining_items = r.items - (r.items_out || 0);    
// 计算已产生的实际费用（从出库记录表）    
var actualFee = calcActualFee(r);    
// 判断是否已全部出库    
var isFullyCheckedOut = remaining_pallets === 0 && r.dep;    var status = r.dep ? '<span class="bdg bdg-d">已出库</span>' : '<span class="bdg bdg-a">在库</span>';    
// 管理员才显示修改按钮    
var editBtn = isAdmin ? '<button class="abtn" onclick="showEditRecord(\'' + r.id + '\')" style="margin-left:4px">✏️</button>' : '';    
// 费用显示逻辑：    
// 1. 在库（未出库或部分出库）：黄色背景显示预估费用    
// 2. 已全部出库：显示实际冷库费总和（关联出库记录）    
var feeDisplay;    if (isFullyCheckedOut && actualFee > 0) {      
// 已全部出库，显示实际费用总和，蓝色加大加粗
feeDisplay = '<strong style="color:#0066cc;font-size:16px">' + actualFee.toFixed(2) + ' AED</strong>';    } 
else if (actualFee > 0) {      
// 部分出库，显示已产生的费用，黄色背景
feeDisplay = '<strong style="color:#ff9900;background:#fff8e1;padding:2px 6px;border-radius:3px">' + actualFee.toFixed(2) + ' AED</strong>';    } 
else {      
// 刚入库未出库，显示 "-"
feeDisplay = '<span style="color:#999">-</span>';    }    
return '<tr style="background:#fff">' +      '<td><strong>' + (r.seq || '-') + '</strong></td>' +      '<td><strong>' + r.cn + '</strong></td>' +      '<td style="font-family:Arial">' + fmtSupplierName(r.supplier) + '</td><td style="font-family:Arial;text-transform:capitalize">' + r.product + '</td>' +      '<td>' + getStoreDisplayName(r.store) + '</td>' +      '<td>' + r.pallets + ' / <span style="color:#ff9900">' + remaining_pallets + '</span></td>' +      '<td>' + r.items + ' / <span style="color:#ff9900">' + remaining_items + '</span></td>' +      '<td>' + fdt(r.arr) + '</td><td>' + fdt(r.dep) + '</td>' +      '<td>' + feeDisplay + '</td>' +      '<td>' + status + '</td>' +      '<td><button class="abtn" onclick="showDet(\'' + r.id + '\')">详情</button>' + editBtn + '</td></tr>';  });  tb.innerHTML = html.join('');}
// 计算已产生的实际费用（基于出库记录表的逻辑）
function calcActualFee(inRec) {
  if (!inRec || !inRec.arr) return 0;
  var outRecs = recs.filter(function(r) {
    if (r.type !== 'checkout') return false;
    if (inRec.id && r.refId) return r.refId === inRec.id;
    return r.cn === inRec.cn && r.store === inRec.store;
  }).sort(function(a, b) {
    return new Date(a.dep) - new Date(b.dep);
  });
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
    var rate = getRateByStore(inRec.store);
    var amount = palletsAtWeekStart > 0 ? (palletsAtWeekStart * rate) : 0;
    var vat = amount * VAT_RATE;
    var weeklyTotal = amount + vat;
    if (weeklyTotal > 0) totalFee += weeklyTotal;
    var weekOutPallets = 0;
    outRecs.forEach(function(or) {
      var od = new Date(or.dep);
      if (od >= weekStart && od <= weekEnd) weekOutPallets += or.pallets_out;
    });
    palletsAtWeekStart = Math.max(0, palletsAtWeekStart - weekOutPallets);
    if (palletsAtWeekStart === 0) break;
    currentDate = new Date(weekEnd);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return totalFee;
}
function getContainerColdFeeSummary(cn) {
  var inRecs = recs.filter(function(r) {
    return !r.type && r.cn === cn;
  });
  if (!inRecs.length) {
    return { hasInRec: false, totalFee: 0, allCheckedOut: false };
  }
  var totalFee = inRecs.reduce(function(sum, inRec) {
    return sum + calcActualFee(inRec);
  }, 0);
  var allCheckedOut = inRecs.every(function(inRec) {
    var remainingPallets = (inRec.pallets || 0) - (inRec.pallets_out || 0);
    return remainingPallets <= 0 && !!inRec.dep;
  });
  return {
    hasInRec: true,
    totalFee: totalFee,
    allCheckedOut: allCheckedOut
  };
}
function getContainerColdFeeBreakdown(cn) {
  var inRecs = recs.filter(function(r) {
    return !r.type && r.cn === cn;
  }).sort(function(a, b) {
    if ((a.store || 0) !== (b.store || 0)) return (a.store || 0) - (b.store || 0);
    return new Date(a.arr || 0) - new Date(b.arr || 0);
  });
  var rows = inRecs.map(function(inRec) {
    var remainingPallets = (inRec.pallets || 0) - (inRec.pallets_out || 0);
    var remainingItems = (inRec.items || 0) - (inRec.items_out || 0);
    var actualFee = calcActualFee(inRec);
    var checkedOut = remainingPallets <= 0 && !!inRec.dep;
    return {
      id: inRec.id,
      store: inRec.store || '',
      product: inRec.product || '',
      supplier: inRec.supplier || '',
      arr: inRec.arr || '',
      dep: inRec.dep || '',
      pallets: inRec.pallets || 0,
      palletsOut: inRec.pallets_out || 0,
      remainingPallets: remainingPallets,
      items: inRec.items || 0,
      itemsOut: inRec.items_out || 0,
      remainingItems: remainingItems,
      checkedOut: checkedOut,
      actualFee: actualFee
    };
  });
  var totalFee = rows.reduce(function(sum, row) {
    return sum + (row.actualFee || 0);
  }, 0);
  var allCheckedOut = rows.length > 0 && rows.every(function(row) {
    return row.checkedOut;
  });
  return {
    rows: rows,
    totalFee: totalFee,
    allCheckedOut: allCheckedOut
  };
}
function showPurchaseCnDetail(cn) {
  var purchaseItems = purchaseRecs.filter(function(r) {
    return r.cn === cn;
  }).sort(function(a, b) {
    return String(a.product || '').localeCompare(String(b.product || ''));
  });
  var breakdown = getContainerColdFeeBreakdown(cn);
  var mcon = gid('mcon');
  if (!mcon) return;
  if (!purchaseItems.length && !breakdown.rows.length) {
    mcon.innerHTML = '<div style="text-align:center;padding:20px;color:#888">未找到该集装箱的采购或冷库数据</div>';
    gid('modal').classList.add('sh');
    return;
  }
  var base = purchaseItems[0] || breakdown.rows[0] || {};
  var totalQty = purchaseItems.reduce(function(sum, item) {
    return sum + (parseFloat(item.qty) || 0);
  }, 0);
  var html = '<div style="text-align:left;min-width:320px">';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">';
  html += '<div class="mr"><span class="ml">集装箱号</span><span class="mv"><strong>' + (cn || '-') + '</strong></span></div>';
  html += '<div class="mr"><span class="ml">供应商</span><span class="mv" style="font-family:Arial">' + fmtSupplierName(base.supplier || '-') + '</span></div>';
  html += '<div class="mr"><span class="ml">采购品名数</span><span class="mv">' + purchaseItems.length + '</span></div>';
  html += '<div class="mr"><span class="ml">采购总数量</span><span class="mv">' + totalQty + '</span></div>';
  html += '<div class="mr"><span class="ml">冷库记录数</span><span class="mv">' + breakdown.rows.length + '</span></div>';
  html += '<div class="mr"><span class="ml">冷库费状态</span><span class="mv">' + (breakdown.allCheckedOut ? '<span style="color:#2e7d32;font-weight:bold">已全部出库</span>' : '<span style="color:#ff9900;font-weight:bold">未全部出库</span>') + '</span></div>';
  html += '<div class="mr" style="grid-column:1 / -1"><span class="ml">冷库费总和</span><span class="mv" style="color:#0066cc;font-weight:bold;font-size:18px">' + (breakdown.allCheckedOut ? breakdown.totalFee.toFixed(2) + ' AED' : '-') + '</span></div>';
  html += '</div>';
  if (purchaseItems.length) {
    html += '<div style="margin-top:14px;border-top:1px solid #ddd;padding-top:12px">';
    html += '<div style="font-size:11px;color:#666;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">采购品名明细</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #ddd">';
    html += '<tr style="background:#f5f5f5"><th style="padding:6px;border:1px solid #ddd">品名</th><th style="padding:6px;border:1px solid #ddd">数量</th><th style="padding:6px;border:1px solid #ddd">采购日期</th></tr>';
    purchaseItems.forEach(function(item) {
      html += '<tr>' +
        '<td style="padding:6px;border:1px solid #ddd;font-family:Arial;text-transform:capitalize">' + fmtTitleCase(item.product || '-') + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd;text-align:center">' + (item.qty || 0) + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd">' + (item.purchaseDate ? fdt(item.purchaseDate + 'T00:00:00') : '-') + '</td>' +
      '</tr>';
    });
    html += '</table></div>';
  }
  if (breakdown.rows.length) {
    html += '<div style="margin-top:14px;border-top:1px solid #ddd;padding-top:12px">';
    html += '<div style="font-size:11px;color:#666;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">各门店冷库费明细 / Cold fee by store</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #ddd">';
    html += '<tr style="background:#f5f5f5">' +
      '<th style="padding:6px;border:1px solid #ddd">门店 / Store</th>' +
      '<th style="padding:6px;border:1px solid #ddd">品名</th>' +
      '<th style="padding:6px;border:1px solid #ddd">托盘 入/剩</th>' +
      '<th style="padding:6px;border:1px solid #ddd">件数 入/剩</th>' +
      '<th style="padding:6px;border:1px solid #ddd">入库</th>' +
      '<th style="padding:6px;border:1px solid #ddd">出库</th>' +
      '<th style="padding:6px;border:1px solid #ddd">状态</th>' +
      '<th style="padding:6px;border:1px solid #ddd">冷库费</th>' +
    '</tr>';
    breakdown.rows.forEach(function(row) {
      html += '<tr>' +
        '<td style="padding:6px;border:1px solid #ddd;text-align:center">' + getStoreDisplayName(row.store) + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd;font-family:Arial;text-transform:capitalize">' + fmtTitleCase(row.product || '-') + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd;text-align:center">' + row.pallets + ' / ' + Math.max(0, row.remainingPallets) + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd;text-align:center">' + row.items + ' / ' + Math.max(0, row.remainingItems) + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd">' + fdt(row.arr) + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd">' + fdt(row.dep) + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd;text-align:center">' + (row.checkedOut ? '<span style="color:#2e7d32;font-weight:bold">已出库</span>' : '<span style="color:#ff9900;font-weight:bold">在库</span>') + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd;text-align:right;color:' + (row.checkedOut ? '#0066cc' : '#ff9900') + ';font-weight:bold">' + (row.actualFee > 0 ? row.actualFee.toFixed(2) + ' AED' : '-') + '</td>' +
      '</tr>';
    });
    html += '</table>';
    html += '<div style="margin-top:8px;font-size:11px;color:#666">采购记录页仅在该集装箱所有冷库记录都全部出库后，才显示冷库费总和。</div>';
    html += '</div>';
  }
  html += '</div>';
  mcon.innerHTML = html;
  gid('modal').classList.add('sh');
}
function calcFee(r) {  if (!r.arr) return 0;  var start = new Date(r.arr);  var end = r.dep ? new Date(r.dep) : new Date();  var days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;  if (days <= 0) return 0;  var weeks = Math.ceil(days / 7);  var totalPallets = r.pallets - (r.pallets_out || 0);  var rate = getRateByStore(r.store);  return weeks * totalPallets * rate * (1 + VAT_RATE);}function updStats() {  if (!gid('s-total') || !gid('s-pallets') || !gid('s-items')) return;  
// 只统计入库记录（排除出库记录类型）  
var inRecsAll = recs.filter(function(r) { return !r.type; });  var inRecs = inRecsAll.filter(function(r) { return r.store === currentColdStore && !r.dep; });  
// 顶部统计显示当前冷库的在库数据  
gid('s-total').textContent = inRecs.length;  gid('s-pallets').textContent = inRecs.reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);  gid('s-items').textContent = inRecs.reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);  
// 冷库1统计（只统计入库记录且在库的）  
var store1Recs = inRecsAll.filter(function(r) { return r.store === 1 && !r.dep; });  gid('stat-store1-count').textContent = store1Recs.length;  gid('stat-store1-pallets').textContent = store1Recs.reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);  gid('stat-store1-items').textContent = store1Recs.reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);  
// 冷库2统计  
var store2Recs = inRecsAll.filter(function(r) { return r.store === 2 && !r.dep; });  gid('stat-store2-count').textContent = store2Recs.length;  gid('stat-store2-pallets').textContent = store2Recs.reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);  gid('stat-store2-items').textContent = store2Recs.reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);  
// 冷库3统计  
var store3Recs = inRecsAll.filter(function(r) { return r.store === 3 && !r.dep; });  gid('stat-store3-count').textContent = store3Recs.length;  gid('stat-store3-pallets').textContent = store3Recs.reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);  gid('stat-store3-items').textContent = store3Recs.reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);  
// 冷库4统计  
var store4Recs = inRecsAll.filter(function(r) { return r.store === 4 && !r.dep; });  gid('stat-store4-count').textContent = store4Recs.length;  gid('stat-store4-pallets').textContent = store4Recs.reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);  gid('stat-store4-items').textContent = store4Recs.reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);}function renderCheckout() {  
// 按集装箱号分组出库记录（只显示当前冷库的）  
var cnGroups = {};  recs.filter(function(r) { return r.type === 'checkout' && r.store === currentColdStore; }).forEach(function(r) {    if (!cnGroups[r.cn]) {      cnGroups[r.cn] = {        recs: [],        inRec: null      };    }    cnGroups[r.cn].recs.push(r);  });  
// 为每个集装箱找到对应的入库记录  
Object.keys(cnGroups).forEach(function(cn) {    var outs = cnGroups[cn].recs;    if (outs.length > 0) {      cnGroups[cn].inRec = recs.find(function(r) { return r.id === outs[0].refId; });    }  });  
// 添加没有出库记录的入库集装箱（只显示当前冷库的）  
var allInRecs = recs.filter(function(r) { return !r.type && r.store === currentColdStore; });  allInRecs.forEach(function(inRec) {    if (!cnGroups[inRec.cn]) {      cnGroups[inRec.cn] = {        recs: [],        inRec: inRec      };    } else if (!cnGroups[inRec.cn].inRec) {      cnGroups[inRec.cn].inRec = inRec;    }  });  var tb = gid('tb-checkout');  var es = gid('es-checkout');  if (!tb || !es) return;  
// 检查是否有任何入库记录  
if (allInRecs.length === 0) {    tb.innerHTML = '';    es.style.display = 'block';    return;  }  es.style.display = 'none';  var html = [];  
// 按集装箱号排序  
Object.keys(cnGroups).sort().forEach(function(cn) {    var group = cnGroups[cn];    var inRec = group.inRec;    var outRecs = (group.recs || []).sort(function(a, b) { return new Date(a.dep) - new Date(b.dep); });    if (!inRec) return;    
// 应用搜索筛选    
if (!matchSearchFilters(inRec)) return;    var startDate = new Date(inRec.arr);    
// 如果有出库记录，使用最后出库日期作为结束日期    
// 如果没有出库记录，使用当前日期显示第一周    
var endDate = outRecs.length > 0 ? new Date(outRecs[outRecs.length - 1].dep) : new Date();    
// 计算每周费用    
var totalFee = 0;    var currentDate = new Date(startDate);    var weekNum = 1;    var palletsAtWeekStart = inRec.pallets;    var itemsOutSoFar = 0;    var palletsOutSoFar = 0;    
// 生成每周汇总记录    
// 至少显示第一周    
var firstLoop = true;    while (firstLoop || (currentDate <= endDate && outRecs.length > 0)) {      firstLoop = false;      var weekStart = new Date(currentDate);      var weekEnd = new Date(weekStart);      weekEnd.setDate(weekEnd.getDate() + 6);      var actualEnd = weekEnd < endDate ? weekEnd : endDate;      
// 该周费用 = 该周第一天的托盘数 × 费率 × 5%      
var prevPallets = palletsAtWeekStart;      
// 金额 = 单价 × 托盘数量（根据冷库选择费率）      
var rate = getRateByStore(inRec.store);      var amount = prevPallets > 0 ? (prevPallets * rate) : 0;      
// 5% VAT = 金额 × 5%      
var vat = amount * VAT_RATE;      
// 合计 = 金额 + VAT      
var weeklyTotal = amount + vat;      if (weeklyTotal > 0) {        totalFee += weeklyTotal;      }      
// 格式：第N周 (MM/DD-MM/DD)      
var startStr = (weekStart.getMonth() + 1) + '/' + weekStart.getDate();      var endStr = (weekEnd.getMonth() + 1) + '/' + weekEnd.getDate();      var weekLabel = '第' + weekNum + '周 (' + startStr + '-' + endStr + ')';      
// 该周出库托盘数      
var weekOutPallets = 0;      var weekOutItems = 0;      outRecs.forEach(function(or) {        var od = new Date(or.dep);        if (od >= weekStart && od <= weekEnd) {          weekOutPallets += or.pallets_out;          weekOutItems += or.items_out;        }      });      
// 下周起始托盘数      
var prevPallets = palletsAtWeekStart;      palletsAtWeekStart = Math.max(0, palletsAtWeekStart - weekOutPallets);      
// 判断是否是最后一周（全部出库完成）      
var isLastWeek = palletsAtWeekStart === 0;      var isFirstWeek = weekNum === 1;      
// 托盘数和件数显示逻辑：0显示为"-"      
var displayPallets = prevPallets > 0 ? prevPallets : '-';      var displayOutPallets = weekOutPallets > 0 ? ('-' + weekOutPallets) : '-';      var displayOutItems = weekOutItems > 0 ? ('-' + weekOutItems) : '-';      
// 入库件数只在第一周显示      
var displayInItems = isFirstWeek ? '<strong style="color:#ff9900">' + inRec.items + '</strong>' : '-';      
// 每周汇总行 - 显示本周开始时的剩余件数      
// 如果托盘已全部出库，剩余件数必须为0      
var remainingItemsAtWeekStart;      if (isLastWeek) {        remainingItemsAtWeekStart = 0;      } else {        remainingItemsAtWeekStart = inRec.items - itemsOutSoFar;      }      var displayRemItems = remainingItemsAtWeekStart > 0 ? remainingItemsAtWeekStart : '0';      
// 第一周用中黄色，最后一周用淡绿色，其他用淡黄色      
var rowBg = isFirstWeek ? 'background:#fff59d' : (isLastWeek ? 'background:#e8f5e9' : 'background:#fff3cd');      
// 本周合计 = 金额 + VAT      
var weekTotal = amount + vat;      
// 合计显示逻辑：最后一周显示总金额，其他周显示本周合计      
var weekTotalDisplay;      if (isLastWeek && totalFee > 0) {        
// 最后一周显示总冷库费（累计），加大加粗蓝色
weekTotalDisplay = '<strong style="color:#0066cc;font-size:18px">' + totalFee.toFixed(2) + '</strong>';      } 
else if (weekTotal > 0) {        
// 其他周显示本周合计
weekTotalDisplay = '<strong style="color:#0066cc">' + weekTotal.toFixed(2) + '</strong>';      } 
else {        weekTotalDisplay = '-';      }      html.push('<tr style="' + rowBg + '">' +        '<td style="font-size:13px;color:#0066cc">' + (inRec.seq || '-') + '</td>' +        '<td><strong style="cursor:pointer;color:#0066cc;text-decoration:underline" onclick="showCheckoutDetail(\'' + cn + '\')">' + cn + '</strong></td>' +        '<td style="font-family:Arial">' + fmtSupplierName(inRec.supplier) + '</td>' +        '<td style="font-family:Arial;text-transform:capitalize">' + inRec.product + '</td>' +        '<td style="font-weight:bold;color:#0066cc">' + weekLabel + '</td>' +        '<td><strong>' + displayPallets + '</strong></td>' +        '<td><span style="color:#cc0000">' + displayOutPallets + '</span></td>' +        '<td><span style="color:#cc0000">' + displayOutItems + '</span></td>' +        '<td><strong style="color:#00aa00">' + displayRemItems + '</strong></td>' +        '<td>' + displayInItems + '</td>' +        '<td>' + (prevPallets > 0 ? rate.toFixed(2) : '-') + '</td>' +        '<td>' + (prevPallets > 0 ? amount.toFixed(2) : '-') + '</td>' +        '<td>' + (prevPallets > 0 ? vat.toFixed(2) : '-') + '</td>' +        '<td>' + weekTotalDisplay + '</td>' +        '</tr>');      
// 该周的出库明细（绿色背景，显示在该周下面）      
var weekOutRecs = outRecs.filter(function(or) {        var od = new Date(or.dep);        return od >= weekStart && od <= weekEnd;      });      weekOutRecs.forEach(function(or) {        
// 累计到当前出库的总件数（包括之前周的）
itemsOutSoFar += or.items_out;
palletsOutSoFar += or.pallets_out;
// 计算出库后的剩余件数 = 入库件数 - 累计出库件数        
var outRemItems = inRec.items - itemsOutSoFar;        
// 计算出库后的剩余托盘数 = 入库托盘数 - 累计出库托盘数        
var outRemPallets = inRec.pallets - palletsOutSoFar;        
// 如果剩余托盘为0，剩余件数也必须为0        
if (outRemPallets === 0) {          outRemItems = 0;        }        
// 管理员才显示修改按钮        
var editOutBtn = isAdmin ? '<button class="abtn" onclick="showEditOutRecord(\'' + or.id + '\')" style="margin-left:4px">✏️</button>' : '';        html.push('<tr style="background:#f0fff0">' +          '<td style="padding-left:20px;color:#0066cc;font-size:13px">' + (or.seq || '-') + '</td>' +          '<td style="padding-left:20px;color:#999">' + cn + '</td>' +          '<td style="color:#999;font-family:Arial">' + fmtSupplierName(or.supplier) + '</td>' +          '<td style="color:#999;font-family:Arial;text-transform:capitalize">' + or.product + '</td>' +          '<td style="color:#00aa00;font-weight:bold">' + fdt(or.dep) + '</td>' +          '<td>-</td>' +          '<td><span style="color:#cc0000;font-weight:bold">' + or.pallets_out + '</span> / <strong style="color:#00aa00">' + (outRemPallets >= 0 ? outRemPallets : '0') + '</strong></td>' +          '<td><span style="color:#cc0000;font-weight:bold">' + or.items_out + '</span></td>' +          '<td><strong style="color:#00aa00">' + (outRemItems >= 0 ? outRemItems : '0') + '</strong></td>' +          '<td>-</td>' +          '<td>-</td>' +          '<td>-</td>' +          '<td>-</td>' +          '<td>' + editOutBtn + '</td>' +          '</tr>');      });      currentDate = new Date(weekEnd);      currentDate.setDate(currentDate.getDate() + 1);      weekNum++;    }  });  tb.innerHTML = html.join('');}
// ============================================================
// 搜索和导出功能
// ============================================================
var checkoutSearchFilters = {  cn: '',  supplier: '',  product: '',  dateStart: '',  dateEnd: ''};function applySearch() {  checkoutSearchFilters = {    cn: (gid('search-cn').value || '').trim().toLowerCase(),    supplier: (gid('search-supplier').value || '').trim().toLowerCase(),    product: (gid('search-product').value || '').trim().toLowerCase(),    dateStart: gid('search-date-start').value || '',    dateEnd: gid('search-date-end').value || ''  };  renderCheckout();  toast('Confirmed', 'ok');}function resetSearch() {  gid('search-cn').value = '';  gid('search-supplier').value = '';  gid('search-product').value = '';  gid('search-date-start').value = '';  gid('search-date-end').value = '';  checkoutSearchFilters = {    cn: '',    supplier: '',    product: '',    dateStart: '',    dateEnd: ''  };  renderCheckout();  toast('Filters reset', 'ok');}function matchSearchFilters(inRec) {  var f = checkoutSearchFilters;  
// 集装箱号匹配  
if (f.cn && (inRec.cn || '').toLowerCase().indexOf(f.cn) < 0) {    return false;  }  
// 供应商匹配  
if (f.supplier && (inRec.supplier || '').toLowerCase().indexOf(f.supplier) < 0) {    return false;  }  
// 品名匹配  
if (f.product && (inRec.product || '').toLowerCase().indexOf(f.product) < 0) {    return false;  }  
// 日期范围匹配  
if (f.dateStart || f.dateEnd) {    var arrDate = new Date(inRec.arr);    if (f.dateStart && arrDate < new Date(f.dateStart)) {      return false;    }    if (f.dateEnd && arrDate > new Date(f.dateEnd)) {      return false;    }  }  return true;}function exportCheckout() {  
// 获取搜索后的数据（只显示当前冷库的）  
var data = [];  var cnGroups = {};  recs.filter(function(r) { return r.type === 'checkout' && r.store === currentColdStore; }).forEach(function(r) {    if (!cnGroups[r.cn]) {      cnGroups[r.cn] = { recs: [], inRec: null };    }    cnGroups[r.cn].recs.push(r);  });  Object.keys(cnGroups).forEach(function(cn) {    var outs = cnGroups[cn].recs;    if (outs.length > 0) {      cnGroups[cn].inRec = recs.find(function(r) { return r.id === outs[0].refId; });    }  });  
// 添加没有出库记录的入库集装箱（只显示当前冷库的）  
var allInRecs = recs.filter(function(r) { return !r.type && r.store === currentColdStore; });  allInRecs.forEach(function(inRec) {    if (!cnGroups[inRec.cn]) {      cnGroups[inRec.cn] = { recs: [], inRec: inRec };    } else if (!cnGroups[inRec.cn].inRec) {      cnGroups[inRec.cn].inRec = inRec;    }  });  
// 表头  
data.push(['Seq No', 'Container', 'Supplier', 'Product', 'Week / Date', 'Pallets', 'Out Pallets', 'Out Items', 'Rem Items', 'In Items', 'Unit Price', 'Amount', '5% VAT', 'Total']);  
// 按集装箱号排序  
Object.keys(cnGroups).sort().forEach(function(cn) {    var group = cnGroups[cn];    var inRec = group.inRec;    var outRecs = (group.recs || []).sort(function(a, b) { return new Date(a.dep) - new Date(b.dep); });    if (!inRec) return;    
// 应用搜索筛选    
if (!matchSearchFilters(inRec)) return;    var startDate = new Date(inRec.arr);    var endDate = outRecs.length > 0 ? new Date(outRecs[outRecs.length - 1].dep) : new Date();    var totalFee = 0;    var currentDate = new Date(startDate);    var weekNum = 1;    var palletsAtWeekStart = inRec.pallets;    var itemsOutSoFar = 0;    var palletsOutSoFar = 0;    var firstLoop = true;    while (firstLoop || (currentDate <= endDate && outRecs.length > 0)) {      firstLoop = false;      var weekStart = new Date(currentDate);      var weekEnd = new Date(weekStart);      weekEnd.setDate(weekEnd.getDate() + 6);      var prevPallets = palletsAtWeekStart;      var rate = getRateByStore(inRec.store);      var amount = prevPallets > 0 ? (prevPallets * rate) : 0;      var vat = amount * VAT_RATE;      var weeklyTotal = amount + vat;      if (weeklyTotal > 0) totalFee += weeklyTotal;      var startStr = (weekStart.getMonth() + 1) + '/' + weekStart.getDate();      var endStr = (weekEnd.getMonth() + 1) + '/' + weekEnd.getDate();      var weekLabel = '第' + weekNum + '周 (' + startStr + '-' + endStr + ')';      var weekOutPallets = 0;      var weekOutItems = 0;      outRecs.forEach(function(or) {        var od = new Date(or.dep);        if (od >= weekStart && od <= weekEnd) {          weekOutPallets += or.pallets_out;          weekOutItems += or.items_out;        }      });      palletsAtWeekStart = Math.max(0, palletsAtWeekStart - weekOutPallets);      var isLastWeek = palletsAtWeekStart === 0;      var displayPallets = prevPallets > 0 ? prevPallets : 0;      var displayOutPallets = weekOutPallets > 0 ? weekOutPallets : 0;      var displayOutItems = weekOutItems > 0 ? weekOutItems : 0;      var displayInItems = weekNum === 1 ? inRec.items : 0;      var remainingItemsAtWeekStart = isLastWeek ? 0 : (inRec.items - itemsOutSoFar);      data.push([        inRec.seq || '-',        inRec.cn,        inRec.supplier || '-',        inRec.product || '-',        weekLabel,        displayPallets,        displayOutPallets,        displayOutItems,        remainingItemsAtWeekStart,        displayInItems,        prevPallets > 0 ? rate.toFixed(2) : '-',        prevPallets > 0 ? amount.toFixed(2) : '-',        prevPallets > 0 ? vat.toFixed(2) : '-',        totalFee.toFixed(2)      ]);      currentDate = new Date(weekEnd);      currentDate.setDate(currentDate.getDate() + 1);      weekNum++;    }  });  
// 导出为 CSV  
var csvContent = '\uFEFF';
// BOM for Excel
data.forEach(function(row) {
  csvContent += row.map(function(cell) {
    return '"' + String(cell).replace(/"/g, '""') + '"';
  }).join(',') + '\n';
});
var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
var link = document.createElement('a');
link.href = URL.createObjectURL(blob);
link.download = 'checkout_records_' + new Date().toISOString().slice(0, 10) + '.csv';
link.click();
toast('Export completed', 'ok');
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
  var outRecs = recs.filter(function(x) { return x.refId === r.id && x.type === 'checkout'; });
  var mcon = gid('mcon');
  if (mcon) {
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">';
    html += '<div class="mr"><span class="ml">集装箱号</span><span class="mv"><strong>' + r.cn + '</strong></span></div>';
    html += '<div class="mr"><span class="ml">供应商</span><span class="mv" style="font-family:Arial">' + fmtSupplierName(r.supplier) + '</span></div>';
    html += '<div class="mr"><span class="ml">品名</span><span class="mv">' + r.product + '</span></div>';
    html += '<div class="mr"><span class="ml">门店 Store</span><span class="mv">' + getStoreDisplayName(r.store) + '</span></div>';
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
    if (outRecs.length > 0) {
      html += '<div style="margin-top:14px;border-top:1px solid #ddd;padding-top:12px">';
      html += '<div style="font-size:11px;color:#666;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">出库记录 (' + outRecs.length + ' 次)</div>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #ddd">';
      html += '<tr style="background:#f5f5f5"><th style="padding:6px;border:1px solid #ddd">#</th>';
      html += '<th style="padding:6px;border:1px solid #ddd">出库日期</th>';
      html += '<th style="padding:6px;border:1px solid #ddd">托盘</th>';
      html += '<th style="padding:6px;border:1px solid #ddd">件数</th></tr>';
      outRecs.forEach(function(or, i) {
        html += '<tr><td style="padding:6px;border:1px solid #ddd;text-align:center">' + (i + 1) + '</td>';
        html += '<td style="padding:6px;border:1px solid #ddd">' + fdt(or.dep) + '</td>';
        html += '<td style="padding:6px;border:1px solid #ddd;color:#cc0000">' + or.pallets_out + '</td>';
        html += '<td style="padding:6px;border:1px solid #ddd;color:#cc0000">' + or.items_out + '</td></tr>';
      });
      html += '</table></div>';
    }
    html += '<div style="margin-top:10px;padding:8px;background:#f0f0f0;border-radius:4px;font-size:11px;color:#666">';
    var rate = getRateByStore(r.store);
    html += '费率: ' + rate + ' AED/托盘/周 + ' + (VAT_RATE * 100) + '% VAT = ' + (rate * (1 + VAT_RATE)).toFixed(2) + ' AED/托盘/周';
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
  var inRec = recs.find(function(r) { return r.cn === cn && !r.type; });
  if (!inRec) return;
  var remaining_pallets = inRec.pallets - (inRec.pallets_out || 0);
  var remaining_items = inRec.items - (inRec.items_out || 0);
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
  var cnSelect = gid('clear-cn-select');
  cnSelect.innerHTML = '';
  if (type === 'records') {
    var inRecs = recs.filter(function(r) { return !r.type; });
    var cns = Array.from(new Set(inRecs.map(function(r) { return r.cn; })));
    cns.sort().forEach(function(cn) {
      cnSelect.innerHTML += '<option value="' + cn + '">' + cn + '</option>';
    });
  } else if (type === 'checkout') {
    var outRecs = recs.filter(function(r) { return r.type === 'checkout'; });
    var outCns = Array.from(new Set(outRecs.map(function(r) { return r.cn; })));
    outCns.sort().forEach(function(cn) {
      cnSelect.innerHTML += '<option value="' + cn + '">' + cn + '</option>';
    });
  }
  gid('clearModal').classList.add('sh');
}
function closeClearModal() {
  gid('clearModal').classList.remove('sh');
}
document.addEventListener('DOMContentLoaded', function() {
  var clearOption = gid('clear-option');
  if (clearOption) {
    clearOption.addEventListener('change', function() {
      var cnContainer = gid('clear-cn-select-container');
      cnContainer.style.display = this.value === 'by-cn' ? 'block' : 'none';
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
  if (!confirm('⚠️ 最后确认：此操作不可恢复！确定继续吗？')) {
    return;
  }
  idsToDelete.forEach(function(id) {
    removeRecordFromFirebase(id);
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
  r.pallets_out = newPalletsOut;
  r.items_out = newItemsOut;
  inRec.pallets_out = totalPalletsOut;
  inRec.items_out = totalItemsOut;
  if (inRec.pallets_out >= inRec.pallets && !inRec.dep) {
    inRec.dep = r.dep;
  }
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
function selectColdStore(n) {  currentColdStore = n;  document.querySelectorAll('.warehouse-btn').forEach(function(btn, i) {    btn.classList.toggle('active', i + 1 === n);  });  renderAll();}
// ============================================================
// TAB SWITCH
// ============================================================
function swTab(tab) {  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('ac'); });  document.querySelectorAll('.tc').forEach(function(t) { t.classList.remove('ac'); });  var tabNames = ['purchase', 'records', 'checkout', 'stats', 'sales', 'sales_finance'];  var idx = tabNames.indexOf(tab);  if (idx < 0) idx = 0;  var tabs = document.querySelectorAll('.tab');  if (tabs[idx]) tabs[idx].classList.add('ac');  var panel = document.getElementById('tc-' + tab);  if (panel) panel.classList.add('ac');  if (tab === 'sales') { try { refreshSalesUi(); swSalesSub(salesSubView || 'dash'); } catch (eS) {} }  if (tab === 'sales_finance') { try { refreshSalesUi(); } catch (eF) {} }}
// ============================================================
// PURCHASE RECORDS
// ============================================================
var PURCHASE_KEY = 'csm_purchase_v1';var purchaseRecs = [];
// 供应商采购记录
var SUPPLIER_RECS_KEY = 'csm_supplier_recs_v1';var supplierRecs = [];var supplierRef = null;function loadPurchase() {  try {    var stored = localStorage.getItem(PURCHASE_KEY);    purchaseRecs = stored ? JSON.parse(stored) : [];  } catch(e) { purchaseRecs = []; }}function savePurchase() {}
// Firebase 自动同步
function savePurchaseItem(item) {  if (purchaseRef && item.id) {    purchaseRef.child(item.id).set(item);  }}function openPurchaseForm() {  
// 重置入库按钮状态  
var checkInBtn = gid('checkInBtn');  if (checkInBtn) {    checkInBtn.classList.remove('btn-g');    checkInBtn.classList.add('btn-s');    checkInBtn.innerHTML = '✓ 入库 Check In';    checkInBtn.disabled = false;  }  
// 重置表单  
var cnField = gid('fp-cn');  var supplierField = gid('fp-supplier');  var dateField = gid('fp-date');  var itemsBody = gid('purchaseItemsBody');  purchaseItemRowCounter = 0;  if (cnField) cnField.value = '';  if (supplierField) supplierField.value = '';  if (dateField) dateField.value = nowFmt();  if (itemsBody) {    itemsBody.innerHTML = '<tr class="purchase-item-row">' +      '<td style="padding:4px;border:1px solid #ddd;position:relative">' +        '<input type="text" class="item-product" placeholder="品名" data-rowid="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px" oninput="showSuggestPurchaseItem(this)" onfocus="showSuggestPurchaseItem(this)" onblur="setTimeout(function(){hideSuggest(\'purchase-item-0\')},200)">' +        '<div class="suggest-list" id="suggest-purchase-item-0"></div>' +      '</td>' +      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-qty" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-demurrage" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-customs" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-coldfee" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-attestation" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-repack" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +      '<td style="padding:4px;border:1px solid #ddd;text-align:center"><button type="button" class="abtn x" onclick="removePurchaseItem(this)" style="color:#ff4444;font-size:16px">×</button></td>' +      '</tr>';  }  gid('purchaseModal').classList.add('sh');}function clPurchaseModal() {  
// 重置表单  
var cnField = gid('fp-cn');  var supplierField = gid('fp-supplier');  var dateField = gid('fp-date');  var itemsBody = gid('purchaseItemsBody');  purchaseItemRowCounter = 0;  if (cnField) cnField.value = '';  if (supplierField) supplierField.value = '';  if (dateField) dateField.value = '';  if (itemsBody) {    itemsBody.innerHTML = '<tr class="purchase-item-row">' +      '<td style="padding:4px;border:1px solid #ddd;position:relative">' +        '<input type="text" class="item-product" placeholder="品名" data-rowid="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px" oninput="showSuggestPurchaseItem(this)" onfocus="showSuggestPurchaseItem(this)" onblur="setTimeout(function(){hideSuggest(\'purchase-item-0\')},200)">' +        '<div class="suggest-list" id="suggest-purchase-item-0"></div>' +      '</td>' +      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-qty" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-demurrage" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-customs" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-coldfee" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-attestation" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +      '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-repack" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +      '<td style="padding:4px;border:1px solid #ddd;text-align:center"><button type="button" class="abtn x" onclick="removePurchaseItem(this)" style="color:#ff4444;font-size:16px">×</button></td>' +      '</tr>';  }  gid('purchaseModal').classList.remove('sh');}function addPurchase() {  console.log('addPurchase called');  var cn = (gid('fp-cn').value || '').trim().toUpperCase();  var supplier = (gid('fp-supplier').value || '').trim();  var purchaseDate = gid('fp-date').value;  if (!cn) { toast('请输入集装箱号 / Enter container no.', 'err'); return; }  if (!supplier) { toast('请输入供应商', 'err'); return; }  
// 获取所有品名行  
var rows = document.querySelectorAll('.purchase-item-row');  console.log('Found rows:', rows.length);  var items = [];  rows.forEach(function(row, idx) {    var productInput = row.querySelector('.item-product');    var product = (productInput.value || '').trim();    console.log('Row', idx, 'product:', product);    if (!product) return; 
// 跳过空品名行    
var item = {      qty: parseFloat(row.querySelector('.item-qty').value) || 0,      demurrage: parseFloat(row.querySelector('.item-demurrage').value) || 0,      customs: parseFloat(row.querySelector('.item-customs').value) || 0,      coldFee: parseFloat(row.querySelector('.item-coldfee').value) || 0,      attestation: parseFloat(row.querySelector('.item-attestation').value) || 0,      repack: parseFloat(row.querySelector('.item-repack').value) || 0    };    
// 为每个品名创建单独的采购记录    
var id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5) + idx;    var rec = {      id: id,      cn: cn,      supplier: supplier,      product: product,      purchaseDate: purchaseDate,      qty: item.qty,      demurrage: item.demurrage,      customs: item.customs,      coldFee: item.coldFee,      attestation: item.attestation,      repack: item.repack,      waste: 0,      other: 0    };    items.push(rec);    console.log('Added item:', rec.product);    
// 生成序列号（使用采购日期）并保存到 Firebase
generateSeq(function(seq) {
  rec.seq = seq;
  if (purchaseRef) {
    purchaseRef.child(id).set(rec).then(function() {
      console.log('Saved:', id, 'seq:', seq);
    }).catch(function(e) {
      console.error('Error:', e);
    });
  }
}, purchaseDate ? new Date(purchaseDate + 'T00:00:00') : null);
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
function addPurchaseItem() {  purchaseItemRowCounter++;  var rowId = purchaseItemRowCounter;  var newRow = document.createElement('tr');  newRow.className = 'purchase-item-row';  newRow.innerHTML =    '<td style="padding:4px;border:1px solid #ddd;position:relative">' +      '<input type="text" class="item-product" placeholder="品名" data-rowid="' + rowId + '" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px" oninput="showSuggestPurchaseItem(this)" onfocus="showSuggestPurchaseItem(this)" onblur="setTimeout(function(){hideSuggest(\'purchase-item-' + rowId + '\')},200)">' +      '<div class="suggest-list" id="suggest-purchase-item-' + rowId + '"></div>' +    '</td>' +    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-qty" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-demurrage" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-customs" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-coldfee" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-attestation" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +    '<td style="padding:4px;border:1px solid #ddd"><input type="number" class="item-repack" value="0" min="0" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;text-align:center"></td>' +    '<td style="padding:4px;border:1px solid #ddd;text-align:center"><button type="button" class="abtn x" onclick="removePurchaseItem(this)" style="color:#ff4444;font-size:16px">×</button></td>';  document.getElementById('purchaseItemsBody').appendChild(newRow);}
// 删除品名行
function removePurchaseItem(btn) {  var rows = document.querySelectorAll('.purchase-item-row');  if (rows.length > 1) {    btn.closest('tr').remove();  } else {    toast('至少保留一行品名', 'err');  }}function delPurchase(id) {  if (!confirm('确认删除这条采购记录？ / Confirm delete?')) return;  if (purchaseRef) {    purchaseRef.child(id).remove();  }}function filterPurchase() { renderPurchase(); }function resetPurchaseSearch() {  gid('search-purchase-date').value = '';  gid('search-purchase-cn').value = '';  gid('search-purchase-supplier').value = '';  renderPurchase();}function renderPurchase() { console.log("purchaseRecs:", purchaseRecs);  var tb = gid('tb-purchase');  var es = gid('es-purchase');  if (!tb || !es) return;  
// 获取搜索条件  
var searchDate = (gid('search-purchase-date').value || '').trim();  var searchCn = (gid('search-purchase-cn').value || '').trim().toUpperCase();  var searchSupplier = (gid('search-purchase-supplier').value || '').trim().toUpperCase();  
// 过滤 warehouse1 采购记录  
var filteredRecs = purchaseRecs.filter(function(r) {    var matchDate = !searchDate || (r.purchaseDate || '').indexOf(searchDate) !== -1;    var matchCn = !searchCn || (r.cn || '').indexOf(searchCn) !== -1;    var matchSupplier = !searchSupplier || (r.supplier || '').toUpperCase().indexOf(searchSupplier) !== -1;    return matchDate && matchCn && matchSupplier;  });  
// 合并供应商记录：只显示尚未在 warehouse1 采购列表中的记录  
var adoptedSupplierIds = {};  purchaseRecs.forEach(function(r) { if (r.sourceSupplierRecId) adoptedSupplierIds[r.sourceSupplierRecId] = true; });  var supplierOnlyRecs = supplierRecs.filter(function(r) {    if (!r.id || !r.cn) return false;    if (adoptedSupplierIds[r.id]) return false;     if (isAdmin && r.status !== 'submitted' && r.status !== 'confirmed') return false;
// 已在 warehouse1 中，不再重复显示    
var matchDate = !searchDate || (r.purchaseDate || '').indexOf(searchDate) !== -1;    var matchCn = !searchCn || (r.cn || '').indexOf(searchCn) !== -1;    var matchSupplier = !searchSupplier || (r.supplier || '').toUpperCase().indexOf(searchSupplier) !== -1;    return matchDate && matchCn && matchSupplier;  });  if (filteredRecs.length === 0 && supplierOnlyRecs.length === 0) { tb.innerHTML = ''; es.style.display = 'block'; return; }  es.style.display = 'none';  
// 按集装箱号分组  
var cnGroups = {};  filteredRecs.forEach(function(r) {    var key = r.cn || '_empty_';    if (!cnGroups[key]) cnGroups[key] = [];    cnGroups[key].push(r);  });  var html = '';  Object.keys(cnGroups).sort().forEach(function(cn) {    var rawCn = cn;    var items = cnGroups[cn];    var groupId = 'group-' + cn.replace(/[^a-zA-Z0-9]/g, '');    var firstItem = items[0];    var totalItems = items.length;    var totalAmount = items.reduce(function(s, r) { return s + ((r.demurrage||0)+(r.customs||0)+(r.coldFee||0)+(r.attestation||0)+(r.repack||0)+(r.waste||0)+(r.other||0)); }, 0);    var purchaseDate = firstItem.purchaseDate ? fdt(firstItem.purchaseDate+'T00:00:00') : '-';    
// 按集装箱汇总所有冷库的冷库费；只有全部出库完成后才在采购页显示总和    
var coldFeeSummary = getContainerColdFeeSummary(rawCn);    var coldFeeDisplay = '-';    if (coldFeeSummary.hasInRec && coldFeeSummary.allCheckedOut) {      coldFeeDisplay = '<strong style="color:#0066cc;background:#e8f4ff;padding:2px 6px;border-radius:3px;font-size:14px">' + coldFeeSummary.totalFee.toFixed(2) + '</strong>';    }    if (cn === '_empty_') cn = '-';    
// 主行：集装箱号 + 展开按钮    
var expandBtn = totalItems > 1 ?      '<button type="button" class="abtn" style="background:#f0f0f0;border:1px solid #ddd;padding:2px 6px;font-size:14px" onclick="togglePurchaseGroup(\'' + groupId + '\',this)">+</button>' : '';    var firstProduct = firstItem.product || '-';    var firstQty = firstItem.qty || '-';    var firstSeq = firstItem.seq || '-';    html += '<tr style="background:#f9f9f9;font-weight:bold" id="pur-main-' + groupId + '">' +      '<td style="font-size:13px;color:#0066cc">' + firstSeq + '</td>' +      '<td>' + expandBtn + ' <button type="button" class="abtn" style="background:#fff3e0;border-color:#ff9800;color:#e65100;padding:2px 6px;font-size:11px" onclick="showPurchaseCnDetail(\'' + rawCn + '\')">详情</button> <button type="button" class="abtn" style="background:#e8f4ff;border-color:#00bfff;color:#00bfff;padding:2px 6px;font-size:11px" onclick="quickCheckIn(\'' + firstItem.id + '\')">📥</button> ' + cn + ' <span style="color:#999;font-size:11px">(' + totalItems + '品名)</span></td>' +      '<td style="font-family:Arial">'+fmtSupplierName(firstItem.supplier)+'</td><td style="font-family:Arial;text-transform:capitalize">'+fmtTitleCase(firstProduct)+'</td><td>'+purchaseDate+'</td><td style="font-family:Arial">'+firstQty+'</td><td style="font-family:Arial">'+(firstItem.demurrage||0)+'</td><td style="font-family:Arial">'+(firstItem.customs||0)+'</td><td style="font-family:Arial">'+(coldFeeDisplay||'-')+'</td><td style="font-family:Arial">'+(firstItem.attestation||0)+'</td><td style="font-family:Arial">'+(firstItem.repack||0)+'</td><td style="font-family:Arial">'+(firstItem.waste||0)+'</td><td style="font-family:Arial">'+(firstItem.other||0)+'</td>' +      '<td><strong style="color:#0066cc">'+totalAmount.toFixed(2)+'</strong></td>' +      '<td><button type="button" class="abtn" onclick="openEditPurchase(\''+firstItem.id+'\')">✏️</button><button type="button" class="abtn x" onclick="delPurchaseGroup(\'' + cn + '\')">🗑</button></td></tr>';    
// 子行：每个品名    
items.forEach(function(r) {      var total = (r.demurrage||0)+(r.customs||0)+(r.coldFee||0)+(r.attestation||0)+(r.repack||0)+(r.waste||0)+(r.other||0);      html += '<tr class="purchase-sub-row ' + groupId + '" style="display:none;background:#fff">' +        '<td style="font-size:13px;color:#0066cc">' + (r.seq || '-') + '</td>' +        '<td style="padding-left:40px;color:#666;font-family:Arial;text-transform:capitalize">└ '+fmtTitleCase(r.product)+'</td>' +        '<td style="font-family:Arial;color:#666">'+fmtSupplierName(r.supplier)+'</td><td style="font-family:Arial;text-transform:capitalize">'+fmtTitleCase(r.product)+'</td><td>-</td><td>'+(r.qty||0)+'</td>' +        '<td>'+(r.demurrage||0)+'</td><td>'+(r.customs||0)+'</td><td>-</td>' +        '<td>'+(r.attestation||0)+'</td><td>'+(r.repack||0)+'</td><td>'+(r.waste||0)+'</td><td>'+(r.other||0)+'</td>' +        '<td><strong style="color:#0066cc">'+total.toFixed(2)+'</strong></td>' +        '<td><button type="button" class="abtn" onclick="openEditPurchase(\''+r.id+'\')">✏️</button><button type="button" class="abtn x" onclick="delPurchase(\''+r.id+'\')">🗑</button></td></tr>';    });  });  
// 显示供应商专属记录（在 warehouse1 采购列表中没有的）  
if (supplierOnlyRecs.length > 0) {    
// 按采购日期排序    
supplierOnlyRecs.sort(function(a, b) { return new Date(b.purchaseDate) - new Date(a.purchaseDate); });    supplierOnlyRecs.forEach(function(r) {      var status = r.status || 'draft';      var supplierLabel = '<span style="background:#fff3e0;color:#e65100;font-size:10px;padding:1px 4px;border-radius:2px;margin-left:4px">供应商</span>';      var statusBadge = status === 'submitted' ? '<span style="background:#fff8e1;color:#f57f17;font-size:10px;padding:1px 4px;border-radius:2px;margin-left:4px">已提交</span>' : '<span style="background:#e8f5e9;color:#2e7d32;font-size:10px;padding:1px 4px;border-radius:2px;margin-left:4px">已确认</span>';      var cnClickFn = "openSupplierCNDetail('" + r.id + "')";      var actionBtn = status === 'submitted' ? '<button type="button" class="abtn" style="background:#2e7d32;color:#fff" onclick="confirmSupplierRec(\'' + r.id + '\')">✅ 确认采用</button>' : '<button type="button" class="abtn" style="background:#0066cc;color:#fff" onclick="confirmSupplierRec(\'' + r.id + '\')">📥 采用</button>';      html += '<tr style="background:#fffbf5">' +        '<td style="font-size:13px;color:#ff9900">' + (r.seq || '-') + '</td>' +        '<td><a href="javascript:void(0)" onclick="' + cnClickFn + '" style="color:#ff9900;font-weight:bold;text-decoration:underline">' + (r.cn || '-') + '</a>' + supplierLabel + statusBadge + '</td>' +        '<td style="font-family:Arial;color:#666">' + fmtSupplierName(r.supplier) + '</td>' +        '<td style="font-family:Arial;text-transform:capitalize">' + fmtTitleCase(r.product) + '</td>' +        '<td>' + (r.purchaseDate ? fdt(r.purchaseDate+'T00:00:00') : '-') + '</td>' +        '<td style="font-family:Arial">' + (r.qty || 0) + '</td>' +        '<td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>' +        '<td style="color:#f57f17;font-weight:bold">' + (status === 'submitted' ? '待管理员确认' : '待采用') + '</td>' +        '<td>' + actionBtn + '</td>' +      '</tr>';    });  }  tb.innerHTML = html;}
// 按集装箱号查找供应商记录并弹出详情
function openSupplierCNDetailByCN(cn) {  var rec = supplierRecs.find(function(r) { return r.cn === cn; });  if (!rec) return;  openSupplierCNDetail(rec.id);}
// 按集装箱号编辑供应商记录
function editSupplierRecByCN(cn) {  var rec = supplierRecs.find(function(r) { return r.cn === cn; });  if (!rec) return;  editSupplierRec(rec.id);}
// 展开/折叠采购组
function togglePurchaseGroup(groupId, btn) { console.log('togglePurchaseGroup:', groupId);  var rows = document.querySelectorAll('.purchase-sub-row.' + groupId);  var isExpanded = btn.textContent === '-';  rows.forEach(function(row) {    row.style.display = isExpanded ? 'none' : '';  });  btn.textContent = isExpanded ? '+' : '-';}
// 删除整组采购记录
function delPurchaseGroup(cn) {  if (!confirm('确认删除集装箱 ' + cn + ' 的所有采购记录？')) return;  var toDelete = purchaseRecs.filter(function(r) { return r.cn === cn; });  toDelete.forEach(function(r) {    if (purchaseRef) purchaseRef.child(r.id).remove();  });}
// ============================================================
// SETTINGS - Supplier & Product Management
// ============================================================
var SETTINGS_KEY = 'csm_settings_v1';
var settData = { suppliers: [], products: [], shipCompanies: [] };
function loadSettings() {
  try {
    var stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      settData = JSON.parse(stored);
      if (!Array.isArray(settData.suppliers)) settData.suppliers = [];
      if (!Array.isArray(settData.products)) settData.products = [];
      if (!Array.isArray(settData.shipCompanies)) settData.shipCompanies = [];
    } else {
      settData = {
        suppliers: ['ABC Trading', 'XYZ Imports', 'Fresh Farm Co'],
        products: ['Carrots', 'Potatoes', 'Onions', 'Tomatoes'],
        shipCompanies: ['MAERSK', 'MSC', 'CMA CGM']
      };
      saveSettings();
    }
  } catch(e) {
    settData = { suppliers: [], products: [], shipCompanies: [] };
  }
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settData));
}
function openSettings() {
  loadSettings();
  renderSettList('supplier');
  renderSettList('product');
  renderSettList('shipcompany');
  loadRatesToSettings();
  loadUserList();
  gid('settingsModal').classList.add('sh');
}
function clSettings() {
  gid('settingsModal').classList.remove('sh');
}
// ============================================================
// FIREBASE USER MANAGEMENT
// ============================================================// 加载用户列表
function loadUserList() {
  var usersRef = firebase.database().ref('csm_users');
  usersRef.once('value').then(function(snap) {
    var users = [];
    snap.forEach(function(childSnap) {
      var user = childSnap.val();
      user.uid = childSnap.key;
      users.push(user);
    });
    renderUserList(users);
  });
}
// 渲染用户列表
function renderUserList(users) {
  var container = gid('user-list');
  if (!container) return;
  if (users.length === 0) {
    container.innerHTML = '<div style="color:#999;font-size:13px;text-align:center;padding:20px">暂无用户</div>';
    return;
  }
  var html = '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:#f5f5f5">';
  html += '<th style="padding:8px;text-align:left;border:1px solid #ddd">邮箱</th>';
  html += '<th style="padding:8px;text-align:center;border:1px solid #ddd">角色</th>';
  html += '<th style="padding:8px;text-align:left;border:1px solid #ddd">供应商名称</th>';
  html += '<th style="padding:8px;text-align:center;border:1px solid #ddd">操作</th>';
  html += '</tr>';
  users.forEach(function(user) {
    var isCurrentUser = user.uid === currentUser;
    var bgStyle = isCurrentUser ? 'background:#fff8e1' : '';
    html += '<tr style="' + bgStyle + '">';
    html += '<td style="padding:8px;border:1px solid #ddd">' + (user.email || 'N/A') + (isCurrentUser ? ' <span style="color:#00bfff;font-size:11px">(当前)</span>' : '') + '</td>';
    html += '<td style="padding:8px;text-align:center;border:1px solid #ddd">';
    html += '<select id="role-' + user.uid + '" onchange="toggleUserSupplierNameInput(\'' + user.uid + '\', this.value)" style="padding:4px;border:1px solid #ddd;border-radius:4px;font-size:12px">';
    html += '<option value="admin"' + (user.role === 'admin' ? ' selected' : '') + '>管理员</option>';
    html += '<option value="logistics"' + (user.role === 'logistics' ? ' selected' : '') + '>物流公司</option>';
    html += '<option value="supplier"' + (user.role === 'supplier' ? ' selected' : '') + '>供应商</option>';
    html += '</select>';
    html += '</td>';
    if (user.role === 'supplier') {
      html += '<td style="padding:8px;border:1px solid #ddd"><input id="supplier-name-' + user.uid + '" type="text" value="' + (user.supplierName || '') + '" placeholder="输入供应商名称" style="width:100%;padding:4px;border:1px solid #ddd;border-radius:4px;font-size:12px"></td>';
    } else {
      html += '<td style="padding:8px;border:1px solid #ddd"><input id="supplier-name-' + user.uid + '" type="text" value="' + (user.supplierName || '') + '" placeholder="输入供应商名称" style="display:none;width:100%;padding:4px;border:1px solid #ddd;border-radius:4px;font-size:12px"><span id="supplier-name-placeholder-' + user.uid + '" style="color:#999;font-size:12px">-</span></td>';
    }
    html += '<td style="padding:8px;text-align:center;border:1px solid #ddd;white-space:normal">';
    if (user.email) {
      html += '<button type="button" onclick="sendUserPasswordResetEmail(' + JSON.stringify(String(user.email).trim()) + ')" style="padding:4px 8px;background:#0066cc;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;margin:2px">重置邮件</button>';
    }
    if (!isCurrentUser) {
      html += '<button type="button" onclick="changeUserRole(\'' + user.uid + '\')" style="padding:4px 8px;background:#4CAF50;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;margin:2px">保存</button>';
      html += '<button type="button" onclick="deleteUser(\'' + user.uid + '\', \'' + String((user.email || '')).replace(/'/g, "\\'") + '\')" style="padding:4px 8px;background:#cc0000;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;margin:2px">删除</button>';
    } else {
      html += '<button type="button" onclick="changeUserRole(\'' + user.uid + '\')" style="padding:4px 8px;background:#4CAF50;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;margin:2px">保存</button>';
    }
    html += '</td>';
    html += '</tr>';
  });
  html += '</table>';
  container.innerHTML = html;
}
function toggleUserSupplierNameInput(uid, role) {
  var input = gid('supplier-name-' + uid);
  var placeholder = gid('supplier-name-placeholder-' + uid);
  if (input) input.style.display = role === 'supplier' ? 'block' : 'none';
  if (placeholder) placeholder.style.display = role === 'supplier' ? 'none' : 'inline';
}
// 修改用户角色（设置面板内嵌列表）
function changeUserRole(uid) {
  var roleEl = gid('role-' + uid);
  var supplierNameEl = gid('supplier-name-' + uid);
  var newRole = roleEl ? roleEl.value : 'logistics';
  var newSn = supplierNameEl ? String(supplierNameEl.value || '').trim() : '';
  firebase.database().ref('csm_users/' + uid).once('value').then(function(snap) {
    var prev = snap.val() || {};
    var oldSn = String(prev.supplierName || '').trim();
    var updates = { role: newRole };
    if (newRole === 'supplier') {
      updates.supplierName = newSn;
    } else {
      updates.supplierName = '';
    }
    return firebase.database().ref('csm_users/' + uid).update(updates).then(function() {
      if (newRole === 'supplier' && oldSn && newSn && oldSn !== newSn) {
        return propagateSupplierDisplayName(oldSn, newSn, uid);
      }
    });
  }).then(function() {
    toast('✅ 用户角色已更新', 'ok');
    loadUserList();
  }).catch(function(error) {
    console.error('Error updating role:', error);
    toast('❌ 更新失败', 'err');
  });
}
// 删除用户
function deleteUser(uid, email) {
  if (!confirm('确认删除用户 ' + (email || uid) + '？\n\n注意：此操作不会删除 Firebase Authentication 账号，只会移除用户角色信息。')) {
    return;
  }
  firebase.database().ref('csm_users/' + uid).remove()
    .then(function() {
      toast('✅ 用户已删除', 'ok');
      loadUserList();
    })
    .catch(function(error) {
      console.error('Error deleting user:', error);
      toast('❌ 删除失败', 'err');
    });
}
// 创建新用户（仅管理员可用；使用独立 Firebase App 创建，避免管理员会话被切换成新用户）
function createUser() {
  if (!isAdmin) {
    toast('需要管理员权限', 'err');
    return;
  }
  var email = (gid('new-user-email').value || '').trim();
  var password = (gid('new-user-password').value || '').trim();
  var password2 = (gid('new-user-password2') ? gid('new-user-password2').value : '').trim();
  var role = gid('new-user-role').value || 'logistics';
  var supplierName = (gid('new-user-supplier-name') || {value:''}).value.trim();
  var errorEl = gid('create-user-error');
  if (errorEl) errorEl.style.display = 'none';
  if (!email) {
    if (errorEl) {
      errorEl.textContent = '请输入邮箱';
      errorEl.style.display = 'block';
    }
    return;
  }
  if (!password || password.length < 6) {
    if (errorEl) {
      errorEl.textContent = '密码至少6位';
      errorEl.style.display = 'block';
    }
    return;
  }
  if (password !== password2) {
    if (errorEl) {
      errorEl.textContent = '两次输入的密码不一致';
      errorEl.style.display = 'block';
    }
    return;
  }
  if (role === 'supplier' && !supplierName) {
    if (errorEl) {
      errorEl.textContent = '供应商名称不能为空';
      errorEl.style.display = 'block';
    }
    return;
  }
  var sec = getSecondaryAuthForUserCreation();
  if (!sec) {
    if (errorEl) {
      errorEl.textContent = '无法初始化创建账号通道，请刷新页面重试';
      errorEl.style.display = 'block';
    }
    toast('创建通道不可用', 'err');
    return;
  }
  var roleLabel = role === 'admin' ? '管理员' : (role === 'logistics' ? '物流公司' : '供应商');
  sec.createUserWithEmailAndPassword(email, password)
    .then(function(userCredential) {
      var uid = userCredential.user.uid;
      sec.signOut().catch(function() {});
      var userData = {
        email: email,
        role: role,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };
      if (role === 'supplier') {
        userData.supplierName = supplierName;
      }
      firebase.database().ref('csm_users/' + uid).set(userData).then(function() {
        toast('✅ 用户创建成功: ' + email + ' (' + roleLabel + ')', 'ok');
        gid('new-user-email').value = '';
        gid('new-user-password').value = '';
        if (gid('new-user-password2')) gid('new-user-password2').value = '';
        loadUserList();
      }).catch(function(error) {
        console.error('Error saving user role:', error);
        toast('❌ Auth 账号已创建但角色写入失败，请在 Firebase 控制台检查 csm_users/' + uid, 'err');
        loadUserList();
      });
    })
    .catch(function(error) {
      console.error('Firebase Auth: Create user failed', error);
      var errorMsg = '创建失败';
      if (error.code === 'auth/email-already-in-use') {
        errorMsg = '该邮箱已被注册';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = '邮箱格式错误';
      } else if (error.code === 'auth/weak-password') {
        errorMsg = '密码强度不足（至少6位）';
      }
      if (errorEl) {
        errorEl.textContent = errorMsg;
        errorEl.style.display = 'block';
      }
    });
}
function migrateSupplierRecordOwners() {
  if (!isAdmin) {
    toast('需要管理员权限', 'err');
    return;
  }
  if (!confirm('确认批量补齐旧供应商记录的 ownerUid 吗？该操作会按“供应商名称 -> 用户账号”自动匹配。')) {
    return;
  }
  var statusEl = gid('supplier-owner-migration-status');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.style.color = '#0066cc';
    statusEl.textContent = '正在扫描并补齐旧记录...';
  }
  Promise.all([
    firebase.database().ref('csm_users').once('value'),
    firebase.database().ref('csm_supplier_recs').once('value')
  ]).then(function(snaps) {
    var users = snaps[0].val() || {};
    var recsData = snaps[1].val() || {};
    var supplierMap = {};
    Object.keys(users).forEach(function(uid) {
      var user = users[uid] || {};
      if (String(user.role || '').toLowerCase() !== 'supplier') return;
      var name = String(user.supplierName || '').trim().toLowerCase();
      if (!name) return;
      if (!supplierMap[name]) supplierMap[name] = [];
      supplierMap[name].push(uid);
    });
    var updates = {};
    var migrated = 0;
    var alreadyOk = 0;
    var skippedNoName = 0;
    var skippedNoMatch = 0;
    var skippedAmbiguous = 0;
    Object.keys(recsData).forEach(function(id) {
      var rec = recsData[id] || {};
      if (rec.ownerUid) {
        alreadyOk++;
        return;
      }
      var supplierName = String(rec.supplier || '').trim().toLowerCase();
      if (!supplierName) {
        skippedNoName++;
        return;
      }
      var matched = supplierMap[supplierName] || [];
      if (matched.length === 1) {
        updates['csm_supplier_recs/' + id + '/ownerUid'] = matched[0];
        migrated++;
      } else if (matched.length === 0) {
        skippedNoMatch++;
      } else {
        skippedAmbiguous++;
      }
    });
    if (migrated === 0) {
      var msg0 = '未发现可补齐记录。已就绪: ' + alreadyOk + '，无匹配: ' + skippedNoMatch + '，无供应商名: ' + skippedNoName + '，重名冲突: ' + skippedAmbiguous;
      if (statusEl) {
        statusEl.style.color = '#666';
        statusEl.textContent = msg0;
      }
      toast('没有需要补齐的记录', 'ok');
      return;
    }
    firebase.database().ref().update(updates).then(function() {
      var msg = '补齐完成：成功 ' + migrated + ' 条，已就绪 ' + alreadyOk + ' 条，无匹配 ' + skippedNoMatch + ' 条，无供应商名 ' + skippedNoName + ' 条，重名冲突 ' + skippedAmbiguous + ' 条。';
      if (statusEl) {
        statusEl.style.color = '#2e7d32';
        statusEl.textContent = msg;
      }
      toast('✅ ownerUid 补齐完成', 'ok');
      attachDataListenersForRole();
    }).catch(function(err) {
      console.error('Supplier owner migration update failed', err);
      if (statusEl) {
        statusEl.style.color = '#cc0000';
        statusEl.textContent = '补齐失败：' + (err.message || err);
      }
      toast('❌ 补齐失败', 'err');
    });
  }).catch(function(err) {
    console.error('Supplier owner migration scan failed', err);
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.color = '#cc0000';
      statusEl.textContent = '扫描失败：' + (err.message || err);
    }
    toast('❌ 无法读取迁移数据', 'err');
  });
}
function addSettItem(type) {
  var inputId = 'sett-' + type + '-input';
  var val = (gid(inputId).value || '').trim();
  if (!val) return;
  val = val.toLowerCase().replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  var list = type === 'supplier' ? settData.suppliers : (type === 'product' ? settData.products : settData.shipCompanies);
  if (list.indexOf(val) !== -1) {
    toast('已存在: ' + val, 'err');
    return;
  }
  var typeLabel = type === 'supplier' ? '供应商' : (type === 'product' ? '品名' : '船公司');
  if (!confirm('确认添加 ' + typeLabel + ': ' + val + ' ？')) return;
  list.push(val);
  saveSettings();
  gid(inputId).value = '';
  renderSettList(type);
  toast('✅ 已添加: ' + val, 'ok');
}
function delSettItem(type, val) {
  var typeLabel = type === 'supplier' ? '供应商' : (type === 'product' ? '品名' : '船公司');
  if (!confirm('确认删除 ' + typeLabel + ': ' + val + ' ？')) return;
  if (type === 'supplier') {
    settData.suppliers = settData.suppliers.filter(function(s) { return s !== val; });
  } else if (type === 'product') {
    settData.products = settData.products.filter(function(s) { return s !== val; });
  } else {
    settData.shipCompanies = settData.shipCompanies.filter(function(s) { return s !== val; });
  }
  saveSettings();
  renderSettList(type);
  toast('✅ 已删除: ' + val, 'ok');
}
function renderSettList(type) {
  var listId = 'sett-' + type + '-list';
  var el = gid(listId);
  if (!el) return;
  var items = type === 'supplier' ? settData.suppliers : (type === 'product' ? settData.products : settData.shipCompanies);
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
function openEditPurchase(id) {  var r = purchaseRecs.find(function(x) { return x.id === id; });  if (!r) return;  gid('fe-id').value = r.id;  gid('fe-cn').value = r.cn || '';  gid('fe-supplier').value = r.supplier || '';  gid('fe-product').value = r.product || '';  gid('fe-qty').value = r.qty || 0;  gid('fe-demurrage').value = r.demurrage || 0;  gid('fe-customs').value = r.customs || 0;  gid('fe-coldfee').value = r.coldFee || 0;  gid('fe-attestation').value = r.attestation || 0;  gid('fe-repack').value = r.repack || 0;  gid('fe-waste').value = r.waste || 0;  gid('fe-other').value = r.other || 0;  gid('editPurchaseModal').classList.add('sh');}function clEditPurchaseModal() {  gid('editPurchaseModal').classList.remove('sh');}function saveEditPurchase() {  var id = gid('fe-id').value;  var r = purchaseRecs.find(function(x) { return x.id === id; });  if (!r) return;  r.cn = (gid('fe-cn').value || '').trim().toUpperCase();  r.supplier = (gid('fe-supplier').value || '').trim();  r.product = (gid('fe-product').value || '').trim();  r.qty = parseFloat(gid('fe-qty').value) || 0;  r.demurrage = parseFloat(gid('fe-demurrage').value) || 0;  r.customs = parseFloat(gid('fe-customs').value) || 0;  r.coldFee = parseFloat(gid('fe-coldfee').value) || 0;  r.attestation = parseFloat(gid('fe-attestation').value) || 0;  r.repack = parseFloat(gid('fe-repack').value) || 0;  r.waste = parseFloat(gid('fe-waste').value) || 0;  r.other = parseFloat(gid('fe-other').value) || 0;  
// 保存到 Firebase  
if (purchaseRef) {    purchaseRef.child(id).set(r);  }  clEditPurchaseModal();  toast('✅ 采购记录已修改', 'ok');}
// ============================================================
// QUICK CHECK IN FROM PURCHASE
// ============================================================
var quickInData = null;function quickCheckIn(purchaseId) { console.log('quickCheckIn called:', purchaseId);  if (!purchaseRecs || purchaseRecs.length === 0) {    toast('采购数据未加载，请刷新页面重试', 'err');    return;  }  var r = purchaseRecs.find(function(x) { return x.id === purchaseId; });  if (!r) {    toast('未找到采购记录', 'err');    return;  }  
// 查找同一集装箱号的所有品名  
var sameCnItems = purchaseRecs.filter(function(x) { return x.cn === r.cn; });  var productSelect = gid('quickInProductSelect');  var productDropdown = gid('quickInProductDropdown');  var quickInInfo = gid('quickInInfo');  if (sameCnItems.length > 1) {    
// 多个品名，显示下拉选择（不显示数量）    
productSelect.style.display = 'block';    quickInInfo.innerHTML = '📦 <strong>' + r.cn + '</strong> | ' + r.supplier + '<br><span style="font-size:11px;color:#999">选择入库品名</span>';    
// 填充下拉选项（只显示品名）    
productDropdown.innerHTML = sameCnItems.map(function(item, idx) {      return '<option value="' + item.id + '">' + (item.product || '品名' + (idx+1)) + '</option>';    }).join('');    
// 保存所有品名数据    
window.quickInMultiData = sameCnItems;  } else {    
// 单个品名    
productSelect.style.display = 'none';    quickInInfo.innerHTML = '📦 <strong>' + r.cn + '</strong> | ' + r.supplier + ' | ' + r.product;    
// 保存采购记录数据
quickInData = r;    
window.quickInMultiData = null;  }  gid('quickInModal').classList.add('sh');}function clQuickInModal() {  gid('quickInModal').classList.remove('sh');  quickInData = null;  window.quickInMultiData = null;}var isCheckingIn = false;function doQuickIn(storeNum) { console.log('doQuickIn called, storeNum:', storeNum, 'quickInData:', quickInData);  if (isCheckingIn) { console.log('Already checking in, ignoring'); return; }  isCheckingIn = true;  
// 获取选中的品名  
var selectedData = null;  if (window.quickInMultiData) {    
// 多个品名的情况    
var dropdown = gid('quickInProductDropdown');    var selectedId = dropdown.value;    selectedData = window.quickInMultiData.find(function(x) { return x.id === selectedId; });    if (!selectedData) {      toast('请选择入库品名', 'err');      isCheckingIn = false;      return;    }  } else if (quickInData) {    
// 单个品名
selectedData = quickInData;  }  
if (!selectedData) {    toast('未选择入库信息', 'err');    isCheckingIn = false;    return;  }  console.log('selectedData:', selectedData);  console.log('selectedData.cn:', selectedData.cn);  
// 切换冷库  
selectColdStore(storeNum);  
// 自动填入入库表单  
gid('f-cn').value = selectedData.cn || '';  console.log('f-cn value after set:', gid('f-cn').value);  gid('f-supplier').value = selectedData.supplier || '';  gid('f-product').value = selectedData.product || '';  gid('f-items').value = selectedData.qty || '1';  gid('f-pallets').value = '1';  
// 设置入库日期为今天  
gid('f-at').value = nowFmt();  clQuickInModal();  
// 重置入库按钮状态（确保是黄色，等待用户手动确认）
isCheckingIn = false;  
var checkInBtn = gid('checkInBtn');  if (checkInBtn) {    checkInBtn.classList.remove('btn-g');    checkInBtn.classList.add('btn-s');    checkInBtn.innerHTML = '✓ 入库 Check In';    checkInBtn.disabled = false;  }  
// 切换到库存记录 tab，让用户手动点击入库按钮确认  
swTab('records');  
// 滚动到入库表单  
document.querySelector('.left').scrollTop = 0;}
// ============================================================
// AUTOCOMPLETE SUGGEST
// ============================================================
function showSuggest(inputEl, type) {  var val = (inputEl.value || '').trim().toLowerCase();  var list = type === 'supplier' ? settData.suppliers : (type === 'product' ? settData.products : settData.shipCompanies);  var suggestEl = gid('suggest-' + type);  console.log('showSuggest:', type, 'val:', val, 'list:', list, 'suggestEl:', !!suggestEl);  if (!suggestEl || list.length === 0) { return; }  var filtered = val ? list.filter(function(item) {    return item.toLowerCase().indexOf(val) !== -1;  }) : list;  if (filtered.length === 0) {    suggestEl.classList.remove('show');    suggestEl.innerHTML = '';    return;  }  suggestEl.innerHTML = filtered.map(function(item) {    return '<div class="suggest-item" onmousedown="pickSuggest(this,\'' + type + '\')">' + item + '</div>';  }).join('');  suggestEl.classList.add('show');}
// 品名表格行的模糊搜索
function showSuggestSupplierItem(inputEl) {
  var val = (inputEl.value || '').trim().toLowerCase();
  var rowId = inputEl.getAttribute('data-rowid');
  var suggestEl = gid('suggest-supplier-item-' + rowId);
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
    return '<div class="suggest-item" onmousedown="pickSuggestSupplierItem(this,\'' + rowId + '\')">' + item + '</div>';
  }).join('');
  suggestEl.classList.add('show');
}
function pickSuggestSupplierItem(el, rowId) {
  var val = el.textContent;
  var inputEl = document.querySelector('.supplier-item-product[data-rowid="' + rowId + '"]');
  if (inputEl) inputEl.value = val;
  hideSuggest('supplier-item-' + rowId);
}
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
  } else if (type === 'product' && gid('fp-product')) {
    gid('fp-product').value = val;
  } else if (type === 'shipcompany' && gid('supplier-shipcompany')) {
    gid('supplier-shipcompany').value = val;
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
function showSuggestCn(inputEl) {  var val = (inputEl.value || '').trim().toUpperCase();  var suggestEl = gid('suggest-checkout-cn');  if (!suggestEl) return;  
// 只显示当前冷库在库的集装箱  
var inRecs = recs.filter(function(r) {    return r.store === currentColdStore && !r.dep;  });  var filtered = val ? inRecs.filter(function(r) {    return r.cn.toUpperCase().indexOf(val) !== -1;  }) : inRecs;  if (filtered.length === 0) {    suggestEl.classList.remove('show');    suggestEl.innerHTML = '';    return;  }  suggestEl.innerHTML = filtered.map(function(r) {    return '<div class="suggest-item" onmousedown="pickCnSuggest(this)" style="font-size:12px">' +      '<strong>' + r.cn + '</strong> <span style="color:#999">| ' + r.product + ' | 剩余托盘: ' + (r.pallets - (r.pallets_out||0)) + '</span></div>';  }).join('');  suggestEl.classList.add('show');}function pickCnSuggest(el) {  var text = el.textContent;  var cn = text.split('|')[0].trim();  gid('f-cno').value = cn;  hideSuggest('checkout-cn');}
// ============================================================
// CUSTOMS COMPANY FUNCTIONS
// ============================================================
var LOGISTICS_KEY = 'csm_customs_fees';function getLogisticsFees() {  try {    var stored = localStorage.getItem(LOGISTICS_KEY);    return stored ? JSON.parse(stored) : [];  } catch(e) { return []; }}function saveLogisticsFees(fees) {  localStorage.setItem(LOGISTICS_KEY, JSON.stringify(fees));}function openLogisticsAddForm(id) {  var now = new Date();  var yyyy = now.getFullYear();  var mm = String(now.getMonth() + 1).padStart(2, '0');  var dd = String(now.getDate()).padStart(2, '0');  var hh = String(now.getHours()).padStart(2, '0');  var mi = String(now.getMinutes()).padStart(2, '0');  gid('logisticsModalTitle').textContent = id ? '编辑物流费用' : '添加物流费用';  gid('logistics-cn').value = '';  gid('logistics-date').value = yyyy + '-' + mm + '-' + dd;  gid('logistics-time').value = hh + ':' + mi;  gid('logistics-fee').value = '0';  gid('logistics-discount').value = '0';  gid('logistics-remark').value = '';  gid('logistics-payment-status').value = 'unpaid';  gid('logistics-id').value = id || '';  if (id) {    var fees = getLogisticsFees();    var fee = fees.find(function(f) { return f.id === id; });    if (fee) {      gid('logistics-cn').value = fee.cn || '';      gid('logistics-date').value = fee.product || '';      gid('logistics-time').value = fee.addTime || '';      gid('logistics-fee').value = fee.fee || 0;      gid('logistics-discount').value = fee.discount || 0;      gid('logistics-remark').value = fee.remark || '';      gid('logistics-payment-status').value = fee.paymentStatus || 'unpaid';    }  }  gid('logisticsModal').classList.add('sh');}function clLogisticsModal() {  gid('logisticsModal').classList.remove('sh');}function saveLogisticsFee() {  var cn = (gid('logistics-cn').value || '').trim().toUpperCase();  var addDate = (gid('logistics-date').value || '').trim();  var addTime = (gid('logistics-time').value || '').trim();  var fee = parseFloat(gid('logistics-fee').value) || 0;  var discount = parseFloat(gid('logistics-discount').value) || 0;  var remark = (gid('logistics-remark').value || '').trim();  var paymentStatus = gid('logistics-payment-status').value || 'unpaid';  var id = gid('logistics-id').value;  if (!cn) { toast('请输入集装箱号 / Enter container no.', 'err'); return; }  if (!addDate) { toast('请选择日期 / Select date', 'err'); return; }  var fees = getLogisticsFees();  if (id) {    var idx = fees.findIndex(function(f) { return f.id === id; });    if (idx !== -1) {      fees[idx].cn = cn;      fees[idx].addDate = addDate;      fees[idx].addTime = addTime || fees[idx].addTime || '';      fees[idx].fee = fee;      fees[idx].discount = discount;      fees[idx].remark = remark;      fees[idx].updatedBy = currentUser;      fees[idx].updateTime = new Date().toISOString();      fees[idx].confirmed = false;      fees[idx].paymentStatus = paymentStatus;    }    toast('✅ 物流费用已更新 / Updated', 'ok');  } else {    fees.push({      id: Date.now().toString(),      cn: cn,      addDate: addDate,      addTime: addTime,      fee: fee,      discount: discount,      remark: remark,      addedBy: currentUser,      addTimeISO: new Date().toISOString(),      confirmed: false,      confirmedBy: null,      confirmTime: null,      paymentStatus: paymentStatus    });    toast('✅ 物流费用已添加 / Added', 'ok');  }  saveLogisticsFees(fees);  clLogisticsModal();  renderLogisticsTable();}function delLogisticsFee(id) {  if (!confirm('确认删除这条物流记录？')) return;  var fees = getLogisticsFees();  fees = fees.filter(function(f) { return f.id !== id; });  saveLogisticsFees(fees);  renderLogisticsTable();}function confirmLogisticsFee(id) {  var fees = getLogisticsFees();  var idx = fees.findIndex(function(f) { return f.id === id; });  if (idx !== -1) {    fees[idx].confirmed = true;    fees[idx].confirmedBy = currentUser;    fees[idx].confirmTime = new Date().toISOString();    saveLogisticsFees(fees);    renderLogisticsTable();    toast('✅ 已确认物流费用 / Confirmed', 'ok');  }}function unconfirmLogisticsFee(id) {  var fees = getLogisticsFees();  var idx = fees.findIndex(function(f) { return f.id === id; });  if (idx !== -1) {    fees[idx].confirmed = false;    fees[idx].confirmedBy = null;    fees[idx].confirmTime = null;    saveLogisticsFees(fees);    renderLogisticsTable();    toast('✅ 已取消确认 / Unconfirmed', 'ok');  }}function filterLogisticsTable() {  renderLogisticsTable();}function clearLogisticsSearch() {  gid('logistics-search-date-start').value = '';  gid('logistics-search-date-end').value = '';  gid('logistics-search-cn').value = '';  renderLogisticsTable();}function renderLogisticsTable() {  var tb = gid('tb-logistics');  var es = gid('es-logistics');  if (!tb || !es) return;  var fees = getLogisticsFees();  console.log('[Logistics] fees count:', fees.length, 'fees:', fees);  var searchCN = (gid('logistics-search-cn').value || '').trim().toUpperCase();  var searchDateStart = (gid('logistics-search-date-start').value || '').trim();  var searchDateEnd = (gid('logistics-search-date-end').value || '').trim();  var fees = getLogisticsFees();  if (searchCN || searchDateStart || searchDateEnd) {    fees = fees.filter(function(f) {      var matchCN = !searchCN || (f.cn || '').toUpperCase().indexOf(searchCN) !== -1;      var fDate = f.addDate || '';      var matchDate = true;      if (searchDateStart && fDate < searchDateStart) matchDate = false;      if (searchDateEnd && fDate > searchDateEnd) matchDate = false;      return matchCN && matchDate;    });  }  if (fees.length === 0) {    tb.innerHTML = '';    es.style.display = 'block';    return;  }  es.style.display = 'none';  var html = fees.map(function(f) {    var statusText = f.confirmed ? '<span style="color:#00aa00;font-weight:bold;background:#e8f5e9;padding:2px 8px;border-radius:4px">APPROVED</span>' : '<span style="color:#ff9900;background:#fff8e1;padding:2px 8px;border-radius:4px">PENDING</span>';    var statusClass = f.confirmed ? 'background:#e8f5e9' : 'background:#fff8e1';    var actionBtns = '';    if (isAdmin) {      if (f.confirmed) {        actionBtns = '<button class="abtn" onclick="unconfirmLogisticsFee(\'' + f.id + '\')" style="color:#ff9900">取消确认</button> ';      } else {        actionBtns = '<button class="abtn" onclick="confirmLogisticsFee(\'' + f.id + '\')" style="background:#4CAF50;color:#fff;border:none;padding:2px 8px;border-radius:3px">确认</button> ';      }    }    actionBtns += '<button class="abtn" onclick="openLogisticsAddForm(\'' + f.id + '\')">✏️</button> <button class="abtn x" onclick="delLogisticsFee(\'' + f.id + '\')">🗑</button>';    var purchaseMatch = '';    if (typeof purchaseRecs !== 'undefined' && purchaseRecs && purchaseRecs.length) {      var matchedPurchase = purchaseRecs.find(function(p) { return p.cn === f.cn; });      if (matchedPurchase) {        purchaseMatch = '<span style="background:#e8f5e9;color:#00aa00;font-size:10px;padding:1px 4px;border-radius:2px;margin-left:4px">采购</span>';      }    }    var paymentHTML = '';    var ps = f.paymentStatus || 'unpaid';    if (ps === 'paid') {      paymentHTML = '<span style="color:#00aa00;font-weight:bold;background:#e8f5e9;padding:2px 8px;border-radius:4px">✅ PAID</span>';    } else if (ps === 'partial') {      paymentHTML = '<span style="color:#ff9900;background:#fff8e1;padding:2px 8px;border-radius:4px">⏳ PARTIAL</span>';    } else {      paymentHTML = '<span style="color:#cc0000;background:#fce4ec;padding:2px 8px;border-radius:4px">❌ UNPAID</span>';    }    return '<tr style="' + statusClass + '">' +      '<td><strong>' + (f.cn || '-') + '</strong>' + purchaseMatch + '</td>' +      '<td style="white-space:nowrap">' + (f.addDate || '-') + (f.addTime ? '<br><span style="font-size:11px;color:#888">' + f.addTime + '</span>' : '') + '</td>' +      '<td>' + f.fee.toFixed(2) + ' AED</td>' +      '<td style="color:#ff4444">-' + f.discount.toFixed(2) + ' AED</td>' +      '<td>' + paymentHTML + '</td>' +      '<td>' + statusText + '</td>' +      '<td>' + actionBtns + '</td></tr>';  }).join('');  var totalFee = fees.reduce(function(s, f) { return s + (f.fee || 0); }, 0);  var totalDiscount = fees.reduce(function(s, f) { return s + (f.discount || 0); }, 0);  tb.innerHTML = html + '<tr style="background:#e8f5e9;font-weight:bold"><td colspan="2">📊 Total</td><td>' + totalFee.toFixed(2) + ' AED</td><td style="color:#ff4444">-' + totalDiscount.toFixed(2) + ' AED</td><td></td><td></td><td></td></tr>';}function getPurchaseContainers() {  var containers = [];  var seen = {};  purchaseRecs.forEach(function(p) {    if (p.cn && !seen[p.cn]) {      seen[p.cn] = true;      containers.push({        cn: p.cn,        product: p.product,        supplier: p.supplier,        qty: p.qty      });    }  });  return containers.sort(function(a, b) { return a.cn.localeCompare(b.cn); });}function openLogisticsFromPurchase() {  var containers = getPurchaseContainers();  var modal = gid('logisticsFromPurchaseModal');  var list = gid('logistics-purchase-list');  if (containers.length === 0) {    toast('暂无采购记录 / No purchase records', 'err');    return;  }  list.innerHTML = containers.map(function(c) {    var existingFee = getLogisticsFees().find(function(f) { return f.cn === c.cn; });    var badge = existingFee ? '<span style="background:#4CAF50;color:#fff;font-size:10px;padding:1px 4px;border-radius:2px">已添加</span>' : '';    return '<div style="padding:8px 12px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center">' +      '<div><strong>' + c.cn + '</strong><br><span style="font-size:12px;color:#666">' + (c.product || '-') + '</span></div>' +      '<div>' + badge + ' <button class="abtn" style="background:#4CAF50;color:#fff;border:none;padding:4px 8px;border-radius:3px" onclick="selectLogisticsCn(\'' + c.cn + '\')">+ 添加</button></div>' +      '</div>';  }).join('');  modal.classList.add('sh');}function clLogisticsFromPurchaseModal() {  gid('logisticsFromPurchaseModal').classList.remove('sh');}function selectLogisticsCn(cn) {  clLogisticsFromPurchaseModal();  openLogisticsAddForm('');  gid('logistics-cn').value = cn;}
(function csmWireLogin() {
  var b = document.getElementById('btn-login-submit');
  if (!b || b.dataset.csmWired) return;
  b.dataset.csmWired = '1';
  function tryLogin() {
    var real = window.__csmRealDoLogin;
    if (typeof real === 'function') {
      real();
      return;
    }
    if (typeof window.doLogin === 'function') window.doLogin();
  }
  b.addEventListener('click', function (e) {
    e.preventDefault();
    tryLogin();
  });
  var pw = document.getElementById('login-password');
  if (pw) {
    pw.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        tryLogin();
      }
    });
  }
})();
// ============================================================
// W1 SALES & FINANCE (Firebase: csm_sales_w1/customers | orders)
// ============================================================
function csmSalesObjToArr(val, isOrders) {
  var out = [];
  Object.keys(val || {}).forEach(function(k) {
    var o = Object.assign({}, val[k] || {});
    o.id = k;
    out.push(o);
  });
  if (isOrders) {
    out.sort(function(a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  } else {
    out.sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
  }
  return out;
}
function csmSalesRound2(x) { return Math.round(x * 100) / 100; }
function csmSalesComputeTotals(unitPrice, qty, vatMode) {
  var u = parseFloat(unitPrice) || 0;
  var q = parseFloat(qty) || 0;
  if (vatMode === 'included') {
    var totalI = csmSalesRound2(u * q);
    var netI = csmSalesRound2((u / 1.05) * q);
    var vatI = csmSalesRound2(totalI - netI);
    return { total: totalI, net: netI, vat: vatI };
  }
  var netE = csmSalesRound2(u * q);
  var totalE = csmSalesRound2(u * q * 1.05);
  var vatE = csmSalesRound2(totalE - netE);
  return { total: totalE, net: netE, vat: vatE };
}
function csmSalesLocalYmd(d) {
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var da = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + da;
}
function csmSalesPayLabel(code, forFinance) {
  var c = String(code || '');
  if (forFinance) {
    if (c === 'cash') return '\u5df2\u4ed8\u6b3e';
    if (c === 'cash_pending') return 'cash pending';
    if (c === 'credit') return '\u672a\u4ed8\u6b3e';
    return c || '-';
  }
  if (c === 'cash') return 'Cash \u5df2\u4ed8\u6b3e';
  if (c === 'cash_pending') return 'Cash pending \u5f85\u73b0\u91d1';
  if (c === 'credit') return 'Credit \u8d4a\u8d26';
  return c || '-';
}
function csmEscapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function refreshSalesUi() {
  if (!isAdmin) return;
  renderSalesDashCards();
  renderSalesCustomersTable();
  renderSalesOrdersTable();
  renderSalesFinanceTable();
}
function swSalesSub(view) {
  salesSubView = view || 'dash';
  var dash = gid('sales-panel-dash');
  var cust = gid('sales-panel-customers');
  var ord = gid('sales-panel-orders');
  if (dash) dash.style.display = salesSubView === 'dash' ? 'block' : 'none';
  if (cust) cust.style.display = salesSubView === 'customers' ? 'block' : 'none';
  if (ord) ord.style.display = salesSubView === 'orders' ? 'block' : 'none';
  var b1 = gid('sales-sub-btn-dash');
  var b2 = gid('sales-sub-btn-cust');
  var b3 = gid('sales-sub-btn-orders');
  if (b1) { b1.classList.toggle('btn-s', salesSubView === 'dash'); b1.classList.toggle('btn-g', salesSubView !== 'dash'); }
  if (b2) { b2.classList.toggle('btn-s', salesSubView === 'customers'); b2.classList.toggle('btn-g', salesSubView !== 'customers'); }
  if (b3) { b3.classList.toggle('btn-s', salesSubView === 'orders'); b3.classList.toggle('btn-g', salesSubView !== 'orders'); }
}
function renderSalesDashCards() {
  var el1 = gid('sales-dash-today');
  var el2 = gid('sales-dash-confirmed');
  var el3 = gid('sales-dash-unpaid');
  if (!el1) return;
  var today = csmSalesLocalYmd(new Date());
  var nToday = salesOrders.filter(function(o) { return (o.createdAt || '').slice(0, 10) === today; }).length;
  el1.textContent = String(nToday);
  var conf = salesOrders.filter(function(o) { return o.orderStatus === 'confirmed'; });
  var sumConf = conf.reduce(function(s, o) { return s + (parseFloat(o.totalAmount) || 0); }, 0);
  if (el2) el2.textContent = sumConf.toFixed(2);
  var unpaid = conf.filter(function(o) { return o.paymentStatus === 'credit' || o.paymentStatus === 'cash_pending'; });
  var sumUnpaid = unpaid.reduce(function(s, o) { return s + (parseFloat(o.totalAmount) || 0); }, 0);
  if (el3) el3.textContent = sumUnpaid.toFixed(2);
}
function renderSalesCustomersTable() {
  var tb = gid('tb-sales-customers');
  if (!tb) return;
  if (!salesCustomers.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888">No customers yet</td></tr>';
    return;
  }
  tb.innerHTML = salesCustomers.map(function(c) {
    return '<tr><td>' + csmEscapeHtml(c.name) + '</td><td>' + csmEscapeHtml(c.address) + '</td><td>' + csmEscapeHtml(c.vatNumber) + '</td><td>' + csmEscapeHtml(c.phone) + '</td><td>' + csmEscapeHtml(c.email) + '</td><td>' +
      '<button class="abtn" onclick="openSalesCustomerModal(\'' + c.id + '\')">Edit</button> ' +
      '<button class="abtn x" onclick="deleteSalesCustomer(\'' + c.id + '\')">Del</button></td></tr>';
  }).join('');
}
function renderSalesOrdersTable() {
  var tb = gid('tb-sales-orders');
  if (!tb) return;
  var f = gid('sales-order-filter');
  var st = f ? f.value : '';
  var rows = salesOrders.filter(function(o) { return !st || o.orderStatus === st; });
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#888">No orders</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(function(o) {
    var vm = o.vatMode === 'included' ? 'Inc.VAT' : 'Ex+5%';
    var actions = '';
    if (o.orderStatus === 'draft') {
      actions = '<button class="abtn" onclick="openSalesOrderModal(\'' + o.id + '\')">Edit</button> ' +
        '<button class="abtn" onclick="salesSubmitOrder(\'' + o.id + '\')">Submit</button> ' +
        '<button class="abtn x" onclick="salesDeleteOrder(\'' + o.id + '\')">Del</button>';
    } else if (o.orderStatus === 'submitted') {
      actions = '<button class="abtn" onclick="salesUndoSubmit(\'' + o.id + '\')">Withdraw</button> ' +
        '<button class="abtn" style="background:#2e7d32;color:#fff;border:none" onclick="salesConfirmOrder(\'' + o.id + '\')">Confirm</button>';
    } else {
      actions = '<span style="color:#888">Locked</span>';
    }
    return '<tr><td>' + csmEscapeHtml(o.customerName || '') + '</td><td>' + csmEscapeHtml(o.containerNo || '') + '</td><td>' + csmEscapeHtml(o.productName || '') + '</td><td>' + csmEscapeHtml(String(o.quantity)) + '</td><td>' +
      csmEscapeHtml(String(o.unitPrice)) + '</td><td>' + vm + '</td><td>' + (parseFloat(o.totalAmount) || 0).toFixed(2) + '</td><td>' + csmSalesPayLabel(o.paymentStatus, false) + '</td><td>' + csmEscapeHtml(o.orderStatus || '') + '</td><td>' + actions + '</td></tr>';
  }).join('');
}
function renderSalesFinanceTable() {
  var tb = gid('tb-sales-finance');
  var elLines = gid('sales-fin-lines');
  var elTot = gid('sales-fin-total');
  var elUn = gid('sales-fin-unpaid');
  if (!tb) return;
  var conf = salesOrders.filter(function(o) { return o.orderStatus === 'confirmed'; });
  if (elLines) elLines.textContent = String(conf.length);
  var sum = conf.reduce(function(s, o) { return s + (parseFloat(o.totalAmount) || 0); }, 0);
  var sumUn = conf.filter(function(o) { return o.paymentStatus === 'credit' || o.paymentStatus === 'cash_pending'; })
    .reduce(function(s, o) { return s + (parseFloat(o.totalAmount) || 0); }, 0);
  if (elTot) elTot.textContent = sum.toFixed(2);
  if (elUn) elUn.textContent = sumUn.toFixed(2);
  if (!conf.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888">No confirmed orders</td></tr>';
    return;
  }
  var sorted = conf.slice().sort(function(a, b) { return String(b.confirmedAt || b.createdAt || '').localeCompare(String(a.confirmedAt || a.createdAt || '')); });
  tb.innerHTML = sorted.map(function(o) {
    return '<tr><td>' + csmEscapeHtml(o.customerName || '') + '</td><td>' + csmEscapeHtml(o.containerNo || '') + '</td><td>' + csmEscapeHtml(o.productName || '') + '</td><td>' + csmEscapeHtml(String(o.quantity)) + '</td><td>' +
      (parseFloat(o.totalAmount) || 0).toFixed(2) + '</td><td>' + csmEscapeHtml(csmSalesPayLabel(o.paymentStatus, true)) + '</td></tr>';
  }).join('');
}
function openSalesCustomerModal(id) {
  var m = gid('sales-customer-modal');
  if (!m) return;
  m.classList.add('sh');
  gid('sales-customer-id').value = id || '';
  gid('sales-customer-name').value = '';
  gid('sales-customer-address').value = '';
  gid('sales-customer-vat').value = '';
  gid('sales-customer-phone').value = '';
  gid('sales-customer-email').value = '';
  if (id) {
    var c = salesCustomers.find(function(x) { return x.id === id; });
    if (c) {
      gid('sales-customer-name').value = c.name || '';
      gid('sales-customer-address').value = c.address || '';
      gid('sales-customer-vat').value = c.vatNumber || '';
      gid('sales-customer-phone').value = c.phone || '';
      gid('sales-customer-email').value = c.email || '';
    }
  }
}
function clSalesCustomerModal() { var m = gid('sales-customer-modal'); if (m) m.classList.remove('sh'); }
function saveSalesCustomerFromModal() {
  if (!salesCustomersRef) { toast('Database not connected', 'err'); return; }
  var id = (gid('sales-customer-id').value || '').trim();
  var name = (gid('sales-customer-name').value || '').trim();
  if (!name) { toast('Customer name required', 'err'); return; }
  if (!id) id = 'sc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  var rec = {
    name: name,
    address: (gid('sales-customer-address').value || '').trim(),
    vatNumber: (gid('sales-customer-vat').value || '').trim(),
    phone: (gid('sales-customer-phone').value || '').trim(),
    email: (gid('sales-customer-email').value || '').trim(),
    updatedAt: new Date().toISOString()
  };
  salesCustomersRef.child(id).set(rec).then(function() {
    toast('Customer saved', 'ok');
    clSalesCustomerModal();
  }).catch(function(e) { toast('Save failed: ' + (e.message || e), 'err'); });
}
function deleteSalesCustomer(id) {
  if (!id || !salesCustomersRef) return;
  var used = salesOrders.some(function(o) { return o.customerId === id; });
  if (used) { toast('Customer is used in orders', 'err'); return; }
  if (!confirm('Delete this customer?')) return;
  salesCustomersRef.child(id).remove().then(function() { toast('Deleted', 'ok'); }).catch(function() { toast('Delete failed', 'err'); });
}
function salesFillCustomerSelect(sel) {
  if (!sel) return;
  sel.innerHTML = '<option value="">Select customer</option>' + salesCustomers.map(function(c) {
    var vid = String(c.id || '').replace(/"/g, '');
    return '<option value="' + vid + '">' + csmEscapeHtml(c.name) + '</option>';
  }).join('');
}
function openSalesOrderModal(id) {
  var m = gid('sales-order-modal');
  if (!m) return;
  m.classList.add('sh');
  gid('sales-order-id').value = id || '';
  salesFillCustomerSelect(gid('sales-order-customer'));
  gid('sales-order-cn').value = '';
  gid('sales-order-product').value = '';
  gid('sales-order-qty').value = '1';
  gid('sales-order-price').value = '';
  var rEx = document.getElementById('sales-vat-excluded');
  var rIn = document.getElementById('sales-vat-included');
  if (rEx) rEx.checked = true;
  gid('sales-order-payment').value = 'cash_pending';
  if (id) {
    var o = salesOrders.find(function(x) { return x.id === id; });
    if (!o) { clSalesOrderModal(); return; }
    if (o.orderStatus !== 'draft') { toast('Only draft orders editable', 'err'); clSalesOrderModal(); return; }
    gid('sales-order-customer').value = o.customerId || '';
    gid('sales-order-cn').value = o.containerNo || '';
    gid('sales-order-product').value = o.productName || '';
    gid('sales-order-qty').value = String(o.quantity);
    gid('sales-order-price').value = String(o.unitPrice);
    if (o.vatMode === 'included' && rIn) rIn.checked = true;
    else if (rEx) rEx.checked = true;
    gid('sales-order-payment').value = o.paymentStatus || 'cash_pending';
  }
}
function clSalesOrderModal() { var m = gid('sales-order-modal'); if (m) m.classList.remove('sh'); }
function saveSalesOrderFromModal() {
  if (!salesOrdersRef) { toast('Database not connected', 'err'); return; }
  var id = (gid('sales-order-id').value || '').trim();
  var customerId = gid('sales-order-customer').value;
  var cust = salesCustomers.find(function(c) { return c.id === customerId; });
  if (!cust) { toast('Select customer', 'err'); return; }
  var cn = (gid('sales-order-cn').value || '').trim().toUpperCase();
  var product = (gid('sales-order-product').value || '').trim();
  var qty = parseFloat(gid('sales-order-qty').value) || 0;
  var unitPrice = parseFloat(gid('sales-order-price').value);
  if (!cn || !product || qty <= 0 || !(unitPrice >= 0)) { toast('Check container, product, qty and unit price', 'err'); return; }
  var vatMode = document.getElementById('sales-vat-included') && document.getElementById('sales-vat-included').checked ? 'included' : 'excluded';
  var payment = gid('sales-order-payment').value || 'cash_pending';
  var amounts = csmSalesComputeTotals(unitPrice, qty, vatMode);
  if (!id) id = 'so_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  var existing = salesOrders.find(function(x) { return x.id === id; });
  if (existing && existing.orderStatus !== 'draft') { toast('Not editable', 'err'); return; }
  var rec = {
    customerId: customerId,
    customerName: cust.name || '',
    containerNo: cn,
    productName: product,
    quantity: qty,
    unitPrice: unitPrice,
    vatMode: vatMode,
    paymentStatus: payment,
    orderStatus: 'draft',
    totalAmount: amounts.total,
    netAmount: amounts.net,
    vatAmount: amounts.vat,
    createdAt: (existing && existing.createdAt) ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  salesOrdersRef.child(id).set(rec).then(function() {
    toast('Order saved (draft)', 'ok');
    clSalesOrderModal();
  }).catch(function(e) { toast('Save failed: ' + (e.message || e), 'err'); });
}
function salesSubmitOrder(id) {
  var o = salesOrders.find(function(x) { return x.id === id; });
  if (!o || o.orderStatus !== 'draft' || !salesOrdersRef) return;
  salesOrdersRef.child(id).update({ orderStatus: 'submitted', updatedAt: new Date().toISOString() }).then(function() { toast('Submitted', 'ok'); }).catch(function(e) { toast(e.message, 'err'); });
}
function salesUndoSubmit(id) {
  var o = salesOrders.find(function(x) { return x.id === id; });
  if (!o || o.orderStatus !== 'submitted' || !salesOrdersRef) return;
  salesOrdersRef.child(id).update({ orderStatus: 'draft', updatedAt: new Date().toISOString() }).then(function() { toast('Withdrawn', 'ok'); }).catch(function(e) { toast(e.message, 'err'); });
}
function salesConfirmOrder(id) {
  var o = salesOrders.find(function(x) { return x.id === id; });
  if (!o || o.orderStatus !== 'submitted' || !salesOrdersRef) return;
  salesOrdersRef.child(id).update({
    orderStatus: 'confirmed',
    confirmedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }).then(function() { toast('Confirmed', 'ok'); }).catch(function(e) { toast(e.message, 'err'); });
}
function salesDeleteOrder(id) {
  var o = salesOrders.find(function(x) { return x.id === id; });
  if (!o || o.orderStatus !== 'draft' || !salesOrdersRef) return;
  if (!confirm('Delete draft order?')) return;
  salesOrdersRef.child(id).remove().then(function() { toast('Deleted', 'ok'); }).catch(function(e) { toast(e.message, 'err'); });
}
window.__csmMainScriptRan=1;
try { window.initApp = initApp; } catch (e) {}
try { window.initFirebase = initFirebase; } catch (e) {}
try { window.renderAll = renderAll; } catch (e) {}
try { window.renderPurchase = renderPurchase; } catch (e) {}
try { window.renderSupplierTable = renderSupplierTable; } catch (e) {}
try { window.renderLogisticsTable = renderLogisticsTable; } catch (e) {}
try { window.getStoreDisplayName = getStoreDisplayName; } catch (e) {}
try { window.showAdminView = showAdminView; } catch (e) {}
try { window.showLogisticsView = showLogisticsView; } catch (e) {}
try { window.showSupplierView = showSupplierView; } catch (e) {}
try { window.migrateSupplierRecordOwners = migrateSupplierRecordOwners; } catch (e) {}
try { window.sendLoginPasswordReset = sendLoginPasswordReset; } catch (e) {}
try { window.sendUserPasswordResetEmail = sendUserPasswordResetEmail; } catch (e) {}
try { window.toggleNewUserPassword = toggleNewUserPassword; } catch (e) {}
