// ============================================================
// CONFIG
// ============================================================
const SK = 'csm_warehouse1';const LOCAL_STORAGE_KEY = 'csm_records_v3';
// Firebase 配置。Realtime Database 经香港反代；databaseURL 勿在路径末尾加 /；可用 ?ns= 指定 RTDB 实例。
var firebaseConfig = {  apiKey: 'AIzaSyDOdn2Vzv3EvW_EbtGFp8mzhXLfjlVsN24',  authDomain: 'superharves-cold-store.firebaseapp.com',  databaseURL: 'https://api.superharvest.com.cn?ns=superharves-cold-store-default-rtdb',  projectId: 'superharves-cold-store',  storageBucket: 'superharves-cold-store.firebasestorage.app',  messagingSenderId: '379038228954',  appId: '1:379038228954:web:e64fa3be3f2f49b3aae0e3'};try { window.firebaseConfig = firebaseConfig; } catch (eCfg) {}var dbRef = null;var legacyDbRef = null;var purchaseRef = null;var salesCustomersRef = null;var salesPaymentReceiversRef = null;var salesWorkersRef = null;var salesTrucksRef = null;var salesOrdersRef = null;var salesPaymentsRef = null;var settingsMetaRef = null;var finRootRef = null;var finInboxRef = null;var finJournalsRef = null;var finJournalLinesRef = null;var finArRef = null;var finApRef = null;var finCashRef = null;var finBankRef = null;var finVatRef = null;var finCorporateTaxRef = null;var auth = null;var primaryRecsVal = {};var legacyRecsVal = {};
var salesCustomers = [];var salesPaymentReceivers = [];var salesWorkers = [];var salesTrucks = [];var salesOrders = [];var salesPayments = [];var salesSubView = 'dash';var salesOrdersPage = 1;var salesOrdersPageSize = 20;var salesFinancePage = 1;var salesFinancePageSize = 20;
var salesWtSettlementsRef = null;var salesWtSettlements = [];var finSubView = 'orders';var companyFinView = 'dashboard';
var customsFeePendingRef = null;var customsFeeRequests = [];var finPendingSelectedCategoryKey = null;
/** User closed the W/T detail panel; do not auto-open wtAll until they leave 公司财务. */
var finPendingWtPanelDismissed = false;
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
var recs = [];var currentColdStore = 1;var currentUser = null;var currentUserEmail = null;var isAdmin = false;var isStaff = false;var isLogistics = false;var isSupplier = false;var currentSupplierName = null;
/**
 * index.html fallback 只设 window.isAdmin；主程序用模块内 isAdmin。
 * 未同步时：无法切公司财务、refreshSalesUi 不跑、wt 监听未挂 → 待审批为空。
 */
function csmSyncRoleFromWindow() {
  try {
    var wa = window.isAdmin === true;
    var ws = window.isStaff === true;
    if (!wa && !ws) return;
    var changed = false;
    if (wa && !isAdmin) { isAdmin = true; changed = true; }
    if (ws && !isStaff) { isStaff = true; changed = true; }
    if (changed && (isAdmin || isStaff) && typeof attachDataListenersForRole === 'function') {
      attachDataListenersForRole();
    }
  } catch (e) {}
}
try { window.csmSyncRoleFromWindow = csmSyncRoleFromWindow; } catch (eSync) {}
function canManageAccounts() { return isAdmin === true; }
function updatePortalNavForStaff() {
  var w2 = gid('portalBtnW2');
  var fin = gid('portalBtnFin');
  if (w2) w2.style.display = isStaff ? 'none' : '';
  /** Staff 可进「公司财务」但仅看「待审批」（与 W1 装卸为同一数据）。 */
  if (fin) fin.style.display = '';
}
function csmSetStaffFinPendingOnlyClass(active) {
  try {
    if (isStaff) {
      if (active) document.body.classList.add('csm-staff-fin-pending-only');
      else document.body.classList.remove('csm-staff-fin-pending-only');
    } else {
      document.body.classList.remove('csm-staff-fin-pending-only');
    }
  } catch (e) {}
}
function updateStaffRestrictedVisibility() {
  var br = gid('btn-clear-records');
  var bc = gid('btn-clear-checkout');
  if (br) br.style.display = isStaff ? 'none' : '';
  if (bc) bc.style.display = isStaff ? 'none' : '';
  var acc = gid('settings-account-section');
  if (acc) acc.style.display = canManageAccounts() ? '' : 'none';
  syncUnifiedSettingsFormEditability();
}
function syncUnifiedSettingsFormEditability() {
  var editable = !!(isAdmin || isStaff);
  [
    { inputId: 'sett-supplier-input' },
    { inputId: 'sett-product-input' },
    { inputId: 'sett-shipcompany-input' },
    { inputId: 'sett-pol-input' },
    { inputId: 'sett-pod-input' }
  ].forEach(function(cfg) {
    var inp = gid(cfg.inputId);
    if (inp) {
      inp.disabled = !editable;
      inp.style.opacity = editable ? '1' : '0.88';
    }
    var row = inp && inp.parentElement;
    if (row && row.classList && row.classList.contains('sett-row')) {
      var btn = row.querySelector('button.sett-add-btn');
      if (btn) btn.style.display = editable ? '' : 'none';
    }
  });
}

// 管理员主界面：Warehouse1 / Warehouse2 / 公司财务 一键切换
var currentMainSuite = 'w1'; 
// 供应商自己的名称（用于在采购记录中识别）
var pendingLoginError = null;var USERS_KEY = 'csm_users_v2';
var activeDataListeners = [];
var supplierOwnedSnapshot = {};
var supplierNameSnapshot = {};
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
  supplierNameSnapshot = {};
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
  if (typeof renderPurchase === 'function' && (isAdmin || isStaff || isLogistics)) renderPurchase();
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
  if (isAdmin || isStaff || isLogistics) {
    renderPurchase();
  }
  if (isSupplier) renderSupplierTable();
}
function mergeSupplierScopedData() {
  var merged = {};
  Object.keys(supplierOwnedSnapshot || {}).forEach(function(k) { merged[k] = supplierOwnedSnapshot[k]; });
  Object.keys(supplierNameSnapshot || {}).forEach(function(k) { merged[k] = supplierNameSnapshot[k]; });
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
  if (isAdmin || isStaff || isLogistics) {
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
  if (isAdmin || isStaff || isLogistics) {
    bindValueListener(supplierRef, function(snap) {
      updateSupplierRecsFromData(snap.val() || {}, isAdmin);
    });
    if ((isAdmin || isStaff) && salesCustomersRef && salesOrdersRef) {
      bindValueListener(salesCustomersRef, function(snap) {
        salesCustomers = csmSalesObjToArr(snap.val(), false);
        refreshSalesUi();
      });
      if (salesPaymentReceiversRef) {
        bindValueListener(salesPaymentReceiversRef, function(snap) {
          salesPaymentReceivers = csmSalesObjToArr(snap.val(), false);
          refreshSalesUi();
        });
      }
      if (salesWorkersRef) {
        bindValueListener(salesWorkersRef, function(snap) {
          salesWorkers = csmSalesObjToArr(snap.val(), false);
          refreshSalesUi();
        });
      }
      if (salesTrucksRef) {
        bindValueListener(salesTrucksRef, function(snap) {
          salesTrucks = csmSalesObjToArr(snap.val(), false);
          refreshSalesUi();
        });
      }
      bindValueListener(salesOrdersRef, function(snap) {
        salesOrders = csmSalesObjToArr(snap.val(), true);
        refreshSalesUi();
      });
      if (salesWtSettlementsRef) {
        bindValueListener(salesWtSettlementsRef, function(snap) {
          var raw = snap.val() || {};
          salesWtSettlements = Object.keys(raw).map(function(k) {
            var o = Object.assign({}, raw[k] || {});
            o.id = k;
            return o;
          }).sort(function(a, b) {
            return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
          });
          refreshSalesUi();
        });
      }
      if (salesPaymentsRef) {
        bindValueListener(salesPaymentsRef, function(snap) {
          var raw = snap.val() || {};
          salesPayments = Object.keys(raw).map(function(k) {
            var o = Object.assign({}, raw[k] || {});
            o.id = k;
            return o;
          }).sort(function(a, b) {
            return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
          });
          refreshSalesUi();
        });
      }
    }
  }
  if (isSupplier) {
    if (supplierRef && currentUser) {
      try {
        bindValueListener(supplierRef.orderByChild('ownerUid').equalTo(currentUser), function(snap) {
          supplierOwnedSnapshot = snap.val() || {};
          mergeSupplierScopedData();
        });
      } catch (eSupListen) {
        console.error('csm supplier scoped listener', eSupListen);
      }
    }
    if (supplierRef && currentSupplierName) {
      try {
        bindValueListener(supplierRef.orderByChild('supplier').equalTo(String(currentSupplierName).trim()), function(snap) {
          supplierNameSnapshot = snap.val() || {};
          mergeSupplierScopedData();
        });
      } catch (eSupNameListen) {
        console.error('csm supplier name listener', eSupNameListen);
      }
    }
  }
  try {
    if (settingsMetaRef && firebase.auth && firebase.auth().currentUser) {
      bindValueListener(settingsMetaRef, onSettingsMetaSnap);
    }
  } catch (eSettListen) {
    console.error('csm settings listener bind failed', eSettListen);
  }
}
var CSM_SUPPLIER_USD_TO_AED_RATE = 3.675;
function supplierUpdateAedFromUsd() {
  var uEl = gid('supplier-total-usd');
  var aEl = gid('supplier-total-aed');
  if (!aEl) return;
  if (!uEl || String(uEl.value).trim() === '') {
    aEl.value = '';
    return;
  }
  var v = parseFloat(uEl.value);
  if (isNaN(v) || !isFinite(v) || v < 0) {
    aEl.value = '';
    return;
  }
  aEl.value = String(Math.round(v * CSM_SUPPLIER_USD_TO_AED_RATE * 100) / 100);
}
function csmRoundMoney2(n) {
  return Math.round(n * 100) / 100;
}
function supplierRecalcTotalUsdFromPriceNet() {
  var netEl = gid('supplier-net-mt');
  var unitEl = gid('supplier-unit-price-usd');
  var totEl = gid('supplier-total-usd');
  if (!totEl) return;
  var netStr = netEl ? String(netEl.value).trim() : '';
  var unitStr = unitEl ? String(unitEl.value).trim() : '';
  if (netStr === '' || unitStr === '') return;
  var net = parseFloat(netStr);
  var unit = parseFloat(unitStr);
  if (isNaN(net) || isNaN(unit) || net < 0 || unit < 0 || !isFinite(net * unit)) return;
  totEl.value = String(csmRoundMoney2(net * unit));
  supplierUpdateAedFromUsd();
}
function fpRecalcTotalUsdFromPriceNet() {
  var netEl = gid('fp-net-mt');
  var unitEl = gid('fp-unit-price-usd');
  var totEl = gid('fp-total-usd');
  if (!totEl) return;
  var netStr = netEl ? String(netEl.value).trim() : '';
  var unitStr = unitEl ? String(unitEl.value).trim() : '';
  if (netStr === '' || unitStr === '') return;
  var net = parseFloat(netStr);
  var unit = parseFloat(unitStr);
  if (isNaN(net) || isNaN(unit) || net < 0 || unit < 0 || !isFinite(net * unit)) return;
  totEl.value = String(csmRoundMoney2(net * unit));
  fpUpdateAedFromUsd();
}
(function csmWirePurchaseUsdAutoTotal() {
  function bind(netId, unitId, recalc) {
    var net = gid(netId);
    var unit = gid(unitId);
    if (!net || !unit) return;
    function go() { recalc(); }
    net.addEventListener('input', go);
    net.addEventListener('change', go);
    unit.addEventListener('input', go);
    unit.addEventListener('change', go);
  }
  bind('supplier-net-mt', 'supplier-unit-price-usd', supplierRecalcTotalUsdFromPriceNet);
  bind('fp-net-mt', 'fp-unit-price-usd', fpRecalcTotalUsdFromPriceNet);
})();
function supplierRecWeightPriceForPurchase(rec) {
  rec = rec || {};
  var tt = String(rec.tradeTerm || '').trim().toUpperCase();
  if (['CFR', 'CIF', 'FOB'].indexOf(tt) === -1) tt = '';
  var nwm = parseFloat(rec.netWeightMt);
  var gwm = parseFloat(rec.grossWeightMt);
  var uusd = parseFloat(rec.unitPriceUsdMt);
  var tUsd = parseFloat(rec.totalAmountUsd);
  var totalAmountUsd = '';
  var totalAmountAed = '';
  if (!isNaN(tUsd) && isFinite(tUsd) && tUsd >= 0 && rec.totalAmountUsd !== '' && rec.totalAmountUsd != null) {
    totalAmountUsd = tUsd;
    totalAmountAed = Math.round(tUsd * CSM_SUPPLIER_USD_TO_AED_RATE * 100) / 100;
  }
  return {
    netWeightMt: isNaN(nwm) ? '' : nwm,
    grossWeightMt: isNaN(gwm) ? '' : gwm,
    tradeTerm: tt,
    unitPriceUsdMt: isNaN(uusd) ? '' : uusd,
    totalAmountUsd: totalAmountUsd,
    totalAmountAed: totalAmountAed
  };
}
function createPurchaseRecordFromSupplierRec(rec, id, item) {
  var sourceItem = item || (typeof normalizeSupplierRecItems === 'function' ? normalizeSupplierRecItems(rec)[0] : null) || {
    product: rec.product || '',
    qty: rec.qty || 0
  };
  var wp = supplierRecWeightPriceForPurchase(rec);
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
    bl: String(rec.bl || '').trim().toUpperCase(),
    invoiceNumber: String(rec.invoiceNumber || '').trim(),
    etd: rec.etd || '',
    eta: rec.eta || '',
    pol: rec.pol || '',
    pod: rec.pod || '',
    sourceSupplierRecId: rec.id || '',
    remarks: String(rec.remarks || '').trim(),
    netWeightMt: wp.netWeightMt,
    grossWeightMt: wp.grossWeightMt,
    tradeTerm: wp.tradeTerm,
    unitPriceUsdMt: wp.unitPriceUsdMt,
    totalAmountUsd: wp.totalAmountUsd,
    totalAmountAed: wp.totalAmountAed
  };
}
function makePurchaseRecordId() {
  return 'pur_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function makeSupplierRecordId() {
  return 'sp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function normalizeContainerNoForMatch(cn) {
  return String(cn || '').trim().toUpperCase();
}
function supplierCnExistsLocal(cn) {
  var key = normalizeContainerNoForMatch(cn);
  if (!key) return false;
  return (supplierRecs || []).some(function(r) {
    return normalizeContainerNoForMatch(r && r.cn) === key;
  });
}
function supplierCnExistsRemote(cn) {
  var key = normalizeContainerNoForMatch(cn);
  if (!key) return Promise.resolve(false);
  if (!supplierRef || typeof supplierRef.orderByChild !== 'function') {
    return Promise.resolve(supplierCnExistsLocal(key));
  }
  return supplierRef.orderByChild('cn').equalTo(key).once('value').then(function(snap) {
    return snap && snap.exists ? snap.exists() : false;
  });
}
function resolveSupplierOwnerUidByName(supplierName) {
  var key = String(supplierName || '').trim().toLowerCase();
  if (!key || typeof firebase === 'undefined' || !firebase.database) return Promise.resolve('');
  return firebase.database().ref('csm_users').once('value').then(function(snap) {
    var users = snap.val() || {};
    var matches = [];
    Object.keys(users).forEach(function(uid) {
      var u = users[uid] || {};
      if (String(u.role || '').toLowerCase() !== 'supplier') return;
      if (String(u.supplierName || '').trim().toLowerCase() === key) matches.push(uid);
    });
    return matches.length === 1 ? matches[0] : '';
  }).catch(function(err) {
    console.error('resolve supplier owner uid failed', err);
    return '';
  });
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
function backfillPurchaseSeq() {  if (!purchaseRef || !seqCounterRef) return;  var recsWithoutSeq = purchaseRecs.filter(function(r) { return !r.seq; });  if (recsWithoutSeq.length === 0) return;  console.log('Backfilling purchase seq for', recsWithoutSeq.length, 'records');  recsWithoutSeq.sort(csmPurchaseRowCompareAsc);  seqCounterRef.once('value').then(function(snap) {    var counters = Object.assign({}, snap.val() || {});    var batch = {};    recsWithoutSeq.forEach(function(r) {      var d = r.purchaseDate ? new Date(r.purchaseDate + 'T00:00:00') : new Date();      var y = d.getFullYear();      var m = ('0' + (d.getMonth() + 1)).slice(-2);      var dd = ('0' + (d.getDate())).slice(-2);      var key = '' + y + m + dd;      counters[key] = (counters[key] || 0) + 1;      var seq = key + ('00' + counters[key]).slice(-3);      batch['csm_seq_counter/' + key] = counters[key];      batch['csm_purchase/' + r.id + '/seq'] = seq;    });    dbRef.parent.update(batch).then(function() {      console.log('Purchase backfill complete');    }).catch(function(e) {      console.error('Purchase backfill error:', e);    });  });}
// ============================================================
// INIT
// ============================================================
// Auth 反代：apiHost 仅主机名（不要写 https://）；协议用 apiScheme（HTTPS + 域名，443 不写端口）。
// 等价于 auth.config.apiHost = "api.superharvest.com.cn" + apiScheme "https"。
// CORS（须配在 Nginx/反代上，前端无法绕过）：页面来源为 https://tian8896.github.io 时，对 /v1/* 与 OPTIONS 预检须返回
// Access-Control-Allow-Origin: https://tian8896.github.io
// Access-Control-Allow-Methods: GET, POST, OPTIONS
// Access-Control-Allow-Headers: Content-Type, Authorization, X-Client-Version, X-Firebase-GMPID 等（可与 Google 官方响应对齐或加更多）
// 若预检 OPTIONS 未带上述头，浏览器会报 “No Access-Control-Allow-Origin”。
var CSM_AUTH_PROXY_API_SCHEME = 'https';
var CSM_AUTH_PROXY_API_HOST = 'api.superharvest.com.cn';
var CSM_AUTH_PROXY_SDK_VERSION = 'v1';
var CSM_FIREBASE_AUTH_ESM = 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
function csmPatchAuthConfigFromAuthImpl(authImpl) {
  if (!authImpl || !authImpl.config) return;
  var cfg = authImpl.config;
  cfg.apiScheme = CSM_AUTH_PROXY_API_SCHEME;
  cfg.apiHost = CSM_AUTH_PROXY_API_HOST;
  cfg.sdkClientVersion = CSM_AUTH_PROXY_SDK_VERSION;
  try {
    cfg.tokenApiHost = CSM_AUTH_PROXY_API_HOST;
  } catch (eT) {}
}
function csmAuthTryUseDeviceLanguage(authLike) {
  try {
    if (authLike && typeof authLike.useDeviceLanguage === 'function') authLike.useDeviceLanguage();
  } catch (eLang) {}
}
function csmApplyAuthProxyCompatFallback(authCompat) {
  try {
    if (authCompat && authCompat._delegate) csmPatchAuthConfigFromAuthImpl(authCompat._delegate);
  } catch (eC) {}
}
function csmApplyAuthProxyToAppWithGetAuth(app) {
  if (!app) {
    return Promise.resolve(null);
  }
  var esmUrl = CSM_FIREBASE_AUTH_ESM;
  return import(esmUrl).then(function(mod) {
    try { window.__csmFirebaseAuthModule = mod; } catch (eM) {}
    var authFromGetAuth = mod.getAuth(app);
    csmPatchAuthConfigFromAuthImpl(authFromGetAuth);
    csmAuthTryUseDeviceLanguage(authFromGetAuth);
    return authFromGetAuth;
  });
}
function csmFinishFirebaseInitAfterAuthProxy() {
  try {
    auth = firebase.auth();
    csmApplyAuthProxyCompatFallback(auth);
    csmAuthTryUseDeviceLanguage(auth);
    try { window.csmAuth = auth; } catch (e1) {}
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});
    dbRef = firebase.database().ref(SK);    purchaseRef = firebase.database().ref('csm_purchase');    supplierRef = firebase.database().ref('csm_supplier_recs');    salesCustomersRef = firebase.database().ref('csm_sales_w1/customers');    salesPaymentReceiversRef = firebase.database().ref('csm_sales_w1/payment_receivers');    salesWorkersRef = firebase.database().ref('csm_sales_w1/workers');    salesTrucksRef = firebase.database().ref('csm_sales_w1/trucks');    salesOrdersRef = firebase.database().ref('csm_sales_w1/orders');    salesPaymentsRef = firebase.database().ref('csm_sales_w1/payments');    salesWtSettlementsRef = firebase.database().ref('csm_sales_w1/wt_settlements');    legacyDbRef = (SK !== LOCAL_STORAGE_KEY) ? firebase.database().ref(LOCAL_STORAGE_KEY) : null;    settingsMetaRef = firebase.database().ref('csm_meta/settings');    finRootRef = firebase.database().ref('csm_fin');    finInboxRef = firebase.database().ref('csm_fin/inbox');    finJournalsRef = firebase.database().ref('csm_fin/journals');    finJournalLinesRef = firebase.database().ref('csm_fin/journal_lines');    finArRef = firebase.database().ref('csm_fin/subledgers/ar');    finApRef = firebase.database().ref('csm_fin/subledgers/ap');    finCashRef = firebase.database().ref('csm_fin/accounts/cash');    finBankRef = firebase.database().ref('csm_fin/accounts/bank');    finVatRef = firebase.database().ref('csm_fin/tax/vat');    finCorporateTaxRef = firebase.database().ref('csm_fin/tax/corporate_tax');    customsFeePendingRef = firebase.database().ref('csm_fin/pending_customs_fees');    try { customsFeePendingRef.on('value', function(snap) { var o = snap.val() || {}; customsFeeRequests = Object.keys(o).map(function(k) { var r = o[k] || {}; r.id = k; return r; }).sort(function(a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); }); try { renderCompanyFinancialPendingCustoms(); } catch (eCusR) {} }); } catch (eCusB) {}    
// 初始化序号计数器引用（必须在这里做，避免 onAuthStateChanged 同步触发时 seqCounterRef 为 null）
seqCounterRef = dbRef.parent.child('csm_seq_counter');    
// Firebase Auth 状态监听    
auth.onAuthStateChanged(function(user) {      if (user) {        
// 用户已登录        
console.log('Firebase Auth: User logged in', user.email);        currentUser = user.uid;        currentUserEmail = user.email;        setLoginVerifyTimer();        
// 登录弹窗在资料校验通过后再关闭，避免「闪一下又退回登录」        
// 获取用户角色（异步，精确更新显示）        
var usersRef = firebase.database().ref('csm_users/' + user.uid);        usersRef.once('value').then(function(snap) {          var userData = snap.val();          var userDisplay = gid('currentUserDisplay');          var rootRef = firebase.database().ref();          function applyProfile(ud) {            ud = ud || {};            var r = String(ud.role != null ? ud.role : '').toLowerCase().replace(/\s/g, '');            isStaff = r === 'staff';            isAdmin = r === 'admin';            isLogistics = r === 'logistics';            isSupplier = r === 'supplier';            currentSupplierName = ud.supplierName || null;            attachDataListenersForRole();            var newRoleText = isLogistics ? '物流公司' : (isSupplier ? '供应商' : (isStaff ? '大丰收员工' : '管理员'));            if (userDisplay) { userDisplay.textContent = (user.email || 'User') + ' (' + newRoleText + ')'; }            if (isLogistics) { showLogisticsView(); }            else if (isSupplier) { showSupplierView(); }            else if (isAdmin || isStaff) { showAdminView(); }            else { toast('账号角色未识别，请联系管理员', 'err'); try { auth.signOut(); } catch (ePr) {} }            try { window.isAdmin = isAdmin; window.isStaff = isStaff; } catch (eW) {}          }          function bootstrapFirstAdmin() {            var profile = { email: user.email || '', role: 'admin', createdAt: firebase.database.ServerValue.TIMESTAMP };            var upd = {};            upd['csm_users/' + user.uid] = profile;            upd['csm_meta/site_initialized'] = true;            rootRef.update(upd).then(function() {              clearLoginVerifyTimer();              try {                applyProfile(profile);                toast('✅ 首次登录：已创建管理员', 'ok');                var lm0 = gid('loginModal');                if (lm0) { lm0.style.display = 'none'; lm0.classList.remove('sh'); }                var le0 = gid('login-error');                if (le0) { le0.style.display = 'none'; le0.style.color = ''; }              } catch (uiErr2) {                console.error('csm first-admin UI error', uiErr2);                pendingLoginError = '已写入管理员资料，但界面加载失败：' + (uiErr2 && uiErr2.message ? uiErr2.message : String(uiErr2));                toast('界面加载失败', 'err');                clearLoginVerifyTimer();                auth.signOut();              }            }).catch(function(e) {              console.error(e);              pendingLoginError = '首次初始化写入失败：' + (e.message || e) + '。规则需允许：已登录用户 update 写入 csm_users 下自己的节点，以及 csm_meta/site_initialized。';              toast('❌ 数据库写入失败', 'err');              clearLoginVerifyTimer();              auth.signOut();            });          }          if (userData) {            clearLoginVerifyTimer();            try {              applyProfile(userData);              toast('✅ 欢迎 ' + (user.email || 'User'), 'ok');              var lmOk = gid('loginModal');              if (lmOk) { lmOk.style.display = 'none'; lmOk.classList.remove('sh'); }              var leOk = gid('login-error');              if (leOk) { leOk.style.display = 'none'; leOk.style.color = ''; }            } catch (uiErr) {              console.error('csm login UI error', uiErr);              pendingLoginError = '登录成功但界面加载失败：' + (uiErr && uiErr.message ? uiErr.message : String(uiErr)) + '。请打开控制台查看 csm login UI error。';              toast('界面加载失败', 'err');              clearLoginVerifyTimer();              auth.signOut();            }          } else {            rootRef.child('csm_meta/site_initialized').once('value').then(function(metaSnap) {              if (metaSnap.val() === true) {                pendingLoginError = '您的账号未在 csm_users 中登记。请让管理员在「设置 → 用户管理」中添加，或在 Firebase 控制台手动添加 csm_users/' + user.uid;                toast('⚠️ 账号未注册', 'err');                clearLoginVerifyTimer();                auth.signOut();                return;              }              rootRef.child('csm_users').once('value').then(function(allSnap) {                var all = allSnap.val() || {};                var n = Object.keys(all).length;                if (n > 0) {                  rootRef.child('csm_meta/site_initialized').set(true).catch(function() {});                  pendingLoginError = '数据库里已有 ' + n + ' 个用户资料，但当前账号未登记。请管理员在「用户管理」中添加您，或手动写入 csm_users/' + user.uid;                  toast('⚠️ 账号未注册', 'err');                  clearLoginVerifyTimer();                  auth.signOut();                } else {                  bootstrapFirstAdmin();                }              }).catch(function(e) {                console.error(e);                pendingLoginError = '无法读取 csm_users（常被数据库规则拦截）。请在规则中为 csm_users 增加 ".read": "auth != null"，或手动在控制台添加 csm_users 节点与 csm_meta/site_initialized=true。详情：' + (e.message || e);                toast('❌ 无法校验用户表', 'err');                clearLoginVerifyTimer();                auth.signOut();              });            }).catch(function(e) {              console.error(e);              pendingLoginError = '无法读取 csm_meta/site_initialized：' + (e.message || e) + '。请在规则中为 csm_meta 增加已登录可读。';              toast('❌ 数据库读取失败', 'err');              clearLoginVerifyTimer();              auth.signOut();            });          }        }).catch(function(e) {          console.error('csm_users profile read error', e);          var permHint = (e && e.code === 'PERMISSION_DENIED') ? '（PERMISSION_DENIED：请在 Realtime Database 规则中允许已登录用户读取 csm_users 与 csm_meta。）' : '';          pendingLoginError = '读取个人资料失败：' + (e.message || e) + permHint + ' 路径：csm_users/' + (firebase.auth().currentUser && firebase.auth().currentUser.uid);          toast('❌ 读取用户失败', 'err');          clearLoginVerifyTimer();          auth.signOut();        });      } else {        clearLoginVerifyTimer();        setSupplierPortalLayout(false);        try { setLogisticsLayout(false); } catch (eLg0) {}        
// 用户未登录，显示登录弹窗        
console.log('Firebase Auth: User not logged in');        currentUser = null;        currentUserEmail = null;        isAdmin = false;        isStaff = false;        isLogistics = false;        isSupplier = false;        currentSupplierName = null;        hasCloudSettingsSnapshot = false;        currentMainSuite = 'w1';        try { window.isAdmin = false; window.isStaff = false; } catch (eW2) {}        try { sessionStorage.removeItem('csm_main_suite'); } catch (eAu) {}        var shellAu = gid('adminPortalShell');        if (shellAu) { shellAu.style.display = 'none'; shellAu.setAttribute('aria-hidden', 'true'); }        if (typeof resetMainSuiteForNonAdmin === 'function') resetMainSuiteForNonAdmin();        var h1Au = gid('headerTitle');        var hpAu = gid('headerSubtitle');        if (h1Au) h1Au.textContent = '🧊 迪拜大丰收冷库管理系统';        if (hpAu) hpAu.textContent = 'Super Harvest Cold Store Management System - Warehouse 1';        var ls = document.querySelector('.login-screen');        if (ls) ls.classList.remove('hidden');        showLoginModal();      }    });    
toast('✅ Firebase 连接成功', 'ok');    window.__csmInitDone = true;    window.__csmInitInFlight = false;  } catch(e) {    console.error('Firebase init error:', e);    window.__csmInitDone = false;    window.__csmInitInFlight = false;    toast('❌ Firebase 连接失败: ' + e.message, 'err');    showLoginModal();  }}function initApp() {  if (window.__csmInitDone || window.__csmInitInFlight) return;  window.__csmInitInFlight = true;  loadRates();  try {    if (!firebase.apps || !firebase.apps.length) { firebase.initializeApp(firebaseConfig); }    var app = firebase.app();    csmApplyAuthProxyToAppWithGetAuth(app).then(function() { csmFinishFirebaseInitAfterAuthProxy(); }, function(err) { console.warn('[CSM] auth proxy apply failed', err); csmFinishFirebaseInitAfterAuthProxy(); });  } catch(e) {    console.error('Firebase init error:', e);    window.__csmInitInFlight = false;    window.__csmInitDone = false;    toast('❌ Firebase 连接失败: ' + e.message, 'err');    showLoginModal();  }}function initFirebase() {  if (typeof firebase !== 'undefined' && firebase.initializeApp) {    initApp();    return;  }  var ver = '10.14.1';  var bases = ['https://cdn.jsdelivr.net/npm/firebase@' + ver + '/', 'https://www.gstatic.com/firebasejs/' + ver + '/'];  function loadScriptsSequential(urls, i, onOk, onFail) {    if (i >= urls.length) { onOk(); return; }    var s = document.createElement('script');    s.src = urls[i];    s.onload = function() { loadScriptsSequential(urls, i + 1, onOk, onFail); };    s.onerror = function() { onFail(); };    document.head.appendChild(s);  }  function tryBase(bi) {    if (bi >= bases.length) {      toast('❌ Firebase 无法加载，请换网络或稍后再试', 'err');      showLoginModal();      return;    }    var b = bases[bi];    var urls = [b + 'firebase-app-compat.js', b + 'firebase-database-compat.js', b + 'firebase-auth-compat.js'];    loadScriptsSequential(urls, 0, function() { initApp(); }, function() { tryBase(bi + 1); });  }  tryBase(0);}(function () {  function csmBoot() {    initFirebase();    setDefTimes();    loadSettings();    try { syncAllProductSelects(); } catch (eBootSync) {}  }  if (document.readyState === 'loading') {    window.addEventListener('DOMContentLoaded', csmBoot);  } else {    csmBoot();  }})();
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
  var authCompat = app.auth();
  csmApplyAuthProxyCompatFallback(authCompat);
  csmAuthTryUseDeviceLanguage(authCompat);
  if (window.__csmFirebaseAuthModule) {
    try {
      var ma = window.__csmFirebaseAuthModule.getAuth(app);
      csmPatchAuthConfigFromAuthImpl(ma);
      csmAuthTryUseDeviceLanguage(ma);
    } catch (eSec) {}
  } else {
    import(CSM_FIREBASE_AUTH_ESM).then(function(mod) {
      try { window.__csmFirebaseAuthModule = mod; } catch (eM) {}
      var mb = mod.getAuth(app);
      csmPatchAuthConfigFromAuthImpl(mb);
      csmAuthTryUseDeviceLanguage(mb);
    }).catch(function() {});
  }
  return authCompat;
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
function refreshShipCompanyDropdown(selectId, selectedValue) {
  var el = gid(selectId);
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
function refreshSupplierShipCompanyOptions(selectedValue) {
  refreshShipCompanyDropdown('supplier-shipcompany', selectedValue);
}
function refreshPortListDropdown(selectId, listKey, selectedValue) {
  var el = gid(selectId);
  if (!el) return;
  var current = String(selectedValue != null ? selectedValue : el.value || '').trim();
  var source = listKey === 'pod' ? (settData.pod || []) : (settData.pol || []);
  var list = (Array.isArray(source) ? source : []).slice().sort(function(a, b) { return String(a).localeCompare(String(b)); });
  var emptyLabel = listKey === 'pod' ? 'Select POD / 选择目的港' : 'Select POL / 选择起运港';
  var html = '<option value="">' + emptyLabel + '</option>' + list.map(function(name) {
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
function refreshAllPolPodDropdowns(selectedPol, selectedPod) {
  refreshPortListDropdown('supplier-pol', 'pol', selectedPol);
  refreshPortListDropdown('supplier-pod', 'pod', selectedPod);
  refreshPortListDropdown('fp-pol', 'pol', selectedPol);
  refreshPortListDropdown('fp-pod', 'pod', selectedPod);
}
function refreshFpSupplierSelect(selectedValue) {
  var el = gid('fp-supplier');
  if (!el || el.tagName !== 'SELECT') return;
  var current = String(selectedValue != null ? selectedValue : el.value || '').trim();
  var list = (settData.suppliers || []).slice().sort(function(a, b) { return String(a).localeCompare(String(b), 'en'); });
  var html = '<option value="">请选择供应商 / Select supplier</option>';
  list.forEach(function(name) {
    var n = String(name || '').trim();
    if (!n) return;
    var esc = n.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    var selected = current && current.toLowerCase() === n.toLowerCase() ? ' selected' : '';
    html += '<option value="' + esc + '"' + selected + '>' + esc + '</option>';
  });
  if (current && list.every(function(n) { return String(n).trim().toLowerCase() !== current.toLowerCase(); })) {
    var escC = current.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    html += '<option value="' + escC + '" selected>' + escC + '（旧值）</option>';
  }
  el.innerHTML = html;
}
function fpUpdateAedFromUsd() {
  var uEl = gid('fp-total-usd');
  var aEl = gid('fp-total-aed');
  if (!aEl) return;
  if (!uEl || String(uEl.value).trim() === '') {
    aEl.value = '';
    return;
  }
  var v = parseFloat(uEl.value);
  if (isNaN(v) || !isFinite(v) || v < 0) {
    aEl.value = '';
    return;
  }
  aEl.value = String(Math.round(v * CSM_SUPPLIER_USD_TO_AED_RATE * 100) / 100);
}
function htmlPurchaseItemsBodySingleRow() {
  return '<tr class="purchase-item-row">' +
    '<td style="padding:4px;border:1px solid #ddd;vertical-align:middle">' + htmlPurchaseItemProductSelect(0, '') + '</td>' +
    '<td style="padding:4px;border:1px solid #ddd;vertical-align:middle"><input type="number" class="item-qty csm-pi-qty" value="0" min="0" placeholder="实际装货数量" title="输入实际装货数量 / Enter actual loaded quantity"></td>' +
    '<td style="padding:4px;border:1px solid #ddd;text-align:center"><button type="button" class="abtn x" onclick="removePurchaseItem(this)" style="color:#ff4444;font-size:16px">×</button></td>' +
    '</tr>';
}
function resetW1PurchaseFormFields(clearDate) {
  var ids = ['fp-cn', 'fp-bl', 'fp-invoice', 'fp-net-mt', 'fp-gross-mt', 'fp-unit-price-usd', 'fp-total-usd', 'fp-total-aed', 'fp-shipname', 'fp-remark'];
  ids.forEach(function(id) {
    var e = gid(id);
    if (e) e.value = '';
  });
  var tt = gid('fp-trade-term');
  if (tt) tt.value = '';
  var etd = gid('fp-etd');
  var eta = gid('fp-eta');
  if (etd) etd.value = '';
  if (eta) eta.value = '';
  var fpol = gid('fp-pol');
  var fpod = gid('fp-pod');
  if (fpol) fpol.value = '';
  if (fpod) fpod.value = '';
  var fd = gid('fp-date');
  if (fd && clearDate) fd.value = '';
  var ft = gid('fp-time');
  if (ft && clearDate) ft.value = '';
  fpRecalcTotalUsdFromPriceNet();
  fpUpdateAedFromUsd();
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
      if (typeof renderPurchase === 'function' && (isAdmin || isStaff || isLogistics)) renderPurchase();
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
// 登录弹窗：提示「同一浏览器仅一个 Firebase 会话」（与 Firebase Web SDK 行为一致）
function updateLoginSessionNotice() {
  var el = gid('login-session-notice');
  if (!el) return;
  try {
    var u = auth && typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
    if (!u || !u.email) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = 'block';
    var safe = String(u.email).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    el.innerHTML = '当前浏览器已登录：<span style="font-family:var(--csm-font-en);font-weight:700">' + safe + '</span>。再输入其他账号并登录将<strong>切换</strong>为此账号，本页与其它标签页会一并更新。<span class="login-session-en">One login per browser: new sign-in replaces the previous session in all tabs.</span>';
  } catch (e) {
    el.style.display = 'none';
  }
}
// 显示登录弹窗
function showLoginModal() {  var modal = gid('loginModal');  if (modal) {    modal.style.display = 'flex';    modal.classList.add('sh');    gid('login-username').value = '';    gid('login-password').value = '';    var le = gid('login-error');    if (pendingLoginError) {      le.textContent = pendingLoginError;      le.style.display = 'block';      le.style.fontWeight = 'bold';      le.style.color = '#cc0000';      pendingLoginError = null;    } else {      le.textContent = '';      le.style.display = 'none';      le.style.fontWeight = '';      le.style.color = '';    }    resetLoginSliderState();    initLoginSliderOnce();    updateLoginSessionNotice();  }}
// Firebase Auth 登录处理
function doLogin() {  var email = (gid('login-username').value || '').trim().toLowerCase();  var password = (gid('login-password').value || '').trim();  if (!email || !password) {    var le1 = gid('login-error');    le1.textContent = '请输入邮箱和密码';    le1.style.color = '#cc0000';    le1.style.display = 'block';    return;  }  if (!window.__csmLoginSlideVerified) {    var le0 = gid('login-error');    le0.textContent = '请先向右滑动完成验证';    le0.style.color = '#cc0000';    le0.style.display = 'block';    return;  }  gid('login-error').style.display = 'none';  gid('login-error').style.color = '#cc0000';  
// 使用 Firebase Auth 登录  
if (!auth) {    gid('login-error').textContent = '系统仍在加载 Firebase，请等 1～2 秒后再点登录，或刷新页面';    gid('login-error').style.display = 'block';    toast('请稍候：Firebase 尚未就绪', 'err');    console.warn('auth is null — 页面 load 完成前点击了登录，或脚本未加载');    return;  }  try {    var curSw = auth.currentUser;    if (curSw && curSw.email && String(curSw.email).toLowerCase() !== email) {      var leSw = gid('login-error');      if (leSw) {        leSw.style.display = 'block';        leSw.style.color = '#0a6080';        leSw.style.fontWeight = 'normal';        leSw.textContent = '将结束当前登录「' + curSw.email + '」并改为新账号（本浏览器所有标签页会同步）。';      }    }  } catch (eSw) {}  auth.signInWithEmailAndPassword(email, password)    .then(function(userCredential) {      console.log('Firebase Auth: Login success', userCredential.user.email);      var le = gid('login-error');      if (le) {        le.style.color = '#0066cc';        le.textContent = '正在验证账号与权限…';        le.style.display = 'block';      }    })    .catch(function(error) {      console.error('Firebase Auth: Login failed', error);      var errorMsg = '登录失败';      if (error.code === 'auth/user-not-found') {        errorMsg = '用户不存在';      } else if (error.code === 'auth/wrong-password') {        errorMsg = '密码错误';      } else if (error.code === 'auth/invalid-email') {        errorMsg = '邮箱格式错误';      } else if (error.code === 'auth/too-many-requests') {        errorMsg = '尝试次数过多，请稍后再试';      } else if (error.code === 'auth/invalid-credential') {        errorMsg = '邮箱或密码错误';      } else if (error.code === 'auth/network-request-failed') {        errorMsg = '网络错误，请检查网络连接';      } else if (error.code === 'auth/invalid-api-key') {        errorMsg = 'Firebase 配置错误，请联系管理员';      } else if (error.code === 'auth/unauthorized-domain') {        errorMsg = '当前域名未授权：请在 Firebase 控制台 → 身份验证 → 设置 → 已授权网域 中添加本站点域名';      } else if (error.code === 'auth/operation-not-allowed') {        errorMsg = '未启用邮箱/密码登录：请在 Firebase 控制台 → 身份验证 → 登录方法 中启用「电子邮件/密码」';      }      var lec = gid('login-error');      lec.textContent = errorMsg + ' (' + (error.code || 'unknown') + ')';      lec.style.color = '#cc0000';      lec.style.fontWeight = 'bold';      lec.style.display = 'block';      toast(errorMsg, 'err');      resetLoginSliderState();    });}window.__csmRealDoLogin=doLogin;
// 注册新用户
function doRegister() {  var email = (gid('login-username').value || '').trim();  var password = (gid('login-password').value || '').trim();  if (!email || !password) {    gid('login-error').textContent = '请输入邮箱和密码';    gid('login-error').style.display = 'block';    return;  }  if (password.length < 6) {    gid('login-error').textContent = '密码至少6位';    gid('login-error').style.display = 'block';    return;  }  if (!window.__csmLoginSlideVerified) {    var ler = gid('login-error');    ler.textContent = '请先向右滑动完成验证';    ler.style.color = '#cc0000';    ler.style.display = 'block';    return;  }  gid('login-error').style.display = 'none';  
// 使用 Firebase Auth 注册（独立 App，避免切换当前会话）
var secReg = getSecondaryAuthForUserCreation();
if (!secReg) {    gid('login-error').textContent = '无法初始化注册通道，请刷新页面';    gid('login-error').style.display = 'block';    return;  }
secReg.createUserWithEmailAndPassword(email, password)    .then(function(userCredential) {      console.log('Firebase Auth: Register success', userCredential.user.email);      secReg.signOut().catch(function() {});      
// 创建用户角色记录 - 新用户默认是物流公司      
var userId = userCredential.user.uid;      firebase.database().ref('csm_users/' + userId).set({        email: email,        role: 'logistics', 
// 默认物流公司角色        
createdAt: firebase.database.ServerValue.TIMESTAMP      });      toast('✅ 注册成功', 'ok');    })    .catch(function(error) {      console.error('Firebase Auth: Register failed', error);      var errorMsg = '注册失败';      if (error.code === 'auth/email-already-in-use') {        errorMsg = '邮箱已被注册';      } else if (error.code === 'auth/invalid-email') {        errorMsg = '邮箱格式错误';      } else if (error.code === 'auth/weak-password') {        errorMsg = '密码强度不足';      }      gid('login-error').textContent = errorMsg;      gid('login-error').style.display = 'block';    });}
// 退出登录
function doLogout() {  setSupplierPortalLayout(false);  try { setLogisticsLayout(false); } catch (eLg1) {}  auth.signOut()    .then(function() {      console.log('Firebase Auth: Logged out');      currentUser = null;      currentUserEmail = null;      isAdmin = false;      isStaff = false;      isLogistics = false;      isSupplier = false;      currentSupplierName = null;      hasCloudSettingsSnapshot = false;      currentMainSuite = 'w1';      try { window.isAdmin = false; window.isStaff = false; } catch (eW3) {}      try { sessionStorage.removeItem('csm_main_suite'); } catch (eLo) {}      
// 重置界面      
var userDisplay = gid('currentUserDisplay');      if (userDisplay) {        userDisplay.textContent = '未登录';      }      var shellLo = gid('adminPortalShell');      if (shellLo) { shellLo.style.display = 'none'; shellLo.setAttribute('aria-hidden', 'true'); }      resetMainSuiteForNonAdmin();      var h1 = gid('headerTitle') || document.querySelector('header h1');      var hp = gid('headerSubtitle') || document.querySelector('header p');      if (h1) h1.textContent = '🧊 迪拜大丰收冷库管理系统';      if (hp) hp.textContent = 'Super Harvest Cold Store Management System - Warehouse 1';      toast('已退出登录', 'ok');    })    .catch(function(error) {      console.error('Firebase Auth: Logout failed', error);    });}
// Google 登录
function doGoogleLogin() {  if (!window.__csmLoginSlideVerified) {    var leg = gid('login-error');    if (leg) { leg.textContent = '请先向右滑动完成验证'; leg.style.color = '#cc0000'; leg.style.display = 'block'; }    return;  }  var provider = new firebase.auth.GoogleAuthProvider();  auth.signInWithPopup(provider)    .then(function(result) {      console.log('Firebase Auth: Google login success', result.user.email);      
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
  if (isAdmin || isStaff) {
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
  csmSyncRoleFromWindow();
  if (!isAdmin && !isStaff) {
    toast('仅主界面账号可使用顶部模块切换', 'err');
    return;
  }
  if (isStaff && mode === 'w2') {
    toast('大丰收员工不可使用 Warehouse 2 / Staff cannot use Warehouse 2', 'err');
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
  if (mode !== 'fin') {
    try { finPendingWtPanelDismissed = false; } catch (eDis) {}
  }
  csmSetStaffFinPendingOnlyClass(mode === 'fin');
  syncAdminPortalButtons();
  applyPortalHeaderTitles(mode);
  if (mode === 'fin') {
    if (isAdmin && !isStaff) {
      try {
        companyFinView = 'pending';
        sessionStorage.setItem('csm_company_fin_view', 'pending');
      } catch (ePend) {}
    }
    if (typeof renderCompanyFinancialPending === 'function') renderCompanyFinancialPending();
    if (typeof renderCompanyFinancialPendingCustoms === 'function') renderCompanyFinancialPendingCustoms();
    if (typeof renderCompanyFinancialWorkspace === 'function') renderCompanyFinancialWorkspace();
  }
}
try { window.switchMainSuite = switchMainSuite; } catch (eSw) {}
function setSupplierPortalLayout(active) {
  try {
    if (active) document.body.classList.add('csm-supplier-ui');
    else document.body.classList.remove('csm-supplier-ui');
  } catch (e) {}
}
try { window.setSupplierPortalLayout = setSupplierPortalLayout; } catch (eSpl) {}
function setLogisticsLayout(active) {
  try {
    if (active) document.body.classList.add('csm-logistics-ui');
    else document.body.classList.remove('csm-logistics-ui');
  } catch (e) {}
}
try { window.setLogisticsLayout = setLogisticsLayout; } catch (eLg) {}
// 显示管理员视图
function showAdminView() {  csmSyncRoleFromWindow();  setSupplierPortalLayout(false);  try { setLogisticsLayout(false); } catch (eLg2) {}  var lv = gid('logisticsView');  var sv = gid('supplierView');  if (lv) lv.style.display = 'none';  if (sv) sv.style.display = 'none';  var rights = document.querySelectorAll('.right');  if (rights[2]) rights[2].style.display = 'block';  var ui = gid('userInfo');  if (ui) ui.style.display = 'flex';  updateAdminPortalShellVisibility();  try { currentMainSuite = sessionStorage.getItem('csm_main_suite') || 'w1'; } catch (e1) { currentMainSuite = 'w1'; }  if (currentMainSuite !== 'w1' && currentMainSuite !== 'w2' && currentMainSuite !== 'fin') currentMainSuite = 'w1';  if (isStaff) { currentMainSuite = 'w1'; try { sessionStorage.setItem('csm_main_suite', 'w1'); } catch (eSt) {} }  switchMainSuite(currentMainSuite);  updatePortalNavForStaff();  updateStaffRestrictedVisibility();  updateSettingsButton();  renderPurchase();}
// 显示清关公司视图
function showLogisticsView() {  setSupplierPortalLayout(false);  try { setLogisticsLayout(true); } catch (eLg3) {}  var shell = gid('adminPortalShell');  if (shell) { shell.style.display = 'none'; shell.setAttribute('aria-hidden', 'true'); }  resetMainSuiteForNonAdmin();  var sv = gid('supplierView');  if (sv) sv.style.display = 'none';  var rights = document.querySelectorAll('.right');  if (rights[2]) rights[2].style.display = 'none';  var lv2 = gid('logisticsView');  if (lv2) lv2.style.display = 'block';  var ui2 = gid('userInfo');  if (ui2) ui2.style.display = 'none';  var h1a = gid('headerTitle') || document.querySelector('header h1');  if (h1a) h1a.textContent = '物流公司系统 / Logistics System';  var hs = gid('headerSubtitle');  if (hs) hs.textContent = 'Logistics fee tracking';  var lname = gid('logisticsUserName');  if (lname) lname.textContent = currentUserEmail || currentUser;  updateSettingsButton();  renderLogisticsTable();}
// 显示供应商视图
function showSupplierView() {  setSupplierPortalLayout(true);  try { setLogisticsLayout(false); } catch (eLg4) {}  var shell2 = gid('adminPortalShell');  if (shell2) { shell2.style.display = 'none'; shell2.setAttribute('aria-hidden', 'true'); }  resetMainSuiteForNonAdmin();  var lv3 = gid('logisticsView');  if (lv3) lv3.style.display = 'none';  var rights2 = document.querySelectorAll('.right');  if (rights2[2]) rights2[2].style.display = 'none';  var sv2 = gid('supplierView');  if (sv2) sv2.style.display = 'block';  var ui3 = gid('userInfo');  if (ui3) ui3.style.display = 'none';  var h1b = gid('headerTitle') || document.querySelector('header h1');  if (h1b) h1b.textContent = '🏭 供应商采购系统 / Supplier Portal';  var hs2 = gid('headerSubtitle');  if (hs2) hs2.textContent = 'Supplier purchase portal';  var sname = gid('supplierUserName');  if (sname) sname.textContent = currentUserEmail || currentUser;  updateSettingsButton();  try { csmInitSupplierMonthFilter(); } catch (eIm) {}  try { renderSupplierTable(); } catch (eSv0) {}  pullUnifiedSettingsOnce().then(function() { try { csmInitSupplierMonthFilter(); } catch (eIm2) {} try { renderSupplierTable(); } catch (eSv1) {} }, function(err) { console.error('csm pull settings (supplier view)', err); try { csmInitSupplierMonthFilter(); } catch (eIm3) {} try { renderSupplierTable(); } catch (eSv2) {} });}
function csmMonthStringToBounds(ym) {
  var p = (ym || '').split('-');
  var y = parseInt(p[0], 10), mo = parseInt(p[1], 10);
  if (!y || !mo || mo < 1 || mo > 12) return { start: '', end: '' };
  var last = new Date(y, mo, 0).getDate();
  return { start: ym + '-01', end: ym + '-' + ('0' + last).slice(-2) };
}
function csmSyncSupplierDatesFromMonth() {
  var mEl = gid('supplier-search-month');
  if (!mEl || !mEl.value) return;
  var b = csmMonthStringToBounds(mEl.value);
  var s = gid('supplier-search-date-start');
  var e = gid('supplier-search-date-end');
  if (s) s.value = b.start;
  if (e) e.value = b.end;
  var hint = gid('supplier-month-range-hint');
  if (hint && b.start && b.end) {
    hint.textContent = b.start + ' ~ ' + b.end;
  }
}
function csmInitSupplierMonthFilter() {
  var mEl = gid('supplier-search-month');
  if (!mEl) return;
  if (!mEl.value) {
    var d = new Date();
    mEl.value = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  csmSyncSupplierDatesFromMonth();
}
function csmSupplierMonthChanged() {
  csmSyncSupplierDatesFromMonth();
  renderSupplierTable();
}
try { window.csmSupplierMonthChanged = csmSupplierMonthChanged; } catch (eSm) {}
// 清空供应商搜索
function clearSupplierSearch() {
  var d = new Date();
  var ym = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  var mm = gid('supplier-search-month');
  if (mm) mm.value = ym;
  csmSyncSupplierDatesFromMonth();
  if (gid('supplier-search-cn')) gid('supplier-search-cn').value = '';
  renderSupplierTable();
}
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
    return '<div style="font-family:Arial;text-transform:capitalize">' + w1ProductHtml(item.product) + qtyText + '</div>';
  }).join('') + '</div>';
}
function createSupplierItemRow(rowId, item) {
  var row = document.createElement('tr');
  row.className = 'supplier-item-row';
  row.innerHTML =
    '<td style="padding:4px;border:1px solid #ddd;vertical-align:middle">' +
      '<select class="supplier-item-product csm-product-select csm-pi-product" data-rowid="' + rowId + '">' +
      buildProductSelectOptionsHtml(item && item.product ? item.product : '') +
      '</select>' +
    '</td>' +
    '<td style="padding:4px;border:1px solid #ddd;vertical-align:middle">' +
      '<input type="number" class="supplier-item-qty csm-pi-qty" placeholder="实际装货数量" title="输入实际装货数量 / Enter actual loaded quantity" min="0" value="">' +
    '</td>' +
    '<td style="padding:4px;border:1px solid #ddd;text-align:center">' +
      '<button type="button" class="abtn x" onclick="removeSupplierItem(this)" style="color:#ff4444;font-size:16px">×</button>' +
    '</td>';
  if (item) {
    var qtyInput = row.querySelector('.supplier-item-qty');
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
      error = '请选择品名 / Select product name';
      return;
    }
    if (!(qty > 0)) {
      error = '请输入数量，且必须大于 0 / Quantity is required';
      return;
    }
    items.push({ product: canonicalProductName(product), qty: qty });
  });
  return { items: items, error: error };
}
function openSupplierFormBody() {
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
  refreshAllPolPodDropdowns('', '');
  gid('supplier-bl').value = '';
  if (gid('supplier-invoice')) gid('supplier-invoice').value = '';
  gid('supplier-etd').value = '';
  gid('supplier-eta').value = '';
  var snm = gid('supplier-net-mt');
  var sgm = gid('supplier-gross-mt');
  var stt = gid('supplier-trade-term');
  var sup = gid('supplier-unit-price-usd');
  if (snm) snm.value = '';
  if (sgm) sgm.value = '';
  if (stt) stt.value = '';
  if (sup) sup.value = '';
  var stu = gid('supplier-total-usd');
  var sta = gid('supplier-total-aed');
  if (stu) stu.value = '';
  if (sta) sta.value = '';
  var srm = gid('supplier-remark');
  if (srm) srm.value = '';
  gid('supplier-modal-title').textContent = '📦 添加采购记录 / Add Purchase Record';
  gid('supplierModal').classList.add('sh');
}
function openSupplierForm() {
  pullUnifiedSettingsOnce().then(
    function() { openSupplierFormBody(); },
    function(err) { console.error('csm pull settings (open supplier form)', err); openSupplierFormBody(); }
  );
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
  var bl = (gid('supplier-bl').value || '').trim().toUpperCase();
  var invoiceNumber = gid('supplier-invoice') ? String(gid('supplier-invoice').value || '').trim() : '';
  var etd = (gid('supplier-etd').value || '').trim();
  var eta = (gid('supplier-eta').value || '').trim();
  var pol = gid('supplier-pol') ? String(gid('supplier-pol').value || '').trim() : '';
  var pod = gid('supplier-pod') ? String(gid('supplier-pod').value || '').trim() : '';
  var remarks = (gid('supplier-remark') && gid('supplier-remark').value != null) ? String(gid('supplier-remark').value).trim() : '';
  var tradeTermRaw = gid('supplier-trade-term') ? String(gid('supplier-trade-term').value || '').trim().toUpperCase() : '';
  if (['CFR', 'CIF', 'FOB'].indexOf(tradeTermRaw) === -1) tradeTermRaw = '';
  var netMtParsed = gid('supplier-net-mt') && String(gid('supplier-net-mt').value).trim() !== '' ? parseFloat(gid('supplier-net-mt').value) : NaN;
  var grossMtParsed = gid('supplier-gross-mt') && String(gid('supplier-gross-mt').value).trim() !== '' ? parseFloat(gid('supplier-gross-mt').value) : NaN;
  var unitUsdParsed = gid('supplier-unit-price-usd') && String(gid('supplier-unit-price-usd').value).trim() !== '' ? parseFloat(gid('supplier-unit-price-usd').value) : NaN;
  var totalUsdParsed = gid('supplier-total-usd') && String(gid('supplier-total-usd').value).trim() !== '' ? parseFloat(gid('supplier-total-usd').value) : NaN;
  var totalAedComputed = '';
  if (!isNaN(totalUsdParsed) && isFinite(totalUsdParsed) && totalUsdParsed >= 0) {
    totalAedComputed = Math.round(totalUsdParsed * CSM_SUPPLIER_USD_TO_AED_RATE * 100) / 100;
  }
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
  var polList = coerceSettingsStringList(settData.pol);
  var podList = coerceSettingsStringList(settData.pod);
  if (!polList.length || !podList.length) {
    toast('请先在「设置」中维护 POL 起运港与 POD 目的港列表', 'err');
    return;
  }
  if (!pol || polList.indexOf(pol) === -1) {
    toast('请选择有效的 POL 起运港（须来自设置列表）', 'err');
    return;
  }
  if (!pod || podList.indexOf(pod) === -1) {
    toast('请选择有效的 POD 目的港（须来自设置列表）', 'err');
    return;
  }
  if (getW1ProductsNormalized().length === 0) {
    toast('请先在「设置 → 品名管理」中添加品名', 'err');
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
    invoiceNumber: invoiceNumber,
    etd: etd,
    eta: eta,
    pol: pol,
    pod: pod,
    remarks: remarks,
    netWeightMt: isNaN(netMtParsed) ? '' : netMtParsed,
    grossWeightMt: isNaN(grossMtParsed) ? '' : grossMtParsed,
    tradeTerm: tradeTermRaw,
    unitPriceUsdMt: isNaN(unitUsdParsed) ? '' : unitUsdParsed,
    totalAmountUsd: isNaN(totalUsdParsed) ? '' : totalUsdParsed,
    totalAmountAed: isNaN(totalUsdParsed) ? '' : totalAedComputed,
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
  if (!isAdmin) {
    toast('仅管理员可确认或采用供应商记录', 'err');
    return;
  }
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
      var adoptRemarks = String(rec.remarks || '').trim();
      var adoptInvoice = String(rec.invoiceNumber || '').trim();
      var wpAdopt = supplierRecWeightPriceForPurchase(rec);
      var adoptPol = String(rec.pol || '').trim();
      var adoptPod = String(rec.pod || '').trim();
      existingPurchases.forEach(function(item) {
        writes.push(purchaseRef.child(item.id).update({
          seq: seq,
          remarks: adoptRemarks,
          invoiceNumber: adoptInvoice,
          netWeightMt: wpAdopt.netWeightMt,
          grossWeightMt: wpAdopt.grossWeightMt,
          tradeTerm: wpAdopt.tradeTerm,
          unitPriceUsdMt: wpAdopt.unitPriceUsdMt,
          totalAmountUsd: wpAdopt.totalAmountUsd,
          totalAmountAed: wpAdopt.totalAmountAed,
          pol: adoptPol,
          pod: adoptPod
        }));
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
  function fillEditSupplierModal() {
    gid('supplier-id').value = id;
    gid('supplier-cn').value = rec.cn || '';
    gid('supplier-date').value = rec.purchaseDate || '';
    gid('supplier-time').value = rec.purchaseTime || '';
    gid('supplier-supplier').value = rec.supplier || '';
    resetSupplierItemRows(normalizeSupplierRecItems(rec));
    gid('supplier-shipname').value = rec.shipname || '';
    refreshSupplierShipCompanyOptions(rec.shipCompany || '');
    refreshAllPolPodDropdowns(rec.pol || '', rec.pod || '');
    gid('supplier-bl').value = String(rec.bl || '').trim().toUpperCase();
    if (gid('supplier-invoice')) gid('supplier-invoice').value = String(rec.invoiceNumber || '').trim();
    gid('supplier-etd').value = rec.etd || '';
    gid('supplier-eta').value = rec.eta || '';
    var snmE = gid('supplier-net-mt');
    var sgmE = gid('supplier-gross-mt');
    var sttE = gid('supplier-trade-term');
    var supE = gid('supplier-unit-price-usd');
    if (snmE) snmE.value = rec.netWeightMt != null && rec.netWeightMt !== '' ? rec.netWeightMt : '';
    if (sgmE) sgmE.value = rec.grossWeightMt != null && rec.grossWeightMt !== '' ? rec.grossWeightMt : '';
    if (sttE) sttE.value = ['CFR', 'CIF', 'FOB'].indexOf(String(rec.tradeTerm || '').trim().toUpperCase()) !== -1 ? String(rec.tradeTerm || '').trim().toUpperCase() : '';
    if (supE) supE.value = rec.unitPriceUsdMt != null && rec.unitPriceUsdMt !== '' ? rec.unitPriceUsdMt : '';
    var stuE = gid('supplier-total-usd');
    if (stuE) stuE.value = rec.totalAmountUsd != null && rec.totalAmountUsd !== '' ? rec.totalAmountUsd : '';
    supplierRecalcTotalUsdFromPriceNet();
    supplierUpdateAedFromUsd();
    var srmE = gid('supplier-remark');
    if (srmE) srmE.value = rec.remarks || '';
    gid('supplier-modal-title').textContent = '✏️ 编辑采购记录 / Edit Purchase Record';
    gid('supplierModal').classList.add('sh');
  }
  pullUnifiedSettingsOnce().then(
    function() { fillEditSupplierModal(); },
    function(err) { console.error('csm pull settings (edit supplier)', err); fillEditSupplierModal(); }
  );
}
function csmPurchaseNormalizeTimePart(t) {
  t = String(t || '').trim();
  if (!t) return '';
  var m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return '';
  var hh = ('0' + parseInt(m[1], 10)).slice(-2);
  var mm = ('0' + parseInt(m[2], 10)).slice(-2);
  var ss = m[3] != null ? ('0' + parseInt(m[3], 10)).slice(-2) : '00';
  return hh + ':' + mm + ':' + ss;
}
function csmPurchaseRowSortKey(r) {
  var d = r && r.purchaseDate ? String(r.purchaseDate).trim() : '';
  var tRaw = r && r.purchaseTime ? String(r.purchaseTime).trim() : '';
  var ts = 0;
  if (d) {
    var tNorm = csmPurchaseNormalizeTimePart(tRaw);
    var part = tNorm ? ('T' + tNorm) : 'T23:59:59.999';
    var dd = new Date(d + part);
    ts = dd.getTime();
    if (isNaN(ts)) {
      dd = new Date(d + 'T12:00:00');
      ts = dd.getTime();
    }
    if (isNaN(ts)) ts = 0;
  }
  return { ts: ts, seq: String((r && r.seq) || ''), id: String((r && r.id) || '') };
}
function csmPurchaseRowCompareDesc(a, b) {
  var ka = csmPurchaseRowSortKey(a);
  var kb = csmPurchaseRowSortKey(b);
  if (kb.ts !== ka.ts) return kb.ts - ka.ts;
  var c = String(kb.seq).localeCompare(String(ka.seq), undefined, { numeric: true });
  if (c !== 0) return c;
  return String(kb.id).localeCompare(String(ka.id), undefined, { numeric: true });
}
function csmPurchaseRowCompareAsc(a, b) {
  return csmPurchaseRowCompareDesc(b, a);
}
function filterSupplierTable() {
  renderSupplierTable();
}
function renderSupplierTable() {
  var container = gid('supplierView');
  if (!container) return;
  if (gid('supplier-search-month') && !gid('supplier-search-month').value) {
    try { csmInitSupplierMonthFilter(); } catch (eR0) {}
  }
  var searchDateStart = (gid('supplier-search-date-start') || { value: '' }).value;
  var searchDateEnd = (gid('supplier-search-date-end') || { value: '' }).value;
  var searchCn = (gid('supplier-search-cn') || { value: '' }).value.trim().toUpperCase();
  var filtered = supplierRecs.filter(function(r) {
    var pdDay = String(r.purchaseDate || '').trim();
    if (pdDay.length >= 10) pdDay = pdDay.slice(0, 10);
    if (searchDateStart) {
      if (!pdDay || pdDay < searchDateStart) return false;
    }
    if (searchDateEnd) {
      if (!pdDay || pdDay > searchDateEnd) return false;
    }
    if (searchCn && (r.cn || '').indexOf(searchCn) === -1) return false;
    return true;
  });
  filtered.sort(csmPurchaseRowCompareDesc);
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
    } else if (isAdmin || isStaff) {
      if (status === 'submitted') {
        if (isAdmin) {
          actionBtns =
            '<button class="abtn" onclick="editSupplierRec(\'' + r.id + '\')">✏️</button> ' +
            '<button class="abtn" style="background:#2e7d32;color:#fff" onclick="confirmSupplierRec(\'' + r.id + '\')">✅ 确认</button> ' +
            '<button class="abtn x" onclick="delSupplierRec(\'' + r.id + '\')">🗑</button>';
        } else {
          actionBtns = '<span style="color:#888;font-size:12px">待管理员确认</span>';
        }
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
      '<td><div style="font-family:Arial;text-transform:capitalize">' + w1ProductHtml(firstItem.product) + '</div>' + (itemCount > 1 ? '<div style="font-size:11px;color:#888;margin-top:2px">其余 ' + (itemCount - 1) + ' 个品名点展开查看</div>' : '') + '</td>' +
      '<td style="white-space:nowrap">' + (r.purchaseDate || '-') + (r.purchaseTime ? '<br><span style="font-size:11px;color:#888">' + r.purchaseTime + '</span>' : '') + '</td>' +
      '<td style="font-family:Arial;font-size:12px">' + w1EscHtml(resolvePortListDisplayName(r.pol, 'pol')) + '</td>' +
      '<td style="font-family:Arial;font-size:12px">' + w1EscHtml(resolvePortListDisplayName(r.pod, 'pod')) + '</td>' +
      '<td style="text-align:center">' + getSupplierQtyTotal(r) + '</td>' +
      '<td>' + etdHtml + etaHtml + '</td>' +
      '<td style="font-family:Arial;text-transform:capitalize">' + fmtTitleCase(r.shipname) + '</td>' +
      '<td style="font-family:Arial;text-transform:capitalize">' + w1EscHtml(resolveShipCompanyDisplayName(r.shipCompany)) + '</td>' +
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
        '<td style="font-family:Arial;text-transform:capitalize">' + w1ProductHtml(item.product) + '</td>' +
        '<td style="color:#999">-</td>' +
        '<td style="color:#999">-</td>' +
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
  setModalTitle('Container Details');
  var linked = [];
  if (purchaseRecs && purchaseRecs.length) {
    linked = purchaseRecs.filter(function(p) { return p.sourceSupplierRecId === rec.id; });
    if (!linked.length) {
      linked = purchaseRecs.filter(function(p) { return p.cn === rec.cn; });
    }
    linked = linked.slice().sort(csmPurchaseRowCompareDesc);
  }
  var supplierItems = normalizeSupplierRecItems(rec);
  var status = rec.status || 'draft';
  var statusHtml = csmSupplierRecordStatusBadgeEn(status);
  var wpD = supplierRecWeightPriceForPurchase(rec);
  var pDateLine = String(rec.purchaseDate || '—') + (rec.purchaseTime ? ' ' + String(rec.purchaseTime) : '');
  var dateForProducts = (rec.purchaseDate ? fdt(rec.purchaseDate + 'T00:00:00') : '—') + (rec.purchaseTime ? ' ' + csmEscapeHtml(String(rec.purchaseTime)) : '');
  var productRows = supplierItems.map(function(item) {
    return { product: item.product, qty: item.qty, dateStr: dateForProducts };
  });
  var supRem = String(rec.remarks || '').trim();
  var remarksHtml = supRem ? '<span style="white-space:pre-wrap">' + csmEscapeHtml(supRem) + '</span>' : '';
  var feeSection;
  if (linked.length) {
    feeSection = {
      type: 'table',
      title: 'W1 Purchase Fees (Aed)',
      rows: linked.map(function(item) {
        var total = (item.demurrage || 0) + (item.customs || 0) + (item.coldFee || item.coldfee || 0) + (item.attestation || 0) + (item.repack || 0) + (item.waste || 0) + (item.other || 0);
        return { product: item.product, qty: item.qty, fees: total };
      })
    };
  } else {
    feeSection = {
      type: 'notice',
      html: '<div style="margin-top:14px;padding:12px;background:#fff8e1;border-radius:6px;border:1px solid #ffb300;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:14px;color:#e65100">' +
        'Not Yet In W1 Purchase List. After Admin Confirms, Data Syncs To Warehouse1.</div>'
    };
  }
  var coldBreakdown = getContainerColdFeeBreakdown(rec.cn || '');
  gid('mcon').innerHTML = htmlContainerDetailUnified({
    cn: rec.cn,
    supplier: rec.supplier || '',
    statusHtml: statusHtml,
    purchaseDateLine: pDateLine.trim() || '—',
    totalQty: getSupplierQtyTotal(rec),
    lineCount: supplierItems.length,
    wp: wpD,
    remarksHtml: remarksHtml,
    shipname: rec.shipname,
    shipCompany: rec.shipCompany,
    pol: rec.pol,
    pod: rec.pod,
    bl: rec.bl,
    invoiceNumber: rec.invoiceNumber,
    etd: rec.etd,
    eta: rec.eta,
    productRows: productRows,
    feeSection: feeSection,
    coldBreakdown: coldBreakdown
  });
  gid('modal').classList.add('sh');
}
// ============================================================
// USER MANAGEMENT
// ============================================================
var allUsers = [];

// 加载所有用户
function loadAllUsers() {
  if (!canManageAccounts()) return;
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
  html += '<th style="padding:10px;text-align:left;font-family:var(--csm-font-en);font-weight:700;text-transform:none">邮箱</th>';
  html += '<th style="padding:10px;text-align:center;font-family:var(--csm-font-en);font-weight:700;text-transform:none">角色</th>';
  html += '<th style="padding:10px;text-align:left;font-family:var(--csm-font-en);font-weight:700;text-transform:none">供应商名称</th>';
  html += '<th style="padding:10px;text-align:center;font-family:var(--csm-font-en);font-weight:700;text-transform:none">操作</th>';
  html += '</tr>';
  
  allUsers.forEach(function(user) {
    var roleLabel = {
      'admin': '<span style="background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:10px;font-size:12px">管理员</span>',
      'staff': '<span style="background:#ede7f6;color:#5e35b1;padding:2px 8px;border-radius:10px;font-size:12px">大丰收员工</span>',
      'logistics': '<span style="background:#fff8e1;color:#f57f17;padding:2px 8px;border-radius:10px;font-size:12px">物流公司</span>',
      'supplier': '<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:12px">供应商</span>',
      'pending': '<span style="background:#ffebee;color:#c62828;padding:2px 8px;border-radius:10px;font-size:12px">待审核</span>'
    }[user.role] || '<span style="color:#888">未知</span>';
    
    var selectOptions = '<select id="role_' + user.uid + '" style="padding:5px;border-radius:4px;border:1px solid #ddd">';
    selectOptions += '<option value="admin"' + (user.role === 'admin' ? ' selected' : '') + '>管理员</option>';
    selectOptions += '<option value="staff"' + (user.role === 'staff' ? ' selected' : '') + '>大丰收员工</option>';
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
      html += '<button type="button" onclick="sendUserPasswordResetEmail(' + csmHtmlAttrJson(String(user.email).trim()) + ')" style="padding:4px 8px;background:#0066cc;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;margin:2px">重置邮件</button>';
    }
    html += '<button type="button" onclick="saveUserRole(\'' + user.uid + '\')" style="padding:5px 12px;background:#4CAF50;color:#fff;border:none;border-radius:4px;cursor:pointer;margin:2px">保存</button></td>';
    html += '</tr>';
  });
  
  html += '</table>';
  container.innerHTML = html;
}

// 保存用户角色（独立弹窗 userMgmtModal）
function saveUserRole(uid) {
  if (!canManageAccounts()) {
    toast('需要管理员权限', 'err');
    return;
  }
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
  if (!canManageAccounts()) {
    toast('需要管理员权限', 'err');
    return;
  }
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
function updateSettingsButton() {  var settingsBtn = document.querySelector('button[onclick="openSettings()"]');  if (settingsBtn) {    settingsBtn.style.display = (isAdmin || isStaff) ? 'inline-block' : 'none';  }}
// ============================================================
// UTILS
// ============================================================
function gid(id) { return document.getElementById(id); }function pad2(n) { return String(n).padStart(2, '0'); }function nowFmt() {  var d = new Date();  return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());}function setDefTimes() {  var v = nowFmt();  if (gid('f-at')) gid('f-at').value = v;  if (gid('f-dt')) gid('f-dt').value = v;}function fdt(iso) {  if (!iso) return '-';  var d = new Date(iso);  return pad2(d.getDate()) + '/' + pad2(d.getMonth()+1) + '/' + d.getFullYear();}function fmtTitleCase(name) {  var s = String(name || '').trim();  if (!s) return '-';  return s.toLowerCase().replace(/\b([a-z])/g, function(_, c) { return c.toUpperCase(); });}function fmtSupplierName(name) {  return fmtTitleCase(name); }function toast(msg, type) {  var t = document.createElement('div');  t.className = 'tst' + (type === 'ok' ? ' tst-ok' : type === 'err' ? ' tst-err' : '');  t.textContent = msg;  document.body.appendChild(t);  setTimeout(function() { t.remove(); }, 3500);}
var CSM_W1_PAGER_LS = 'csm_w1_table_pager_v1';
var csmW1PagerState = { purchase: { page: 1, size: 20 }, records: { page: 1, size: 20 }, checkout: { page: 1, size: 20 } };
function csmW1PagerLoad() {
  try {
    var raw = localStorage.getItem(CSM_W1_PAGER_LS);
    if (!raw) return;
    var o = JSON.parse(raw);
    ['purchase', 'records', 'checkout'].forEach(function(k) {
      if (!o[k]) return;
      if (o[k].size != null) csmW1PagerState[k].size = parseInt(o[k].size, 10) || csmW1PagerState[k].size;
      if (o[k].page != null) csmW1PagerState[k].page = parseInt(o[k].page, 10) || 1;
    });
  } catch (e) {}
}
function csmW1PagerSave() {
  try { localStorage.setItem(CSM_W1_PAGER_LS, JSON.stringify(csmW1PagerState)); } catch (e) {}
}
function csmW1BuildPagesFromRowGroups(groups, pageSize) {
  var pages = [];
  var cur = [];
  var curLen = 0;
  function flush() {
    if (cur.length) { pages.push(cur); cur = []; curLen = 0; }
  }
  groups.forEach(function(g) {
    var glen = g.length;
    if (!pageSize || pageSize <= 0) return;
    if (glen > pageSize) {
      flush();
      for (var i = 0; i < glen; i += pageSize) {
        pages.push(g.slice(i, i + pageSize));
      }
      return;
    }
    if (curLen + glen > pageSize && cur.length) flush();
    cur = cur.concat(g);
    curLen += glen;
  });
  flush();
  if (!pages.length) pages.push([]);
  return pages;
}
function csmW1BuildPagesSimple(rows, pageSize) {
  if (!rows.length) return [[]];
  if (!pageSize || pageSize <= 0) return [rows.slice()];
  var pages = [];
  for (var i = 0; i < rows.length; i += pageSize) {
    pages.push(rows.slice(i, i + pageSize));
  }
  return pages;
}
function csmW1PagerSyncSelect(kind) {
  var sel = gid('w1-pager-' + kind + '-size');
  if (!sel) return;
  var v = csmW1PagerState[kind].size;
  var want = (!v || v <= 0) ? '0' : String(v);
  var ok = false;
  for (var i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === want) { ok = true; break; }
  }
  sel.value = ok ? want : '20';
}
function csmW1UpdatePagerBar(kind, totalRows, rowStart, rowEnd, page, totalPages) {
  var bar = gid('w1-pager-' + kind);
  var info = gid('w1-pager-' + kind + '-info');
  var prev = gid('w1-pager-' + kind + '-prev');
  var next = gid('w1-pager-' + kind + '-next');
  if (bar) bar.style.display = totalRows === 0 ? 'none' : 'flex';
  if (info) {
    info.textContent = totalRows === 0 ? '' : ('Rows ' + rowStart + '–' + rowEnd + ' of ' + totalRows + ' · Page ' + page + ' / ' + totalPages
      + ' · 第 ' + page + ' / ' + totalPages + ' 页 · 行 ' + rowStart + '–' + rowEnd + ' / 共 ' + totalRows + ' 行');
  }
  if (prev) prev.disabled = page <= 1;
  if (next) next.disabled = page >= totalPages;
  csmW1PagerSyncSelect(kind);
}
function csmW1SetPageSize(kind, v) {
  var n = parseInt(v, 10);
  if (isNaN(n)) n = 20;
  csmW1PagerState[kind].size = n;
  csmW1PagerState[kind].page = 1;
  csmW1PagerSave();
  if (kind === 'records') renderRecords();
  else if (kind === 'purchase') renderPurchase();
  else if (kind === 'checkout') renderCheckout();
}
function csmW1PagePrev(kind) {
  if (csmW1PagerState[kind].page > 1) {
    csmW1PagerState[kind].page--;
    csmW1PagerSave();
    if (kind === 'records') renderRecords();
    else if (kind === 'purchase') renderPurchase();
    else if (kind === 'checkout') renderCheckout();
  }
}
function csmW1PageNext(kind) {
  csmW1PagerState[kind].page++;
  csmW1PagerSave();
  if (kind === 'records') renderRecords();
  else if (kind === 'purchase') renderPurchase();
  else if (kind === 'checkout') renderCheckout();
}
csmW1PagerLoad();
// ============================================================
// CHECK IN
// ============================================================
function checkIn() {  console.log('checkIn called, isCheckingIn:', isCheckingIn);  if (isCheckingIn) {    console.log('Already checking in, ignoring');    return;  }  isCheckingIn = true;  var cn = (gid('f-cn').value || '').trim().toUpperCase();  var supplier = (gid('f-supplier').value || '').trim();  var product = (gid('f-product').value || '').trim();  if (getW1ProductsNormalized().length === 0) { isCheckingIn = false; toast('请先在「设置 → 品名管理」中添加品名', 'err'); return; }  var pallets = parseInt(gid('f-pallets').value) || 1;  var items = parseInt(gid('f-items').value) || 1;  var at = gid('f-at').value;  console.log('checkIn values:', {cn: cn, supplier: supplier, product: product, pallets: pallets, items: items, at: at});  if (!cn || cn.length < 2) { isCheckingIn = false; toast('请输入有效的集装箱号码 (至少2个字符)', 'err'); console.log('validation failed: cn, length:', cn ? cn.length : 0); return; }  if (!product) { isCheckingIn = false; toast('请选择品名', 'err'); console.log('validation failed: product'); return; }  product = canonicalProductName(product);  if (!at) { isCheckingIn = false; toast('请输入入库日期', 'err'); console.log('validation failed: at'); return; }  console.log('validation passed, checking exists...');  
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
function checkOut() {  console.log('checkOut called');  var cn = (gid('f-cno').value || '').trim().toUpperCase();  var palletsOutRaw = parseInt(gid('f-pallets-out').value, 10);  var itemsOutRaw = parseInt(gid('f-items-out').value, 10);  var pallets_out = isNaN(palletsOutRaw) ? 0 : Math.max(0, palletsOutRaw);  var items_out = isNaN(itemsOutRaw) ? 0 : Math.max(0, itemsOutRaw);  var dt = gid('f-dt').value;  console.log('checkOut values:', {cn: cn, pallets_out: pallets_out, items_out: items_out, dt: dt});  if (!cn || cn.length < 2) { toast('请输入集装箱号码', 'err'); console.log('validation failed: cn'); return; }  if (!dt) { toast('请输入出库日期', 'err'); console.log('validation failed: dt'); return; }  if (pallets_out === 0 && items_out === 0) { toast('出库托盘数和件数不能同时为0', 'err'); return; }  
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
var inRecs = recs.filter(function(r) { return r.store === currentColdStore && !r.type; })    .sort(function(a, b) { return new Date(b.arr) - new Date(a.arr); });  var tb = gid('tb-all');  var es = gid('es-all');  if (!tb || !es) return;  if (inRecs.length === 0) {    tb.innerHTML = ''; es.style.display = 'block'; csmW1UpdatePagerBar('records', 0, 0, 0, 1, 1); csmW1PagerSave(); return;  }  es.style.display = 'none';  var html = inRecs.map(function(r) {    var remaining_pallets = r.pallets - (r.pallets_out || 0);    var remaining_items = r.items - (r.items_out || 0);    
// 计算已产生的实际费用（从出库记录表）    
var actualFee = calcActualFee(r);    
// 判断是否已全部出库    
var isFullyCheckedOut = remaining_pallets === 0 && r.dep;    var status = r.dep ? '<span class="bdg bdg-d">Checked Out</span>' : '<span class="bdg bdg-a">In Stock</span>';    
// 管理员才显示修改按钮    
var editBtn = (isAdmin || isStaff) ? '<button class="abtn" onclick="showEditRecord(\'' + r.id + '\')" style="margin-left:4px">✏️</button>' : '';    
// 费用显示逻辑：    
// 1. 在库（未出库或部分出库）：黄色背景显示预估费用    
// 2. 已全部出库：显示实际冷库费总和（关联出库记录）    
var feeDisplay;    if (isFullyCheckedOut && actualFee > 0) {      
// 已全部出库，显示实际费用总和，蓝色加大加粗
feeDisplay = '<strong style="color:#0066cc;font-size:17px">' + actualFee.toFixed(2) + ' AED</strong>';    } 
else if (actualFee > 0) {      
// 部分出库，显示已产生的费用，黄色背景
feeDisplay = '<strong style="color:#ff9900;background:#fff8e1;padding:2px 6px;border-radius:3px">' + actualFee.toFixed(2) + ' AED</strong>';    } 
else {      
// 刚入库未出库，显示 "-"
feeDisplay = '<span style="color:#999">-</span>';    }    
return '<tr style="background:#fff">' +      '<td><strong>' + (r.seq || '-') + '</strong></td>' +      '<td><strong>' + r.cn + '</strong></td>' +      '<td style="font-family:Arial">' + fmtSupplierName(r.supplier) + '</td><td style="font-family:Arial;text-transform:capitalize">' + w1ProductHtml(r.product) + '</td>' +      '<td>' + getStoreDisplayName(r.store) + '</td>' +      '<td>' + r.pallets + ' / <span style="color:#ff9900">' + remaining_pallets + '</span></td>' +      '<td>' + r.items + ' / <span style="color:#ff9900">' + remaining_items + '</span></td>' +      '<td>' + fdt(r.arr) + '</td><td>' + fdt(r.dep) + '</td>' +      '<td>' + feeDisplay + '</td>' +      '<td>' + status + '</td>' +      '<td><button class="abtn" onclick="showDet(\'' + r.id + '\')">详情</button>' + editBtn + '</td></tr>';  });
  var stRec = csmW1PagerState.records;
  var pagesR = csmW1BuildPagesSimple(html, stRec.size);
  var totalPagesR = Math.max(1, pagesR.length);
  var pageR = Math.min(Math.max(1, stRec.page), totalPagesR);
  stRec.page = pageR;
  var sliceR = pagesR[pageR - 1] || [];
  tb.innerHTML = sliceR.join('');
  var totalRowsR = html.length;
  var rowStartR = totalRowsR === 0 ? 0 : (function() { var s = 0; for (var pi = 0; pi < pageR - 1; pi++) s += (pagesR[pi] || []).length; return s + 1; })();
  var rowEndR = totalRowsR === 0 ? 0 : rowStartR + sliceR.length - 1;
  csmW1UpdatePagerBar('records', totalRowsR, rowStartR, rowEndR, pageR, totalPagesR);
  csmW1PagerSave();
}
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
/** Unified container detail HTML (W1 + supplier): English, Arial bold, title-case labels. */
function htmlContainerDetailUnified(d) {
  d = d || {};
  var ARI = 'font-family:var(--csm-font-en);font-weight:700';
  var Ls = ARI + ';font-size:14px;text-transform:none;color:#333;width:34%;vertical-align:top;padding:8px 10px;border-bottom:1px solid #eee';
  var Vs = ARI + ';font-size:15px;padding:8px 10px;border-bottom:1px solid #eee;color:#111;line-height:1.4';
  function row(label, valueHtml) {
    return '<tr><td style="' + Ls + '">' + csmEscapeHtml(label) + '</td><td style="' + Vs + '">' + valueHtml + '</td></tr>';
  }
  var html = '<div class="csm-cn-detail-unified" style="text-align:left;line-height:1.45">';
  html += '<table style="width:100%;border-collapse:collapse">';
  html += row('Container No.', '<span style="color:#00bfff;font-size:17px">' + csmEscapeHtml(String(d.cn || '—')) + '</span>');
  html += row('Record Status', d.statusHtml || '<span style="color:#999">—</span>');
  html += row('Supplier', csmEscapeHtml(String(d.supplier || '—')));
  html += row('Purchase Date', csmEscapeHtml(String(d.purchaseDateLine || '—')));
  html += row('Total Qty', csmEscapeHtml(String(d.totalQty != null ? d.totalQty : '—')));
  html += row('Line Items', csmEscapeHtml(String(d.lineCount != null ? d.lineCount : '—')));
  var wp = d.wp || {};
  html += row('Net Weight (Mt)', wp.netWeightMt === '' || wp.netWeightMt == null ? '<span style="color:#999">—</span>' : csmEscapeHtml(String(wp.netWeightMt)) + ' MT');
  html += row('Gross Weight (Mt)', wp.grossWeightMt === '' || wp.grossWeightMt == null ? '<span style="color:#999">—</span>' : csmEscapeHtml(String(wp.grossWeightMt)) + ' MT');
  var up = (wp.tradeTerm ? csmEscapeHtml(wp.tradeTerm) + ' · ' : '') + (wp.unitPriceUsdMt === '' || wp.unitPriceUsdMt == null ? '<span style="color:#999">—</span>' : csmEscapeHtml(String(wp.unitPriceUsdMt)) + ' USD/MT');
  html += row('Unit Price', up);
  html += row('Total (USD)', wp.totalAmountUsd === '' || wp.totalAmountUsd == null ? '<span style="color:#999">—</span>' : csmEscapeHtml(String(wp.totalAmountUsd)) + ' USD');
  html += row('Total (AED)', wp.totalAmountAed === '' || wp.totalAmountAed == null ? '<span style="color:#999">—</span>' : csmEscapeHtml(String(wp.totalAmountAed)) + ' AED');
  html += row('Remarks', d.remarksHtml || '<span style="color:#999">—</span>');
  html += row('Ship Name', csmEscapeHtml(String(d.shipname || '—')));
  html += row('Shipping Company', csmEscapeHtml(String(d.shipCompany || '—')));
  html += row('POL (Port of Loading)', csmEscapeHtml(String(d.pol || '—')));
  html += row('POD (Port of Discharge)', csmEscapeHtml(String(d.pod || '—')));
  html += row('B/L No.', csmEscapeHtml(String(d.bl || '—')));
  html += row('Invoice Number', csmEscapeHtml(String(d.invoiceNumber || '—')));
  html += row('ETD', csmEscapeHtml(String(d.etd || '—')));
  html += row('ETA', csmEscapeHtml(String(d.eta || '—')));
  html += '</table>';
  html += '<div style="margin-top:14px;font-size:15px;' + ARI + ';text-transform:none;margin-bottom:8px;color:#0d47a1">Product Items</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:14px;' + ARI + '"><thead><tr style="background:#f5f5f5">';
  html += '<th style="padding:8px;border:1px solid #ddd;text-align:left;text-transform:none">Product</th>';
  html += '<th style="padding:8px;border:1px solid #ddd;text-align:center;width:80px;text-transform:none">Qty</th>';
  html += '<th style="padding:8px;border:1px solid #ddd;text-transform:none">Purchase Date</th></tr></thead><tbody>';
  (d.productRows || []).forEach(function(pr) {
    html += '<tr><td style="padding:8px;border:1px solid #ddd;text-transform:capitalize">' + w1ProductHtml(pr.product) + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;text-align:center">' + (pr.qty || 0) + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd">' + csmEscapeHtml(pr.dateStr || '—') + '</td></tr>';
  });
  if (!(d.productRows || []).length) {
    html += '<tr><td colspan="3" style="padding:10px;border:1px solid #ddd;color:#888">—</td></tr>';
  }
  html += '</tbody></table>';
  if (d.feeSection) {
    if (d.feeSection.type === 'table' && d.feeSection.rows && d.feeSection.rows.length) {
      html += '<div style="margin-top:14px;padding:12px;background:#e8f5e9;border-radius:6px;border:1px solid #4caf50">';
      html += '<div style="' + ARI + ';font-size:15px;color:#1b5e20;text-transform:none;margin-bottom:8px">' + csmEscapeHtml(d.feeSection.title || 'W1 Fee Lines') + '</div>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:14px;' + ARI + '"><thead><tr style="background:#e8f5e9">';
      html += '<th style="padding:8px;border:1px solid #c8e6c9;text-transform:none">Product</th>';
      html += '<th style="padding:8px;border:1px solid #c8e6c9;text-align:center;width:72px;text-transform:none">Qty</th>';
      html += '<th style="padding:8px;border:1px solid #c8e6c9;text-transform:none">Fees (AED)</th></tr></thead><tbody>';
      d.feeSection.rows.forEach(function(r) {
        html += '<tr><td style="padding:8px;border:1px solid #c8e6c9;text-transform:capitalize">' + w1ProductHtml(r.product) + '</td>' +
          '<td style="padding:8px;border:1px solid #c8e6c9;text-align:center">' + (r.qty || 0) + '</td>' +
          '<td style="padding:8px;border:1px solid #c8e6c9;text-align:center">' + (typeof r.fees === 'number' ? r.fees.toFixed(2) : csmEscapeHtml(String(r.fees || ''))) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    } else if (d.feeSection.type === 'notice' && d.feeSection.html) {
      html += d.feeSection.html;
    }
  }
  var br = d.coldBreakdown || { rows: [], totalFee: 0, allCheckedOut: false };
  html += '<div style="margin-top:14px;font-size:15px;' + ARI + ';text-transform:none;margin-bottom:8px;color:#01579b">Cold Storage</div>';
  if (br.rows && br.rows.length) {
    html += '<div style="' + ARI + ';font-size:13px;margin-bottom:6px;color:#444">Rows: ' + br.rows.length + ' · Status: ' + (br.allCheckedOut ? '<span style="color:#2e7d32">All Checked Out</span>' : '<span style="color:#ff9900">Not All Checked Out</span>') +
      ' · Total Fee (AED): <span style="color:#0066cc">' + (br.allCheckedOut ? br.totalFee.toFixed(2) : '—') + '</span></div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;' + ARI + '"><thead><tr style="background:#e3f2fd">';
    html += '<th style="padding:6px;border:1px solid #90caf9;text-transform:none">Store</th>';
    html += '<th style="padding:6px;border:1px solid #90caf9;text-transform:none">Product</th>';
    html += '<th style="padding:6px;border:1px solid #90caf9;text-transform:none">Pallets In/Rem</th>';
    html += '<th style="padding:6px;border:1px solid #90caf9;text-transform:none">Items In/Rem</th>';
    html += '<th style="padding:6px;border:1px solid #90caf9;text-transform:none">Check-in</th>';
    html += '<th style="padding:6px;border:1px solid #90caf9;text-transform:none">Check-out</th>';
    html += '<th style="padding:6px;border:1px solid #90caf9;text-transform:none">Status</th>';
    html += '<th style="padding:6px;border:1px solid #90caf9;text-transform:none">Fee (AED)</th></tr></thead><tbody>';
    br.rows.forEach(function(row) {
      html += '<tr>' +
        '<td style="padding:6px;border:1px solid #90caf9;text-align:center">' + getStoreDisplayName(row.store) + '</td>' +
        '<td style="padding:6px;border:1px solid #90caf9;text-transform:capitalize">' + w1ProductHtml(row.product) + '</td>' +
        '<td style="padding:6px;border:1px solid #90caf9;text-align:center">' + row.pallets + '/' + Math.max(0, row.remainingPallets) + '</td>' +
        '<td style="padding:6px;border:1px solid #90caf9;text-align:center">' + row.items + '/' + Math.max(0, row.remainingItems) + '</td>' +
        '<td style="padding:6px;border:1px solid #90caf9">' + fdt(row.arr) + '</td>' +
        '<td style="padding:6px;border:1px solid #90caf9">' + fdt(row.dep) + '</td>' +
        '<td style="padding:6px;border:1px solid #90caf9;text-align:center">' + (row.checkedOut ? '<span style="color:#2e7d32">Out</span>' : '<span style="color:#ff9900">In</span>') + '</td>' +
        '<td style="padding:6px;border:1px solid #90caf9;text-align:right;color:' + (row.checkedOut ? '#0066cc' : '#ff9900') + '">' + (row.actualFee > 0 ? row.actualFee.toFixed(2) : '—') + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<div style="margin-top:6px;font-size:12px;color:#666">Total Cold Fee On Purchase List Appears Only After Every Row Is Fully Checked Out.</div>';
  } else {
    html += '<p style="' + ARI + ';font-size:14px;color:#666;margin:8px 0">No Inbound Cold-storage Rows For This Container.</p>';
  }
  html += '</div>';
  return html;
}
function csmSupplierRecordStatusBadgeEn(status) {
  var s = ({
    'draft': '<span style="background:#e3f2fd;color:#1565c0;padding:4px 10px;border-radius:8px;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif">Draft</span>',
    'submitted': '<span style="background:#fff8e1;color:#f57f17;padding:4px 10px;border-radius:8px;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif">Submitted</span>',
    'confirmed': '<span style="background:#e8f5e9;color:#2e7d32;padding:4px 10px;border-radius:8px;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif">Confirmed</span>'
  })[String(status || '').toLowerCase()];
  return s || '<span style="background:#eceff1;color:#455a64;padding:4px 10px;border-radius:8px;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif">Other</span>';
}
function showPurchaseCnDetail(cn) {
  setModalTitle('Container Details');
  var purchaseItems = purchaseRecs.filter(function(r) {
    return r.cn === cn;
  }).sort(function(a, b) {
    var byDt = csmPurchaseRowCompareDesc(a, b);
    if (byDt !== 0) return byDt;
    return String(a.product || '').localeCompare(String(b.product || ''));
  });
  var breakdown = getContainerColdFeeBreakdown(cn);
  var mcon = gid('mcon');
  if (!mcon) return;
  if (!purchaseItems.length && !breakdown.rows.length) {
    mcon.innerHTML = '<div style="text-align:center;padding:14px;color:#666;font-size:15px;font-family:Arial,Helvetica,sans-serif;font-weight:700">No Purchase Or Cold-storage Data For This Container.</div>';
    gid('modal').classList.add('sh');
    return;
  }
  var base = purchaseItems[0] || {};
  var totalQty = purchaseItems.reduce(function(sum, item) {
    return sum + (parseFloat(item.qty) || 0);
  }, 0);
  var cnRemarkParts = [];
  purchaseItems.forEach(function(it) {
    var t = String(it.remarks || '').trim();
    if (t && cnRemarkParts.indexOf(t) === -1) cnRemarkParts.push(t);
  });
  var remarksHtml = cnRemarkParts.length ? '<span style="white-space:pre-wrap">' + csmEscapeHtml(cnRemarkParts.join('\n')) + '</span>' : '';
  var invParts = [];
  purchaseItems.forEach(function(it) {
    var inv = String(it.invoiceNumber || '').trim();
    if (inv && invParts.indexOf(inv) === -1) invParts.push(inv);
  });
  var invoiceDisplay = invParts.length ? invParts.join(' · ') : '';
  var wpCn = supplierRecWeightPriceForPurchase(base);
  var pDate = (base.purchaseDate || '') + (base.purchaseTime ? ' ' + String(base.purchaseTime) : '');
  var productRows = purchaseItems.map(function(item) {
    var ds = (item.purchaseDate ? fdt(item.purchaseDate + 'T00:00:00') : '—') + (item.purchaseTime ? ' ' + String(item.purchaseTime) : '');
    return { product: item.product, qty: item.qty, dateStr: ds };
  });
  var feeRows = purchaseItems.map(function(item) {
    var total = (item.demurrage || 0) + (item.customs || 0) + (item.coldFee || item.coldfee || 0) + (item.attestation || 0) + (item.repack || 0) + (item.waste || 0) + (item.other || 0);
    return { product: item.product, qty: item.qty, fees: total };
  });
  var statusHtml = '<span style="background:#e8f4ff;color:#0066cc;padding:4px 10px;border-radius:8px;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif">Warehouse1 Purchase</span>';
  gid('mcon').innerHTML = htmlContainerDetailUnified({
    cn: cn,
    supplier: base.supplier || '',
    statusHtml: statusHtml,
    purchaseDateLine: pDate.trim() || '—',
    totalQty: totalQty,
    lineCount: purchaseItems.length,
    wp: wpCn,
    remarksHtml: remarksHtml,
    shipname: base.shipname,
    shipCompany: base.shipCompany,
    pol: base.pol,
    pod: base.pod,
    bl: base.bl,
    invoiceNumber: invoiceDisplay,
    etd: base.etd,
    eta: base.eta,
    productRows: productRows,
    feeSection: feeRows.length ? { type: 'table', title: 'W1 Purchase Fees (Aed)', rows: feeRows } : null,
    coldBreakdown: breakdown
  });
  gid('modal').classList.add('sh');
}
function calcFee(r) {  if (!r.arr) return 0;  var start = new Date(r.arr);  var end = r.dep ? new Date(r.dep) : new Date();  var days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;  if (days <= 0) return 0;  var weeks = Math.ceil(days / 7);  var totalPallets = r.pallets - (r.pallets_out || 0);  var rate = getRateByStore(r.store);  return weeks * totalPallets * rate * (1 + VAT_RATE);}function updStats() {  
// 只统计入库记录（排除出库记录类型）  
var inRecsAll = recs.filter(function(r) { return !r.type; });  var inRecs = inRecsAll.filter(function(r) { return r.store === currentColdStore && !r.dep; });  
// 顶部统计显示当前冷库的在库数据（W1 顶栏 + 公司财务首行）  
var w1Total = inRecs.length;  var w1Pallets = inRecs.reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);  var w1Items = inRecs.reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);  var st;  st = gid('s-total'); if (st) st.textContent = w1Total;  st = gid('portal-s-total'); if (st) st.textContent = w1Total;  st = gid('s-pallets'); if (st) st.textContent = w1Pallets;  st = gid('portal-s-pallets'); if (st) st.textContent = w1Pallets;  st = gid('s-items'); if (st) st.textContent = w1Items;  st = gid('portal-s-items'); if (st) st.textContent = w1Items;  
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
if (allInRecs.length === 0) {    tb.innerHTML = '';    es.style.display = 'block';    csmW1UpdatePagerBar('checkout', 0, 0, 0, 1, 1);    csmW1PagerSave();    return;  }  es.style.display = 'none';  var html = [];  
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
weekTotalDisplay = '<strong style="color:#0066cc;font-size:17px">' + totalFee.toFixed(2) + '</strong>';      } 
else if (weekTotal > 0) {        
// 其他周显示本周合计
weekTotalDisplay = '<strong style="color:#0066cc">' + weekTotal.toFixed(2) + '</strong>';      } 
else {        weekTotalDisplay = '-';      }      html.push('<tr style="' + rowBg + '">' +        '<td style="font-size:14px;color:#0066cc">' + (inRec.seq || '-') + '</td>' +        '<td><strong style="cursor:pointer;color:#0066cc;text-decoration:underline" onclick="showCheckoutDetail(\'' + cn + '\')">' + cn + '</strong></td>' +        '<td style="font-family:Arial">' + fmtSupplierName(inRec.supplier) + '</td>' +        '<td style="font-family:Arial;text-transform:capitalize">' + w1ProductHtml(inRec.product) + '</td>' +        '<td style="font-weight:bold;color:#0066cc">' + weekLabel + '</td>' +        '<td><strong>' + displayPallets + '</strong></td>' +        '<td><span style="color:#cc0000">' + displayOutPallets + '</span></td>' +        '<td><span style="color:#cc0000">' + displayOutItems + '</span></td>' +        '<td><strong style="color:#00aa00">' + displayRemItems + '</strong></td>' +        '<td>' + displayInItems + '</td>' +        '<td>' + (prevPallets > 0 ? rate.toFixed(2) : '-') + '</td>' +        '<td>' + (prevPallets > 0 ? amount.toFixed(2) : '-') + '</td>' +        '<td>' + (prevPallets > 0 ? vat.toFixed(2) : '-') + '</td>' +        '<td>' + weekTotalDisplay + '</td>' +        '</tr>');      
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
var editOutBtn = (isAdmin || isStaff) ? '<button class="abtn" onclick="showEditOutRecord(\'' + or.id + '\')" style="margin-left:4px">✏️</button>' : '';        html.push('<tr style="background:#f0fff0">' +          '<td style="padding-left:16px;color:#0066cc;font-size:14px">' + (or.seq || '-') + '</td>' +          '<td style="padding-left:16px;color:#999">' + cn + '</td>' +          '<td style="color:#999;font-family:Arial">' + fmtSupplierName(or.supplier) + '</td>' +          '<td style="color:#999;font-family:Arial;text-transform:capitalize">' + w1ProductHtml(or.product) + '</td>' +          '<td style="color:#00aa00;font-weight:bold">' + fdt(or.dep) + '</td>' +          '<td>-</td>' +          '<td><span style="color:#cc0000;font-weight:bold">' + or.pallets_out + '</span> / <strong style="color:#00aa00">' + (outRemPallets >= 0 ? outRemPallets : '0') + '</strong></td>' +          '<td><span style="color:#cc0000;font-weight:bold">' + or.items_out + '</span></td>' +          '<td><strong style="color:#00aa00">' + (outRemItems >= 0 ? outRemItems : '0') + '</strong></td>' +          '<td>-</td>' +          '<td>-</td>' +          '<td>-</td>' +          '<td>-</td>' +          '<td>' + editOutBtn + '</td>' +          '</tr>');      });      currentDate = new Date(weekEnd);      currentDate.setDate(currentDate.getDate() + 1);      weekNum++;    }  });
  var stCo = csmW1PagerState.checkout;
  var pagesCo = csmW1BuildPagesSimple(html, stCo.size);
  var totalPagesCo = Math.max(1, pagesCo.length);
  var pageCo = Math.min(Math.max(1, stCo.page), totalPagesCo);
  stCo.page = pageCo;
  var sliceCo = pagesCo[pageCo - 1] || [];
  tb.innerHTML = sliceCo.join('');
  var totalRowsCo = html.length;
  var rowStartCo = totalRowsCo === 0 ? 0 : (function() { var s = 0; for (var pi = 0; pi < pageCo - 1; pi++) s += (pagesCo[pi] || []).length; return s + 1; })();
  var rowEndCo = totalRowsCo === 0 ? 0 : rowStartCo + sliceCo.length - 1;
  csmW1UpdatePagerBar('checkout', totalRowsCo, rowStartCo, rowEndCo, pageCo, totalPagesCo);
  csmW1PagerSave();
}
// ============================================================
// 搜索和导出功能
// ============================================================
var checkoutSearchFilters = {  cn: '',  supplier: '',  product: '',  dateStart: '',  dateEnd: ''};function applySearch() {  csmW1PagerState.checkout.page = 1;  checkoutSearchFilters = {    cn: (gid('search-cn').value || '').trim().toLowerCase(),    supplier: (gid('search-supplier').value || '').trim().toLowerCase(),    product: (gid('search-product').value || '').trim().toLowerCase(),    dateStart: gid('search-date-start').value || '',    dateEnd: gid('search-date-end').value || ''  };  renderCheckout();  toast('Confirmed', 'ok');}function resetSearch() {  gid('search-cn').value = '';  gid('search-supplier').value = '';  gid('search-product').value = '';  gid('search-date-start').value = '';  gid('search-date-end').value = '';  checkoutSearchFilters = {    cn: '',    supplier: '',    product: '',    dateStart: '',    dateEnd: ''  };  csmW1PagerState.checkout.page = 1;  renderCheckout();  toast('Filters reset', 'ok');}function matchSearchFilters(inRec) {  var f = checkoutSearchFilters;  
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
data.push(['Seq No', 'Container', 'Supplier', 'Product', 'Week / Date', 'Pallets', 'Out Pallets', 'Out Items', 'Rem. Items', 'In Items', 'Unit Price', 'Amount', '5% VAT', 'Total']);  
// 按集装箱号排序  
Object.keys(cnGroups).sort().forEach(function(cn) {    var group = cnGroups[cn];    var inRec = group.inRec;    var outRecs = (group.recs || []).sort(function(a, b) { return new Date(a.dep) - new Date(b.dep); });    if (!inRec) return;    
// 应用搜索筛选    
if (!matchSearchFilters(inRec)) return;    var startDate = new Date(inRec.arr);    var endDate = outRecs.length > 0 ? new Date(outRecs[outRecs.length - 1].dep) : new Date();    var totalFee = 0;    var currentDate = new Date(startDate);    var weekNum = 1;    var palletsAtWeekStart = inRec.pallets;    var itemsOutSoFar = 0;    var palletsOutSoFar = 0;    var firstLoop = true;    while (firstLoop || (currentDate <= endDate && outRecs.length > 0)) {      firstLoop = false;      var weekStart = new Date(currentDate);      var weekEnd = new Date(weekStart);      weekEnd.setDate(weekEnd.getDate() + 6);      var prevPallets = palletsAtWeekStart;      var rate = getRateByStore(inRec.store);      var amount = prevPallets > 0 ? (prevPallets * rate) : 0;      var vat = amount * VAT_RATE;      var weeklyTotal = amount + vat;      if (weeklyTotal > 0) totalFee += weeklyTotal;      var startStr = (weekStart.getMonth() + 1) + '/' + weekStart.getDate();      var endStr = (weekEnd.getMonth() + 1) + '/' + weekEnd.getDate();      var weekLabel = '第' + weekNum + '周 (' + startStr + '-' + endStr + ')';      var weekOutPallets = 0;      var weekOutItems = 0;      outRecs.forEach(function(or) {        var od = new Date(or.dep);        if (od >= weekStart && od <= weekEnd) {          weekOutPallets += or.pallets_out;          weekOutItems += or.items_out;        }      });      palletsAtWeekStart = Math.max(0, palletsAtWeekStart - weekOutPallets);      var isLastWeek = palletsAtWeekStart === 0;      var displayPallets = prevPallets > 0 ? prevPallets : 0;      var displayOutPallets = weekOutPallets > 0 ? weekOutPallets : 0;      var displayOutItems = weekOutItems > 0 ? weekOutItems : 0;      var displayInItems = weekNum === 1 ? inRec.items : 0;      var remainingItemsAtWeekStart = isLastWeek ? 0 : (inRec.items - itemsOutSoFar);      data.push([        inRec.seq || '-',        inRec.cn,        inRec.supplier || '-',        resolveProductDisplayName(inRec.product),        weekLabel,        displayPallets,        displayOutPallets,        displayOutItems,        remainingItemsAtWeekStart,        displayInItems,        prevPallets > 0 ? rate.toFixed(2) : '-',        prevPallets > 0 ? amount.toFixed(2) : '-',        prevPallets > 0 ? vat.toFixed(2) : '-',        totalFee.toFixed(2)      ]);      currentDate = new Date(weekEnd);      currentDate.setDate(currentDate.getDate() + 1);      weekNum++;    }  });  
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
function setModalTitle(text) {
  var el = gid('modal-title');
  if (el) el.textContent = text || 'Details';
}
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
    html += '<div class="mr"><span class="ml">品名</span><span class="mv">' + w1ProductHtml(r.product) + '</span></div>';
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
      html += '<tr style="background:#f5f5f5"><th style="padding:6px;border:1px solid #ddd;font-family:var(--csm-font-en);font-weight:700;text-transform:none">#</th>';
      html += '<th style="padding:6px;border:1px solid #ddd;font-family:var(--csm-font-en);font-weight:700;text-transform:none">出库日期</th>';
      html += '<th style="padding:6px;border:1px solid #ddd;font-family:var(--csm-font-en);font-weight:700;text-transform:none">托盘</th>';
      html += '<th style="padding:6px;border:1px solid #ddd;font-family:var(--csm-font-en);font-weight:700;text-transform:none">件数</th></tr>';
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
  setModalTitle('Inbound record');
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
  setModalTitle('Stock overview');
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
  setModalTitle('Checkout detail');
  gid('modal').classList.add('sh');
}
// ============================================================
// 编辑入库记录（管理员权限）
// ============================================================
function showEditRecord(id) {
  if (!isAdmin && !isStaff) {
    toast('需要管理员或大丰收员工权限', 'err');
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
  if (!canManageAccounts()) {
    toast('需要管理员权限', 'err');
    return;
  }
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
  if (!canManageAccounts()) {
    toast('需要管理员权限', 'err');
    return;
  }
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
  if (!isAdmin && !isStaff) {
    toast('需要管理员或大丰收员工权限', 'err');
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
  if (newPalletsOut === 0 && newItemsOut === 0) {
    toast('出库托盘数和件数不能同时为0', 'err');
    return;
  }
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
function selectColdStore(n) {  currentColdStore = n;  csmW1PagerState.records.page = 1;  csmW1PagerState.checkout.page = 1;  document.querySelectorAll('.warehouse-btn').forEach(function(btn, i) {    btn.classList.toggle('active', i + 1 === n);  });  renderAll();}
// ============================================================
// TAB SWITCH
// ============================================================
function swTab(tab) {  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('ac'); });  document.querySelectorAll('.tc').forEach(function(t) { t.classList.remove('ac'); });  var tabNames = ['purchase', 'records', 'checkout', 'stats', 'sales', 'sales_finance'];  var idx = tabNames.indexOf(tab);  if (idx < 0) idx = 0;  var tabs = document.querySelectorAll('.tab');  if (tabs[idx]) tabs[idx].classList.add('ac');  var panel = document.getElementById('tc-' + tab);  if (panel) panel.classList.add('ac');  if (tab === 'sales') { try { refreshSalesUi(); swSalesSub(salesSubView || 'dash'); } catch (eS) {} }  if (tab === 'sales_finance') { try { renderFinCnReconTable(); } catch (eR) {} }}
// ============================================================
// PURCHASE RECORDS
// ============================================================
var PURCHASE_KEY = 'csm_purchase_v1';var purchaseRecs = [];
// 供应商采购记录
var SUPPLIER_RECS_KEY = 'csm_supplier_recs_v1';var supplierRecs = [];var supplierRef = null;function loadPurchase() {  try {    var stored = localStorage.getItem(PURCHASE_KEY);    purchaseRecs = stored ? JSON.parse(stored) : [];  } catch(e) { purchaseRecs = []; }}function savePurchase() {}
// Firebase 自动同步
function savePurchaseItem(item) {  if (purchaseRef && item.id) {    purchaseRef.child(item.id).set(item);  }}
function openPurchaseForm() {
  var checkInBtn = gid('checkInBtn');
  if (checkInBtn) {
    checkInBtn.classList.remove('btn-g');
    checkInBtn.classList.add('btn-s');
    checkInBtn.innerHTML = '✓ 入库 Check In';
    checkInBtn.disabled = false;
  }
  function doOpenPurchase() {
    try { loadSettings(); } catch (eLs) {}
    refreshFpSupplierSelect('');
    refreshShipCompanyDropdown('fp-shipcompany', '');
    refreshAllPolPodDropdowns('', '');
    resetW1PurchaseFormFields(true);
    var dateField = gid('fp-date');
    if (dateField) dateField.value = nowFmt();
    var ft = gid('fp-time');
    if (ft) {
      var now = new Date();
      ft.value = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    }
    var cnField = gid('fp-cn');
    if (cnField) cnField.value = '';
    purchaseItemRowCounter = 0;
    var itemsBody = gid('purchaseItemsBody');
    if (itemsBody) itemsBody.innerHTML = htmlPurchaseItemsBodySingleRow();
    try { syncAllProductSelects(); } catch (eSync) {}
    gid('purchaseModal').classList.add('sh');
  }
  if (typeof pullUnifiedSettingsOnce === 'function') {
    pullUnifiedSettingsOnce().then(doOpenPurchase, function(err) { console.error('csm pull settings (open purchase)', err); doOpenPurchase(); });
  } else {
    doOpenPurchase();
  }
}
function clPurchaseModal() {
  purchaseItemRowCounter = 0;
  resetW1PurchaseFormFields(true);
  refreshFpSupplierSelect('');
  refreshShipCompanyDropdown('fp-shipcompany', '');
  refreshAllPolPodDropdowns('', '');
  var itemsBody = gid('purchaseItemsBody');
  if (itemsBody) itemsBody.innerHTML = htmlPurchaseItemsBodySingleRow();
  gid('purchaseModal').classList.remove('sh');
}
function addPurchase() {
  console.log('addPurchase called');
  var cn = (gid('fp-cn').value || '').trim().toUpperCase();
  var supEl = gid('fp-supplier');
  var supplier = supEl ? String(supEl.value || '').trim() : '';
  var purchaseDate = gid('fp-date') ? gid('fp-date').value : '';
  if (!cn) { toast('请输入集装箱号 / Enter container no.', 'err'); return; }
  if (!supplier) { toast('请选择供应商 / Select supplier', 'err'); return; }
  if (!purchaseDate) { toast('请选择采购日期 / Select purchase date', 'err'); return; }
  var shipname = gid('fp-shipname') ? String(gid('fp-shipname').value || '').trim() : '';
  var shipCompany = gid('fp-shipcompany') ? String(gid('fp-shipcompany').value || '').trim() : '';
  if (!shipname) { toast('请输入船名 / Ship name is required', 'err'); return; }
  if (!shipCompany) { toast('请选择船公司 / Select shipping company', 'err'); return; }
  if ((settData.shipCompanies || []).indexOf(shipCompany) === -1) {
    toast('船公司必须从设置列表中选择', 'err');
    return;
  }
  var polW1 = gid('fp-pol') ? String(gid('fp-pol').value || '').trim() : '';
  var podW1 = gid('fp-pod') ? String(gid('fp-pod').value || '').trim() : '';
  var polListW1 = coerceSettingsStringList(settData.pol);
  var podListW1 = coerceSettingsStringList(settData.pod);
  if (!polListW1.length || !podListW1.length) {
    toast('请先在「设置」中维护 POL 起运港与 POD 目的港列表', 'err');
    return;
  }
  if (!polW1 || polListW1.indexOf(polW1) === -1) {
    toast('请选择有效的 POL 起运港（须来自设置列表）', 'err');
    return;
  }
  if (!podW1 || podListW1.indexOf(podW1) === -1) {
    toast('请选择有效的 POD 目的港（须来自设置列表）', 'err');
    return;
  }
  if (getW1ProductsNormalized().length === 0) { toast('请先在「设置 → 品名管理」中添加品名', 'err'); return; }
  var ptRaw = gid('fp-time') ? String(gid('fp-time').value || '').trim() : '';
  var purchaseTimeNorm = ptRaw ? csmPurchaseNormalizeTimePart(ptRaw) : '';
  var bl = gid('fp-bl') ? String(gid('fp-bl').value || '').trim().toUpperCase() : '';
  var invoiceNumber = gid('fp-invoice') ? String(gid('fp-invoice').value || '').trim() : '';
  var etd = gid('fp-etd') ? gid('fp-etd').value : '';
  var eta = gid('fp-eta') ? gid('fp-eta').value : '';
  var remarks = gid('fp-remark') ? String(gid('fp-remark').value || '').trim() : '';
  var formSnap = {
    netWeightMt: gid('fp-net-mt') ? gid('fp-net-mt').value : '',
    grossWeightMt: gid('fp-gross-mt') ? gid('fp-gross-mt').value : '',
    tradeTerm: gid('fp-trade-term') ? gid('fp-trade-term').value : '',
    unitPriceUsdMt: gid('fp-unit-price-usd') ? gid('fp-unit-price-usd').value : '',
    totalAmountUsd: gid('fp-total-usd') ? gid('fp-total-usd').value : ''
  };
  var wpForm = supplierRecWeightPriceForPurchase(formSnap);
  var rows = document.querySelectorAll('.purchase-item-row');
  console.log('Found rows:', rows.length);
  var items = [];
  rows.forEach(function(row, idx) {
    var productInput = row.querySelector('.item-product');
    var product = canonicalProductName((productInput.value || '').trim());
    console.log('Row', idx, 'product:', product);
    if (!product) return;
    var item = {
      qty: parseFloat(row.querySelector('.item-qty').value) || 0,
      demurrage: 0,
      customs: 0,
      coldFee: 0,
      attestation: 0,
      repack: 0
    };
    var id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5) + idx;
    var rec = {
      id: id,
      cn: cn,
      supplier: supplier,
      product: product,
      purchaseDate: purchaseDate,
      purchaseTime: purchaseTimeNorm,
      qty: item.qty,
      demurrage: item.demurrage,
      customs: item.customs,
      coldFee: item.coldFee,
      attestation: item.attestation,
      repack: item.repack,
      waste: 0,
      other: 0,
      bl: bl,
      invoiceNumber: invoiceNumber,
      shipname: shipname,
      shipCompany: shipCompany,
      etd: etd,
      eta: eta,
      pol: polW1,
      pod: podW1,
      remarks: remarks,
      netWeightMt: wpForm.netWeightMt === '' ? '' : wpForm.netWeightMt,
      grossWeightMt: wpForm.grossWeightMt === '' ? '' : wpForm.grossWeightMt,
      tradeTerm: wpForm.tradeTerm,
      unitPriceUsdMt: wpForm.unitPriceUsdMt === '' ? '' : wpForm.unitPriceUsdMt,
      totalAmountUsd: wpForm.totalAmountUsd === '' ? '' : wpForm.totalAmountUsd,
      totalAmountAed: wpForm.totalAmountAed === '' ? '' : wpForm.totalAmountAed
    };
    items.push(rec);
    console.log('Added item:', rec.product);
  });
  console.log('Total items to add:', items.length);
  if (items.length === 0) {
    toast('请至少添加一个品名', 'err');
    return;
  }
  if (supplierCnExistsLocal(cn)) {
    toast('⚠️ 该集装箱号已在供应商界面录入 / Already entered', 'err');
    return;
  }
  function writeW1PurchaseAndSupplierRecord() {
    var supplierRecId = makeSupplierRecordId();
    var purchaseIds = items.map(function(rec) { return rec.id; });
    var dateForSeq = purchaseDate ? new Date(purchaseDate + 'T00:00:00') : null;
    generateSeq(function(seq) {
      resolveSupplierOwnerUidByName(supplier).then(function(ownerUid) {
        var nowIso = new Date().toISOString();
        var supplierItems = items.map(function(rec) {
          return { product: rec.product || '', qty: rec.qty || 0 };
        });
        var supplierRec = {
          id: supplierRecId,
          seq: seq,
          cn: cn,
          purchaseDate: purchaseDate,
          purchaseTime: purchaseTimeNorm,
          supplier: supplier,
          product: supplierItems.map(function(item) { return item.product; }).join(' / '),
          qty: supplierItems.reduce(function(sum, item) { return sum + (parseFloat(item.qty) || 0); }, 0),
          items: supplierItems,
          shipname: shipname,
          shipCompany: shipCompany,
          bl: bl,
          invoiceNumber: invoiceNumber,
          etd: etd,
          eta: eta,
          pol: polW1,
          pod: podW1,
          remarks: remarks,
          netWeightMt: wpForm.netWeightMt === '' ? '' : wpForm.netWeightMt,
          grossWeightMt: wpForm.grossWeightMt === '' ? '' : wpForm.grossWeightMt,
          tradeTerm: wpForm.tradeTerm,
          unitPriceUsdMt: wpForm.unitPriceUsdMt === '' ? '' : wpForm.unitPriceUsdMt,
          totalAmountUsd: wpForm.totalAmountUsd === '' ? '' : wpForm.totalAmountUsd,
          totalAmountAed: wpForm.totalAmountAed === '' ? '' : wpForm.totalAmountAed,
          addedBy: currentUserEmail,
          ownerUid: ownerUid,
          addTime: nowIso,
          status: 'confirmed',
          confirmedBy: currentUserEmail,
          confirmedAt: nowIso,
          adoptedPurchaseId: purchaseIds[0] || '',
          adoptedPurchaseIds: purchaseIds,
          adoptedAt: nowIso,
          source: 'w1_purchase'
        };
        var writes = [];
        items.forEach(function(rec) {
          rec.seq = seq;
          rec.sourceSupplierRecId = supplierRecId;
          if (purchaseRef) writes.push(purchaseRef.child(rec.id).set(rec));
        });
        if (supplierRef) writes.push(supplierRef.child(supplierRecId).set(supplierRec));
        Promise.all(writes).then(function() {
          clPurchaseModal();
          renderPurchase();
          toast('✅ 已添加 ' + items.length + ' 条采购记录，并同步到供应商界面', 'ok');
        }).catch(function(e) {
          console.error('Save W1 purchase with supplier sync failed:', e);
          toast('❌ 保存失败: ' + (e && e.message ? e.message : e), 'err');
        });
      });
    }, dateForSeq);
  }
  supplierCnExistsRemote(cn).then(function(exists) {
    if (exists) {
      toast('⚠️ 该集装箱号已在供应商界面录入 / Already entered', 'err');
      return;
    }
    writeW1PurchaseAndSupplierRecord();
  }).catch(function(err) {
    console.error('supplier cn duplicate check failed', err);
    toast('❌ 无法检查供应商界面是否已录入，请稍后再试', 'err');
  });
}
// 添加品名行
function addPurchaseItem() {  purchaseItemRowCounter++;  var rowId = purchaseItemRowCounter;  var newRow = document.createElement('tr');  newRow.className = 'purchase-item-row';  newRow.innerHTML =    '<td style="padding:4px;border:1px solid #ddd;vertical-align:middle">' + htmlPurchaseItemProductSelect(rowId, '') + '</td>' +    '<td style="padding:4px;border:1px solid #ddd;vertical-align:middle"><input type="number" class="item-qty csm-pi-qty" value="0" min="0" placeholder="实际装货数量" title="输入实际装货数量 / Enter actual loaded quantity"></td>' +    '<td style="padding:4px;border:1px solid #ddd;text-align:center"><button type="button" class="abtn x" onclick="removePurchaseItem(this)" style="color:#ff4444;font-size:16px">×</button></td>';  document.getElementById('purchaseItemsBody').appendChild(newRow);}
// 删除品名行
function removePurchaseItem(btn) {  var rows = document.querySelectorAll('.purchase-item-row');  if (rows.length > 1) {    btn.closest('tr').remove();  } else {    toast('至少保留一行品名', 'err');  }}function delPurchase(id) {  if (!confirm('确认删除这条采购记录？ / Confirm delete?')) return;  if (purchaseRef) {    purchaseRef.child(id).remove();  }}function filterPurchase() { csmW1PagerState.purchase.page = 1; renderPurchase(); }function resetPurchaseSearch() {  gid('search-purchase-date').value = '';  gid('search-purchase-cn').value = '';  gid('search-purchase-supplier').value = '';  csmW1PagerState.purchase.page = 1;  renderPurchase();}
function getPurchaseRemainingItems(pr) {  if (!pr || !recs || !recs.length) return { rem: 0, hasInbound: false };  var cn = String(pr.cn || '').trim().toUpperCase();  var p = canonicalProductName(pr.product || '');  var sum = 0;  var found = false;  recs.forEach(function(ir) {    if (ir.type) return;    if (String(ir.cn || '').trim().toUpperCase() !== cn) return;    if (canonicalProductName(ir.product || '') !== p) return;    found = true;    sum += Math.max(0, (ir.items || 0) - (ir.items_out || 0));  });  return { rem: sum, hasInbound: found };}function htmlPurchaseRemainingOne(pr) {  var x = getPurchaseRemainingItems(pr);  if (!x.hasInbound) return '<span style="color:#999">–</span>';  return '<span style="color:#ff9900;font-weight:bold">' + x.rem + '</span>';}function htmlPurchaseRemainingGroup(items) {  var parts = items.map(function(pr) { return getPurchaseRemainingItems(pr); });  var anyIn = parts.some(function(p) { return p.hasInbound; });  if (!anyIn) return '<span style="color:#999">–</span>';  var sum = parts.reduce(function(s, p) { return s + p.rem; }, 0);  return '<span style="color:#ff9900;font-weight:bold">' + sum + '</span>';}
function renderPurchase() { console.log("purchaseRecs:", purchaseRecs);  var tb = gid('tb-purchase');  var es = gid('es-purchase');  if (!tb || !es) return;  
// 获取搜索条件  
var searchDate = (gid('search-purchase-date').value || '').trim();  var searchCn = (gid('search-purchase-cn').value || '').trim().toUpperCase();  var searchSupplier = (gid('search-purchase-supplier').value || '').trim().toUpperCase();  
// 过滤 warehouse1 采购记录  
var filteredRecs = purchaseRecs.filter(function(r) {    var matchDate = !searchDate || (r.purchaseDate || '').indexOf(searchDate) !== -1;    var matchCn = !searchCn || (r.cn || '').indexOf(searchCn) !== -1;    var matchSupplier = !searchSupplier || (r.supplier || '').toUpperCase().indexOf(searchSupplier) !== -1;    return matchDate && matchCn && matchSupplier;  });  
// 合并供应商记录：只显示尚未在 warehouse1 采购列表中的记录  
var adoptedSupplierIds = {};  purchaseRecs.forEach(function(r) { if (r.sourceSupplierRecId) adoptedSupplierIds[r.sourceSupplierRecId] = true; });  var supplierOnlyRecs = supplierRecs.filter(function(r) {    if (!r.id || !r.cn) return false;    if (adoptedSupplierIds[r.id]) return false;     if ((isAdmin || isStaff) && r.status !== 'submitted' && r.status !== 'confirmed') return false;
// 已在 warehouse1 中，不再重复显示    
var matchDate = !searchDate || (r.purchaseDate || '').indexOf(searchDate) !== -1;    var matchCn = !searchCn || (r.cn || '').indexOf(searchCn) !== -1;    var matchSupplier = !searchSupplier || (r.supplier || '').toUpperCase().indexOf(searchSupplier) !== -1;    return matchDate && matchCn && matchSupplier;  });  if (filteredRecs.length === 0 && supplierOnlyRecs.length === 0) { tb.innerHTML = ''; es.style.display = 'block'; csmW1UpdatePagerBar('purchase', 0, 0, 0, 1, 1); csmW1PagerSave(); return; }  es.style.display = 'none';  
// 按集装箱号分组；组内与箱组顺序均为时间新→旧  
var cnGroups = {};  filteredRecs.forEach(function(r) {    var key = r.cn || '_empty_';    if (!cnGroups[key]) cnGroups[key] = [];    cnGroups[key].push(r);  });  Object.keys(cnGroups).forEach(function(k) { cnGroups[k].sort(csmPurchaseRowCompareDesc); });  var cnListSorted = Object.keys(cnGroups).sort(function(cnA, cnB) { return csmPurchaseRowCompareDesc(cnGroups[cnA][0], cnGroups[cnB][0]); });  var rowGroups = [];  cnListSorted.forEach(function(cn) {    var grpRows = [];    var rawCn = cn;    var items = cnGroups[cn];    var groupId = 'group-' + cn.replace(/[^a-zA-Z0-9]/g, '');    var firstItem = items[0];    var totalItems = items.length;    var totalAmount = items.reduce(function(s, r) { return s + ((r.demurrage||0)+(r.customs||0)+(r.coldFee||0)+(r.attestation||0)+(r.repack||0)+(r.waste||0)+(r.other||0)); }, 0);    var purchaseDate = firstItem.purchaseDate ? fdt(firstItem.purchaseDate+'T00:00:00') : '-';    
// 按集装箱汇总所有冷库的冷库费；只有全部出库完成后才在采购页显示总和    
var coldFeeSummary = getContainerColdFeeSummary(rawCn);    var coldFeeDisplay = '-';    if (coldFeeSummary.hasInRec && coldFeeSummary.allCheckedOut) {      coldFeeDisplay = '<strong style="color:#0066cc;background:#e8f4ff;padding:2px 6px;border-radius:3px;font-size:14px">' + coldFeeSummary.totalFee.toFixed(2) + '</strong>';    }    if (cn === '_empty_') cn = '-';    
// 主行：集装箱号 + 展开按钮    
var expandBtn = totalItems > 1 ?      '<button type="button" class="abtn" style="background:#f0f0f0;border:1px solid #ddd;padding:2px 6px;font-size:14px" onclick="togglePurchaseGroup(\'' + groupId + '\',this)">+</button>' : '';    var firstQty = firstItem.qty || '-';    var firstSeq = firstItem.seq || '-';    grpRows.push('<tr style="background:#f9f9f9;font-weight:bold" id="pur-main-' + groupId + '">' +      '<td style="color:#0066cc">' + firstSeq + '</td>' +      '<td>' + expandBtn + ' <button type="button" class="abtn" style="background:#e8f4ff;border-color:#00bfff;color:#00bfff;padding:2px 6px;font-size:11px" onclick="quickCheckIn(' + csmHtmlAttrJson(firstItem.id) + ')">📥</button> <a href="javascript:void(0)" onclick="showPurchaseCnDetail(' + csmHtmlAttrJson(rawCn) + ');return false;" style="color:#0066cc;font-weight:bold;text-decoration:underline;cursor:pointer">' + csmEscapeHtml(String(cn)) + '</a> <span style="color:#999;font-size:11px">(' + totalItems + '品名)</span></td>' +      '<td style="font-family:Arial">'+fmtSupplierName(firstItem.supplier)+'</td><td style="font-family:Arial;text-transform:capitalize">'+w1ProductHtml(firstItem.product)+'</td><td>'+purchaseDate+'</td><td style="font-family:Arial">'+w1EscHtml(resolvePortListDisplayName(firstItem.pol, 'pol'))+'</td><td style="font-family:Arial">'+w1EscHtml(resolvePortListDisplayName(firstItem.pod, 'pod'))+'</td><td style="font-family:Arial">'+firstQty+'</td><td style="font-family:Arial">'+htmlPurchaseRemainingGroup(items)+'</td><td style="font-family:Arial">'+(firstItem.demurrage||0)+'</td><td style="font-family:Arial">'+(firstItem.customs||0)+'</td><td style="font-family:Arial">'+(coldFeeDisplay||'-')+'</td><td style="font-family:Arial">'+(firstItem.attestation||0)+'</td><td style="font-family:Arial">'+(firstItem.repack||0)+'</td><td style="font-family:Arial">'+(firstItem.waste||0)+'</td><td style="font-family:Arial">'+(firstItem.other||0)+'</td>' +      '<td><strong style="color:#0066cc">'+totalAmount.toFixed(2)+'</strong></td>' +      '<td><button type="button" class="abtn" onclick="openEditPurchase(\''+firstItem.id+'\')">✏️</button><button type="button" class="abtn x" onclick="delPurchaseGroup(\'' + cn + '\')">🗑</button></td></tr>');    
// 子行：每个品名    
items.forEach(function(r) {      var total = (r.demurrage||0)+(r.customs||0)+(r.coldFee||0)+(r.attestation||0)+(r.repack||0)+(r.waste||0)+(r.other||0);      grpRows.push('<tr class="purchase-sub-row ' + groupId + '" style="display:none;background:#fff">' +        '<td style="color:#0066cc">' + (r.seq || '-') + '</td>' +        '<td style="padding-left:40px;color:#666;font-family:Arial;text-transform:capitalize">└ '+w1ProductHtml(r.product)+'</td>' +        '<td style="font-family:Arial;color:#666">'+fmtSupplierName(r.supplier)+'</td><td style="font-family:Arial;text-transform:capitalize">'+w1ProductHtml(r.product)+'</td><td>-</td><td>-</td><td>-</td><td>'+(r.qty||0)+'</td><td style="font-family:Arial">'+htmlPurchaseRemainingOne(r)+'</td>' +        '<td>'+(r.demurrage||0)+'</td><td>'+(r.customs||0)+'</td><td>-</td>' +        '<td>'+(r.attestation||0)+'</td><td>'+(r.repack||0)+'</td><td>'+(r.waste||0)+'</td><td>'+(r.other||0)+'</td>' +        '<td><strong style="color:#0066cc">'+total.toFixed(2)+'</strong></td>' +        '<td><button type="button" class="abtn" onclick="openEditPurchase(\''+r.id+'\')">✏️</button><button type="button" class="abtn x" onclick="delPurchase(\''+r.id+'\')">🗑</button></td></tr>');    }); rowGroups.push(grpRows);  });  
// 显示供应商专属记录（在 warehouse1 采购列表中没有的）  
if (supplierOnlyRecs.length > 0) {    
// 按采购日期时间新→旧（与主表一致）    
supplierOnlyRecs.sort(csmPurchaseRowCompareDesc);    supplierOnlyRecs.forEach(function(r) {      var status = r.status || 'draft';      var supplierLabel = '<span style="background:#fff3e0;color:#e65100;font-size:10px;padding:1px 4px;border-radius:2px;margin-left:4px">供应商</span>';      var statusBadge = status === 'submitted' ? '<span style="background:#fff8e1;color:#f57f17;font-size:10px;padding:1px 4px;border-radius:2px;margin-left:4px">已提交</span>' : '<span style="background:#e8f5e9;color:#2e7d32;font-size:10px;padding:1px 4px;border-radius:2px;margin-left:4px">已确认</span>';      var cnClickFn = "openSupplierCNDetail('" + r.id + "')";      var actionBtn = isAdmin ? (status === 'submitted' ? '<button type="button" class="abtn" style="background:#2e7d32;color:#fff" onclick="confirmSupplierRec(\'' + r.id + '\')">✅ 确认采用</button>' : '<button type="button" class="abtn" style="background:#0066cc;color:#fff" onclick="confirmSupplierRec(\'' + r.id + '\')">📥 采用</button>') : '<span style="color:#888;font-size:12px">' + (status === 'submitted' ? '待管理员确认' : '待管理员采用') + '</span>';      rowGroups.push(['<tr style="background:#fffbf5">' +        '<td style="color:#ff9900">' + (r.seq || '-') + '</td>' +        '<td><a href="javascript:void(0)" onclick="' + cnClickFn + '" style="color:#ff9900;font-weight:bold;text-decoration:underline">' + (r.cn || '-') + '</a>' + supplierLabel + statusBadge + '</td>' +        '<td style="font-family:Arial;color:#666">' + fmtSupplierName(r.supplier) + '</td>' +        '<td style="font-family:Arial;text-transform:capitalize">' + w1ProductHtml(r.product) + '</td>' +        '<td>' + (r.purchaseDate ? fdt(r.purchaseDate+'T00:00:00') : '-') + '</td>' +        '<td style="font-family:Arial">' + w1EscHtml(resolvePortListDisplayName(r.pol, 'pol')) + '</td><td style="font-family:Arial">' + w1EscHtml(resolvePortListDisplayName(r.pod, 'pod')) + '</td>' +        '<td style="font-family:Arial">' + (r.qty || 0) + '</td><td style="font-family:Arial">' + htmlPurchaseRemainingOne(r) + '</td>' +        '<td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>' +        '<td style="color:#f57f17;font-weight:bold">' + (status === 'submitted' ? '待管理员确认' : '待采用') + '</td>' +        '<td>' + actionBtn + '</td>' +      '</tr>']);    });  }  var stPu = csmW1PagerState.purchase;  var allFlatPu = [];  rowGroups.forEach(function(g) { g.forEach(function(row) { allFlatPu.push(row); }); });  var pagesPu;  if (!stPu.size || stPu.size <= 0) pagesPu = [allFlatPu];  else pagesPu = csmW1BuildPagesFromRowGroups(rowGroups, stPu.size);  var totalPagesPu = Math.max(1, pagesPu.length);  var pagePu = Math.min(Math.max(1, stPu.page), totalPagesPu);  stPu.page = pagePu;  var slicePu = pagesPu[pagePu - 1] || [];  tb.innerHTML = slicePu.join('');  var totalRowsPu = allFlatPu.length;  var rowStartPu = totalRowsPu === 0 ? 0 : (function() { var s = 0; for (var pi = 0; pi < pagePu - 1; pi++) s += (pagesPu[pi] || []).length; return s + 1; })();  var rowEndPu = totalRowsPu === 0 ? 0 : rowStartPu + slicePu.length - 1;  csmW1UpdatePagerBar('purchase', totalRowsPu, rowStartPu, rowEndPu, pagePu, totalPagesPu);  csmW1PagerSave();}
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
var settData = { suppliers: [], products: [], shipCompanies: [], pol: [], pod: [] };
var hasCloudSettingsSnapshot = false;
function normalizeSettingsPayload() {
  function clean(arr) {
    return (Array.isArray(arr) ? arr : []).map(function(x) { return String(x || '').trim(); }).filter(function(z) { return !!z; });
  }
  return {
    suppliers: clean(settData.suppliers),
    products: clean(settData.products),
    shipCompanies: clean(settData.shipCompanies),
    pol: clean(settData.pol),
    pod: clean(settData.pod)
  };
}
function coerceSettingsStringList(v) {
  if (Array.isArray(v)) {
    return v.map(function(x) { return String(x || '').trim(); }).filter(function(z) { return !!z; });
  }
  if (v && typeof v === 'object') {
    return Object.keys(v)
      .sort(function(a, b) { return (Number(a) || 0) - (Number(b) || 0); })
      .map(function(k) { return String(v[k] == null ? '' : v[k]).trim(); })
      .filter(function(z) { return !!z; });
  }
  return [];
}
function parseSettingsRemoteVal(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    try {
      var v = JSON.parse(raw);
      return (v && typeof v === 'object') ? v : null;
    } catch (eStr) {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
}
function applySettDataFromPayload(val) {
  val = val || {};
  settData.suppliers = coerceSettingsStringList(val.suppliers);
  settData.products = coerceSettingsStringList(val.products);
  settData.shipCompanies = coerceSettingsStringList(val.shipCompanies);
  settData.pol = coerceSettingsStringList(val.pol);
  settData.pod = coerceSettingsStringList(val.pod);
}
function saveSettingsLocalOnly() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settData)); } catch (eL) {}
}
function afterUnifiedSettingsApplied() {
  try { syncAllProductSelects(); } catch (e1) {}
  try { refreshSupplierShipCompanyOptions(); } catch (e2) {}
  try { refreshAllPolPodDropdowns(); } catch (e2b) {}
  try {
    if (isSupplier && typeof renderSupplierTable === 'function') renderSupplierTable();
  } catch (e3) {}
  try {
    var pm = gid('purchaseModal');
    var fps = gid('fp-supplier');
    if (pm && pm.classList.contains('sh') && fps && typeof refreshFpSupplierSelect === 'function') {
      refreshFpSupplierSelect(String(fps.value || '').trim());
    }
  } catch (e4) {}
}
function pullUnifiedSettingsOnce() {
  if (!settingsMetaRef || !firebase.auth || !firebase.auth().currentUser) {
    return Promise.resolve();
  }
  return settingsMetaRef.once('value').then(function(snap) {
    var val = parseSettingsRemoteVal(snap.val());
    if (val != null && typeof val === 'object') {
      hasCloudSettingsSnapshot = true;
      applySettDataFromPayload(val);
      saveSettingsLocalOnly();
      afterUnifiedSettingsApplied();
    }
  }).catch(function(e) {
    console.error('csm_meta/settings once', e);
    if (isSupplier) {
      toast('无法读取云端设置（品名/船公司）。请检查网络与数据库规则是否允许读取 csm_meta/settings。', 'err');
    }
  });
}
function onSettingsMetaSnap(snap) {
  var val = parseSettingsRemoteVal(snap.val());
  if (val == null || typeof val !== 'object') {
    if (hasCloudSettingsSnapshot && !val) {
      return;
    }
    try {
      var stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        settData = JSON.parse(stored);
        if (!Array.isArray(settData.suppliers)) settData.suppliers = [];
        if (!Array.isArray(settData.products)) settData.products = [];
        if (!Array.isArray(settData.shipCompanies)) settData.shipCompanies = [];
        if (!Array.isArray(settData.pol)) settData.pol = [];
        if (!Array.isArray(settData.pod)) settData.pod = [];
      } else {
        settData = {
          suppliers: ['ABC Trading', 'XYZ Imports', 'Fresh Farm Co'],
          products: ['Carrots', 'Potatoes', 'Onions', 'Tomatoes'],
          shipCompanies: ['MAERSK', 'MSC', 'CMA CGM'],
          pol: [],
          pod: []
        };
        saveSettingsLocalOnly();
      }
    } catch (e0) {
      settData = { suppliers: [], products: [], shipCompanies: [], pol: [], pod: [] };
    }
    if ((isAdmin || isStaff) && settingsMetaRef && firebase.auth && firebase.auth().currentUser) {
      var pl = normalizeSettingsPayload();
      if (pl.suppliers.length || pl.products.length || pl.shipCompanies.length || pl.pol.length || pl.pod.length) {
        settingsMetaRef.set(pl).catch(function(e) { console.error('csm seed settings', e); });
      } else {
        settData = {
          suppliers: ['ABC Trading', 'XYZ Imports', 'Fresh Farm Co'],
          products: ['Carrots', 'Potatoes', 'Onions', 'Tomatoes'],
          shipCompanies: ['MAERSK', 'MSC', 'CMA CGM'],
          pol: [],
          pod: []
        };
        settingsMetaRef.set(normalizeSettingsPayload()).catch(function(e) { console.error('csm seed default settings', e); });
      }
    }
    afterUnifiedSettingsApplied();
    return;
  }
  hasCloudSettingsSnapshot = true;
  applySettDataFromPayload(val);
  saveSettingsLocalOnly();
  afterUnifiedSettingsApplied();
}
function loadSettings() {
  if (hasCloudSettingsSnapshot) return;
  try {
    var stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      settData = JSON.parse(stored);
      if (!Array.isArray(settData.suppliers)) settData.suppliers = [];
      if (!Array.isArray(settData.products)) settData.products = [];
      if (!Array.isArray(settData.shipCompanies)) settData.shipCompanies = [];
      if (!Array.isArray(settData.pol)) settData.pol = [];
      if (!Array.isArray(settData.pod)) settData.pod = [];
    } else {
      settData = {
        suppliers: ['ABC Trading', 'XYZ Imports', 'Fresh Farm Co'],
        products: ['Carrots', 'Potatoes', 'Onions', 'Tomatoes'],
        shipCompanies: ['MAERSK', 'MSC', 'CMA CGM'],
        pol: [],
        pod: []
      };
      saveSettingsLocalOnly();
    }
  } catch(e) {
    settData = { suppliers: [], products: [], shipCompanies: [], pol: [], pod: [] };
  }
}
function saveSettings() {
  saveSettingsLocalOnly();
  try { syncAllProductSelects(); } catch (eSync) {}
  if (settingsMetaRef && firebase.auth && firebase.auth().currentUser && (isAdmin || isStaff)) {
    settingsMetaRef.set(normalizeSettingsPayload()).catch(function(e) { console.error('csm settings cloud sync', e); });
  }
}
function getW1ProductsNormalized() {
  try { loadSettings(); } catch (e0) {}
  return (settData.products || []).map(function(p) { return String(p || '').trim(); }).filter(function(x) { return !!x; });
}
function w1EscAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
function w1EscHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function resolveProductDisplayName(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return '-';
  try { loadSettings(); } catch (eR) {}
  var list = getW1ProductsNormalized();
  for (var i = 0; i < list.length; i++) {
    if (list[i].toLowerCase() === s.toLowerCase()) return list[i];
  }
  return fmtTitleCase(s);
}
function resolveShipCompanyDisplayName(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return '-';
  try { loadSettings(); } catch (eShip) {}
  var list = coerceSettingsStringList(settData.shipCompanies);
  for (var i = 0; i < list.length; i++) {
    if (list[i].toLowerCase() === s.toLowerCase()) return list[i];
  }
  return fmtTitleCase(s);
}
function resolvePortListDisplayName(raw, kind) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return '-';
  try { loadSettings(); } catch (ePort) {}
  var list = kind === 'pod' ? coerceSettingsStringList(settData.pod) : coerceSettingsStringList(settData.pol);
  for (var i = 0; i < list.length; i++) {
    if (list[i].toLowerCase() === s.toLowerCase()) return list[i];
  }
  return fmtTitleCase(s);
}
function w1ProductHtml(raw) {
  return w1EscHtml(resolveProductDisplayName(raw));
}
function canonicalProductName(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  try { loadSettings(); } catch (eC) {}
  var list = getW1ProductsNormalized();
  for (var i = 0; i < list.length; i++) {
    if (list[i].toLowerCase() === s.toLowerCase()) return list[i];
  }
  return s;
}
function buildProductSelectOptionsHtml(selectedRaw) {
  try { loadSettings(); } catch (eB) {}
  var list = getW1ProductsNormalized();
  var selNorm = String(selectedRaw || '').trim().toLowerCase();
  var html = '<option value="">请选择品名</option>';
  var found = false;
  list.forEach(function(p) {
    var isSel = selNorm && p.toLowerCase() === selNorm;
    if (isSel) found = true;
    html += '<option value="' + w1EscAttr(p) + '"' + (isSel ? ' selected' : '') + '>' + w1EscHtml(p) + '</option>';
  });
  if (selNorm && !found) {
    var raw = String(selectedRaw).trim();
    html += '<option value="' + w1EscAttr(raw) + '" selected>' + w1EscHtml(raw) + ' (未在列表)</option>';
  }
  return html;
}
function syncAllProductSelects() {
  document.querySelectorAll('select.csm-product-select').forEach(function(sel) {
    if (sel.closest && sel.closest('#sales-order-modal')) return;
    var prev = String(sel.value || '');
    sel.innerHTML = buildProductSelectOptionsHtml(prev);
  });
}
function htmlPurchaseItemProductSelect(rowId, selectedVal) {
  return '<select class="item-product csm-product-select csm-pi-product" data-rowid="' + rowId + '">' + buildProductSelectOptionsHtml(selectedVal) + '</select>';
}
function openSettings() {
  loadSettings();
  renderSettList('supplier');
  renderSettList('product');
  renderSettList('shipcompany');
  renderSettList('pol');
  renderSettList('pod');
  loadRatesToSettings();
  if (canManageAccounts()) loadUserList();
  else {
    var ul = gid('user-list');
    if (ul) ul.innerHTML = '';
  }
  updateStaffRestrictedVisibility();
  try { syncAllProductSelects(); } catch (eSettSync) {}
  gid('settingsModal').classList.add('sh');
}
function clSettings() {
  gid('settingsModal').classList.remove('sh');
}
// ============================================================
// FIREBASE USER MANAGEMENT
// ============================================================// 加载用户列表
function loadUserList() {
  if (!canManageAccounts()) return;
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
  html += '<th style="padding:8px;text-align:left;border:1px solid #ddd;font-family:var(--csm-font-en);font-weight:700;text-transform:none">邮箱</th>';
  html += '<th style="padding:8px;text-align:center;border:1px solid #ddd;font-family:var(--csm-font-en);font-weight:700;text-transform:none">角色</th>';
  html += '<th style="padding:8px;text-align:left;border:1px solid #ddd;font-family:var(--csm-font-en);font-weight:700;text-transform:none">供应商名称</th>';
  html += '<th style="padding:8px;text-align:center;border:1px solid #ddd;font-family:var(--csm-font-en);font-weight:700;text-transform:none">操作</th>';
  html += '</tr>';
  users.forEach(function(user) {
    var isCurrentUser = user.uid === currentUser;
    var bgStyle = isCurrentUser ? 'background:#fff8e1' : '';
    html += '<tr style="' + bgStyle + '">';
    html += '<td style="padding:8px;border:1px solid #ddd">' + (user.email || 'N/A') + (isCurrentUser ? ' <span style="color:#00bfff;font-size:11px">(当前)</span>' : '') + '</td>';
    html += '<td style="padding:8px;text-align:center;border:1px solid #ddd">';
    html += '<select id="role-' + user.uid + '" onchange="toggleUserSupplierNameInput(\'' + user.uid + '\', this.value)" style="padding:4px;border:1px solid #ddd;border-radius:4px;font-size:12px">';
    html += '<option value="admin"' + (user.role === 'admin' ? ' selected' : '') + '>管理员</option>';
    html += '<option value="staff"' + (user.role === 'staff' ? ' selected' : '') + '>大丰收员工</option>';
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
      html += '<button type="button" onclick="sendUserPasswordResetEmail(' + csmHtmlAttrJson(String(user.email).trim()) + ')" style="padding:4px 8px;background:#0066cc;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;margin:2px">重置邮件</button>';
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
  if (!canManageAccounts()) {
    toast('需要管理员权限', 'err');
    return;
  }
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
  if (!canManageAccounts()) {
    toast('需要管理员权限', 'err');
    return;
  }
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
  if (!canManageAccounts()) {
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
  var roleLabel = role === 'admin' ? '管理员' : (role === 'staff' ? '大丰收员工' : (role === 'logistics' ? '物流公司' : '供应商'));
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
  if (!isAdmin && !isStaff) {
    toast('仅管理员或大丰收员工可修改品名/供应商/船公司/港口列表', 'err');
    return;
  }
  var inputId = 'sett-' + type + '-input';
  var val = (gid(inputId).value || '').trim();
  if (!val) return;
  val = val.toLowerCase().replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  var list;
  if (type === 'supplier') list = settData.suppliers;
  else if (type === 'product') list = settData.products;
  else if (type === 'shipcompany') list = settData.shipCompanies;
  else if (type === 'pol') list = settData.pol;
  else if (type === 'pod') list = settData.pod;
  else list = [];
  if (list.indexOf(val) !== -1) {
    toast('已存在: ' + val, 'err');
    return;
  }
  var typeLabel = type === 'supplier' ? '供应商' : (type === 'product' ? '品名' : (type === 'shipcompany' ? '船公司' : (type === 'pol' ? 'POL 起运港' : (type === 'pod' ? 'POD 目的港' : type))));
  if (!confirm('确认添加 ' + typeLabel + ': ' + val + ' ？')) return;
  list.push(val);
  saveSettings();
  gid(inputId).value = '';
  renderSettList(type);
  toast('✅ 已添加: ' + val, 'ok');
}
function delSettItem(type, val) {
  if (!isAdmin && !isStaff) {
    toast('仅管理员或大丰收员工可修改品名/供应商/船公司/港口列表', 'err');
    return;
  }
  var typeLabel = type === 'supplier' ? '供应商' : (type === 'product' ? '品名' : (type === 'shipcompany' ? '船公司' : (type === 'pol' ? 'POL 起运港' : (type === 'pod' ? 'POD 目的港' : type))));
  if (!confirm('确认删除 ' + typeLabel + ': ' + val + ' ？')) return;
  if (type === 'supplier') {
    settData.suppliers = settData.suppliers.filter(function(s) { return s !== val; });
  } else if (type === 'product') {
    settData.products = settData.products.filter(function(s) { return s !== val; });
  } else if (type === 'shipcompany') {
    settData.shipCompanies = settData.shipCompanies.filter(function(s) { return s !== val; });
  } else if (type === 'pol') {
    settData.pol = (settData.pol || []).filter(function(s) { return s !== val; });
  } else if (type === 'pod') {
    settData.pod = (settData.pod || []).filter(function(s) { return s !== val; });
  }
  saveSettings();
  renderSettList(type);
  toast('✅ 已删除: ' + val, 'ok');
}
function renderSettList(type) {
  var listId = 'sett-' + type + '-list';
  var el = gid(listId);
  if (!el) return;
  var items;
  if (type === 'supplier') items = settData.suppliers;
  else if (type === 'product') items = settData.products;
  else if (type === 'shipcompany') items = settData.shipCompanies;
  else if (type === 'pol') items = settData.pol;
  else if (type === 'pod') items = settData.pod;
  else items = [];
  if (items.length === 0) {
    el.innerHTML = '<div style="color:#999;font-size:12px;padding:4px">暂无数据 / No data</div>';
    return;
  }
  el.innerHTML = items.map(function(item) {
    var delHtml = (isAdmin || isStaff) ? (' <span class="del" onclick="delSettItem(\'' + type + '\',\'' + item.replace(/'/g, "\\'") + '\')">✕</span>') : '';
    return '<span class="sett-tag">' + item + delHtml + '</span>';
  }).join('');
}
// ============================================================
// EDIT PURCHASE RECORD
// ============================================================
function openEditPurchase(id) {  var r = purchaseRecs.find(function(x) { return x.id === id; });  if (!r) return;  gid('fe-id').value = r.id;  gid('fe-cn').value = r.cn || '';  if (gid('fe-invoice')) gid('fe-invoice').value = String(r.invoiceNumber || '').trim();  gid('fe-supplier').value = r.supplier || '';  var feP = gid('fe-product');  if (feP) feP.innerHTML = buildProductSelectOptionsHtml(r.product || '');  gid('fe-qty').value = r.qty || 0;  gid('fe-demurrage').value = r.demurrage || 0;  gid('fe-customs').value = r.customs || 0;  gid('fe-coldfee').value = r.coldFee || 0;  gid('fe-attestation').value = r.attestation || 0;  gid('fe-repack').value = r.repack || 0;  gid('fe-waste').value = r.waste || 0;  gid('fe-other').value = r.other || 0;  gid('editPurchaseModal').classList.add('sh');}function clEditPurchaseModal() {  gid('editPurchaseModal').classList.remove('sh');}function saveEditPurchase() {  var id = gid('fe-id').value;  var r = purchaseRecs.find(function(x) { return x.id === id; });  if (!r) return;  r.cn = (gid('fe-cn').value || '').trim().toUpperCase();  r.supplier = (gid('fe-supplier').value || '').trim();  if (gid('fe-invoice')) r.invoiceNumber = String(gid('fe-invoice').value || '').trim();  if (getW1ProductsNormalized().length === 0) { toast('请先在「设置 → 品名管理」中添加品名', 'err'); return; }  var fePr = (gid('fe-product').value || '').trim();  if (!fePr) { toast('请选择品名', 'err'); return; }  r.product = canonicalProductName(fePr);  r.qty = parseFloat(gid('fe-qty').value) || 0;  r.demurrage = parseFloat(gid('fe-demurrage').value) || 0;  r.customs = parseFloat(gid('fe-customs').value) || 0;  r.coldFee = parseFloat(gid('fe-coldfee').value) || 0;  r.attestation = parseFloat(gid('fe-attestation').value) || 0;  r.repack = parseFloat(gid('fe-repack').value) || 0;  r.waste = parseFloat(gid('fe-waste').value) || 0;  r.other = parseFloat(gid('fe-other').value) || 0;  
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
productDropdown.innerHTML = sameCnItems.map(function(item, idx) {      var lab = item.product ? resolveProductDisplayName(item.product) : ('品名' + (idx + 1));      return '<option value="' + item.id + '">' + w1EscHtml(lab) + '</option>';    }).join('');    
// 保存所有品名数据    
window.quickInMultiData = sameCnItems;  } else {    
// 单个品名    
productSelect.style.display = 'none';    quickInInfo.innerHTML = '📦 <strong>' + r.cn + '</strong> | ' + r.supplier + ' | ' + w1ProductHtml(r.product);    
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
    var fpS = gid('fp-supplier');
    if (fpS && fpS.tagName === 'SELECT') {
      fpS.value = val;
      if (fpS.value !== val && typeof refreshFpSupplierSelect === 'function') refreshFpSupplierSelect(val);
    } else if (fpS) {
      fpS.value = val;
    }
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
var inRecs = recs.filter(function(r) {    return r.store === currentColdStore && !r.dep;  });  var filtered = val ? inRecs.filter(function(r) {    return r.cn.toUpperCase().indexOf(val) !== -1;  }) : inRecs;  if (filtered.length === 0) {    suggestEl.classList.remove('show');    suggestEl.innerHTML = '';    return;  }  suggestEl.innerHTML = filtered.map(function(r) {    return '<div class="suggest-item" onmousedown="pickCnSuggest(this)" style="font-size:12px">' +      '<strong>' + r.cn + '</strong> <span style="color:#999">| ' + w1EscHtml(resolveProductDisplayName(r.product)) + ' | 剩余托盘: ' + (r.pallets - (r.pallets_out||0)) + '</span></div>';  }).join('');  suggestEl.classList.add('show');}function pickCnSuggest(el) {  var text = el.textContent;  var cn = text.split('|')[0].trim();  gid('f-cno').value = cn;  hideSuggest('checkout-cn');}
// ============================================================
// CUSTOMS COMPANY FUNCTIONS
// ============================================================
var LOGISTICS_KEY = 'csm_customs_fees';function getLogisticsFees() {  try {    var stored = localStorage.getItem(LOGISTICS_KEY);    return stored ? JSON.parse(stored) : [];  } catch(e) { return []; }}function saveLogisticsFees(fees) {  localStorage.setItem(LOGISTICS_KEY, JSON.stringify(fees));}function openLogisticsAddForm(id) {  var now = new Date();  var yyyy = now.getFullYear();  var mm = String(now.getMonth() + 1).padStart(2, '0');  var dd = String(now.getDate()).padStart(2, '0');  var hh = String(now.getHours()).padStart(2, '0');  var mi = String(now.getMinutes()).padStart(2, '0');  gid('logisticsModalTitle').textContent = id ? '编辑物流费用' : '添加物流费用';  gid('logistics-cn').value = '';  gid('logistics-date').value = yyyy + '-' + mm + '-' + dd;  gid('logistics-time').value = hh + ':' + mi;  gid('logistics-fee').value = '0';  gid('logistics-discount').value = '0';  if (gid('logistics-invoice')) gid('logistics-invoice').value = '';  gid('logistics-remark').value = '';  gid('logistics-payment-status').value = 'unpaid';  gid('logistics-id').value = id || '';  if (id) {    var fees = getLogisticsFees();    var fee = fees.find(function(f) { return f.id === id; });    if (fee) {      gid('logistics-cn').value = fee.cn || '';      gid('logistics-date').value = fee.addDate || '';      gid('logistics-time').value = fee.addTime || '';      if (gid('logistics-invoice')) gid('logistics-invoice').value = fee.invoiceNo || fee.invoice || '';      gid('logistics-fee').value = fee.fee || 0;      gid('logistics-discount').value = fee.discount || 0;      gid('logistics-remark').value = fee.remark || '';      gid('logistics-payment-status').value = fee.paymentStatus || 'unpaid';    }  }  gid('logisticsModal').classList.add('sh');}function clLogisticsModal() {  gid('logisticsModal').classList.remove('sh');}function saveLogisticsFee() {  var cn = (gid('logistics-cn').value || '').trim().toUpperCase();  var addDate = (gid('logistics-date').value || '').trim();  var addTime = (gid('logistics-time').value || '').trim();  var fee = parseFloat(gid('logistics-fee').value) || 0;  var discount = parseFloat(gid('logistics-discount').value) || 0;  var remark = (gid('logistics-remark').value || '').trim();  var invEl = gid('logistics-invoice');  var invoiceNo = invEl ? (invEl.value || '').trim() : '';  var paymentStatus = gid('logistics-payment-status').value || 'unpaid';  var id = gid('logistics-id').value;  if (!cn) { toast('请输入集装箱号 / Enter container no.', 'err'); return; }  if (!addDate) { toast('请选择日期 / Select date', 'err'); return; }  var fees = getLogisticsFees();  if (id) {    var idx = fees.findIndex(function(f) { return f.id === id; });    if (idx !== -1) {      fees[idx].cn = cn;      fees[idx].addDate = addDate;      fees[idx].addTime = addTime || fees[idx].addTime || '';      fees[idx].fee = fee;      fees[idx].discount = discount;      fees[idx].remark = remark;      fees[idx].invoiceNo = invoiceNo;      fees[idx].updatedBy = currentUser;      fees[idx].updateTime = new Date().toISOString();      fees[idx].confirmed = false;      fees[idx].paymentStatus = paymentStatus;    }    toast('✅ 物流费用已更新 / Updated', 'ok');  } else {    fees.push({      id: Date.now().toString(),      cn: cn,      addDate: addDate,      addTime: addTime,      fee: fee,      discount: discount,      remark: remark,      invoiceNo: invoiceNo,      addedBy: currentUser,      addTimeISO: new Date().toISOString(),      confirmed: false,      confirmedBy: null,      confirmTime: null,      paymentStatus: paymentStatus    });    toast('✅ 物流费用已添加 / Added', 'ok');  }  saveLogisticsFees(fees);  clLogisticsModal();  renderLogisticsTable();}function delLogisticsFee(id) {  if (!confirm('确认删除这条物流记录？')) return;  var fees = getLogisticsFees();  fees = fees.filter(function(f) { return f.id !== id; });  saveLogisticsFees(fees);  renderLogisticsTable();}function confirmLogisticsFee(id) {  var fees = getLogisticsFees();  var idx = fees.findIndex(function(f) { return f.id === id; });  if (idx !== -1) {    fees[idx].confirmed = true;    fees[idx].confirmedBy = currentUser;    fees[idx].confirmTime = new Date().toISOString();    saveLogisticsFees(fees);    renderLogisticsTable();    toast('✅ 已确认物流费用 / Confirmed', 'ok');  }}function unconfirmLogisticsFee(id) {  var fees = getLogisticsFees();  var idx = fees.findIndex(function(f) { return f.id === id; });  if (idx !== -1) {    fees[idx].confirmed = false;    fees[idx].confirmedBy = null;    fees[idx].confirmTime = null;    saveLogisticsFees(fees);    renderLogisticsTable();    toast('✅ 已取消确认 / Unconfirmed', 'ok');  }}function filterLogisticsTable() {  renderLogisticsTable();}function clearLogisticsSearch() {  gid('logistics-search-date-start').value = '';  gid('logistics-search-date-end').value = '';  gid('logistics-search-cn').value = '';  renderLogisticsTable();}function renderLogisticsTable() {  var tb = gid('tb-logistics');  var es = gid('es-logistics');  if (!tb || !es) return;  var fees = getLogisticsFees();  console.log('[Logistics] fees count:', fees.length, 'fees:', fees);  var searchCN = (gid('logistics-search-cn').value || '').trim().toUpperCase();  var searchDateStart = (gid('logistics-search-date-start').value || '').trim();  var searchDateEnd = (gid('logistics-search-date-end').value || '').trim();  var fees = getLogisticsFees();  if (searchCN || searchDateStart || searchDateEnd) {    fees = fees.filter(function(f) {      var matchCN = !searchCN || (f.cn || '').toUpperCase().indexOf(searchCN) !== -1;      var fDate = f.addDate || '';      var matchDate = true;      if (searchDateStart && fDate < searchDateStart) matchDate = false;      if (searchDateEnd && fDate > searchDateEnd) matchDate = false;      return matchCN && matchDate;    });  }  if (fees.length === 0) {    tb.innerHTML = '';    es.style.display = 'block';    return;  }  es.style.display = 'none';  var html = fees.map(function(f) {    var statusText = f.confirmed ? '<span style="color:#00aa00;font-weight:bold;background:#e8f5e9;padding:2px 8px;border-radius:4px">APPROVED</span>' : '<span style="color:#ff9900;background:#fff8e1;padding:2px 8px;border-radius:4px">PENDING</span>';    var statusClass = f.confirmed ? 'background:#e8f5e9' : 'background:#fff8e1';    var actionBtns = '';    if (isAdmin) {      if (f.confirmed) {        actionBtns = '<button class="abtn" onclick="unconfirmLogisticsFee(\'' + f.id + '\')" style="color:#ff9900">取消确认</button> ';      } else {        actionBtns = '<button class="abtn" onclick="confirmLogisticsFee(\'' + f.id + '\')" style="background:#4CAF50;color:#fff;border:none;padding:2px 8px;border-radius:3px">确认</button> ';      }    }    actionBtns += '<button class="abtn" onclick="openLogisticsAddForm(\'' + f.id + '\')">✏️</button> <button class="abtn x" onclick="delLogisticsFee(\'' + f.id + '\')">🗑</button>';    var purchaseMatch = '';    if (typeof purchaseRecs !== 'undefined' && purchaseRecs && purchaseRecs.length) {      var matchedPurchase = purchaseRecs.find(function(p) { return p.cn === f.cn; });      if (matchedPurchase) {        purchaseMatch = '<span style="background:#e8f5e9;color:#00aa00;font-size:10px;padding:1px 4px;border-radius:2px;margin-left:4px">采购</span>';      }    }    var paymentHTML = '';    var ps = f.paymentStatus || 'unpaid';    if (ps === 'paid') {      paymentHTML = '<span style="color:#00aa00;font-weight:bold;background:#e8f5e9;padding:2px 8px;border-radius:4px">✅ PAID</span>';    } else if (ps === 'partial') {      paymentHTML = '<span style="color:#ff9900;background:#fff8e1;padding:2px 8px;border-radius:4px">⏳ PARTIAL</span>';    } else {      paymentHTML = '<span style="color:#cc0000;background:#fce4ec;padding:2px 8px;border-radius:4px">❌ UNPAID</span>';    }    return '<tr style="' + statusClass + '">' +      '<td><strong>' + (f.cn || '-') + '</strong>' + purchaseMatch + '</td>' +      '<td style="white-space:nowrap">' + (f.addDate || '-') + (f.addTime ? '<br><span style="font-size:11px;color:#888">' + f.addTime + '</span>' : '') + '</td>' +      '<td style="max-width:160px;word-wrap:break-word;font-family:var(--csm-font-en);font-weight:700">' + ((f.invoiceNo != null && String(f.invoiceNo) !== '') || (f.invoice != null && String(f.invoice) !== '') ? w1EscHtml(String(f.invoiceNo != null && String(f.invoiceNo) !== '' ? f.invoiceNo : f.invoice)) : '—') + '</td>' +      '<td>' + f.fee.toFixed(2) + ' AED</td>' +      '<td style="color:#ff4444">-' + f.discount.toFixed(2) + ' AED</td>' +      '<td>' + paymentHTML + '</td>' +      '<td>' + statusText + '</td>' +      '<td>' + actionBtns + '</td></tr>';  }).join('');  var totalFee = fees.reduce(function(s, f) { return s + (f.fee || 0); }, 0);  var totalDiscount = fees.reduce(function(s, f) { return s + (f.discount || 0); }, 0);  tb.innerHTML = html + '<tr style="background:#e8f5e9;font-weight:bold"><td colspan="3">📊 Total</td><td>' + totalFee.toFixed(2) + ' AED</td><td style="color:#ff4444">-' + totalDiscount.toFixed(2) + ' AED</td><td></td><td></td><td></td></tr>';}function getPurchaseContainers() {  var containers = [];  var seen = {};  purchaseRecs.forEach(function(p) {    if (p.cn && !seen[p.cn]) {      seen[p.cn] = true;      containers.push({        cn: p.cn,        product: p.product,        supplier: p.supplier,        qty: p.qty      });    }  });  return containers.sort(function(a, b) { return a.cn.localeCompare(b.cn); });}function openLogisticsFromPurchase() {  var containers = getPurchaseContainers();  var modal = gid('logisticsFromPurchaseModal');  var list = gid('logistics-purchase-list');  if (containers.length === 0) {    toast('暂无采购记录 / No purchase records', 'err');    return;  }  list.innerHTML = containers.map(function(c) {    var existingFee = getLogisticsFees().find(function(f) { return f.cn === c.cn; });    var badge = existingFee ? '<span style="background:#4CAF50;color:#fff;font-size:10px;padding:1px 4px;border-radius:2px">已添加</span>' : '';    return '<div style="padding:8px 12px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center">' +      '<div><strong>' + c.cn + '</strong><br><span style="font-size:12px;color:#666">' + w1ProductHtml(c.product) + '</span></div>' +      '<div>' + badge + ' <button class="abtn" style="background:#4CAF50;color:#fff;border:none;padding:4px 8px;border-radius:3px" onclick="selectLogisticsCn(\'' + c.cn + '\')">+ 添加</button></div>' +      '</div>';  }).join('');  modal.classList.add('sh');}function clLogisticsFromPurchaseModal() {  gid('logisticsFromPurchaseModal').classList.remove('sh');}function selectLogisticsCn(cn) {  clLogisticsFromPurchaseModal();  openLogisticsAddForm('');  gid('logistics-cn').value = cn;}
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
    out.sort(function(a, b) {
      var an = String(a.orderNo || '');
      var bn = String(b.orderNo || '');
      if (an && bn) return bn.localeCompare(an, undefined, { numeric: true });
      if (an && !bn) return -1;
      if (!an && bn) return 1;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  } else {
    out.sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
  }
  return out;
}
function csmSalesLocalYmdCompact(d) {
  d = d || new Date();
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var da = ('0' + d.getDate()).slice(-2);
  return '' + y + m + da;
}
function csmSalesNextOrderNoForDate(ymdCompact) {
  var prefix = 'SO-' + ymdCompact + '-';
  var maxN = 0;
  (salesOrders || []).forEach(function(o) {
    var on = String(o.orderNo || '');
    if (on.indexOf(prefix) !== 0) return;
    var tail = parseInt(on.slice(prefix.length), 10);
    if (!isNaN(tail) && tail > maxN) maxN = tail;
  });
  return prefix + ('000' + (maxN + 1)).slice(-3);
}
function csmSalesLinesRawToArr(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.slice();
  if (typeof raw === 'object') {
    return Object.keys(raw)
      .filter(function(k) { return /^\d+$/.test(k); })
      .sort(function(a, b) { return (+a) - (+b); })
      .map(function(k) { return raw[k]; })
      .filter(function(x) { return x && typeof x === 'object'; });
  }
  return [];
}
function csmSalesLineVatMode(L, order) {
  if (L && (L.vatMode === 'included' || L.vatMode === 'excluded')) return L.vatMode;
  if (order && order.vatMode === 'included') return 'included';
  return 'excluded';
}
function csmSalesNormalizeLinesFromOrder(o) {
  if (!o) return [];
  var arr = [];
  csmSalesLinesRawToArr(o.lines).forEach(function(L, idx) {
    if (!L || typeof L !== 'object') return;
    var cn = String(L.containerNo || '').trim().toUpperCase();
    var pr = canonicalProductName(String(L.productName || '').trim());
    var q = parseFloat(L.quantity);
    var u = parseFloat(L.unitPrice);
    if (!cn || !pr || !(q > 0) || !(u >= 0)) return;
    var vmLine = (L.vatMode === 'included' || L.vatMode === 'excluded') ? L.vatMode : csmSalesLineVatMode(null, o);
    arr.push({
      containerNo: cn,
      productName: pr,
      quantity: q,
      unitPrice: u,
      vatMode: vmLine,
      workerId: String(L.workerId || '').trim(),
      workerName: String(L.workerName || '').trim(),
      workerQty: parseFloat(L.workerQty) || 0,
      workerRate: parseFloat(L.workerRate) || 0,
      workerAmount: parseFloat(L.workerAmount) || 0,
      truckId: String(L.truckId || '').trim(),
      truckName: String(L.truckName || '').trim(),
      truckQty: parseFloat(L.truckQty) || 0,
      truckRate: parseFloat(L.truckRate) || 0,
      truckAmount: parseFloat(L.truckAmount) || 0,
      _lineIndex: idx
    });
  });
  if (!arr.length) {
    var cn0 = String(o.containerNo || '').trim().toUpperCase();
    var pr0 = canonicalProductName(String(o.productName || '').trim());
    var q0 = parseFloat(o.quantity);
    var u0 = parseFloat(o.unitPrice);
    if (cn0 && pr0 && q0 > 0 && (u0 >= 0 || u0 === 0)) {
      arr.push({
        containerNo: cn0,
        productName: pr0,
        quantity: q0,
        unitPrice: u0,
        vatMode: csmSalesLineVatMode(null, o),
        workerId: String(o.workerId || '').trim(),
        workerName: String(o.workerName || '').trim(),
        workerQty: parseFloat(o.workerQty) || 0,
        workerRate: parseFloat(o.workerRate) || 0,
        workerAmount: parseFloat(o.workerAmount) || 0,
        truckId: String(o.truckId || '').trim(),
        truckName: String(o.truckName || '').trim(),
        truckQty: parseFloat(o.truckQty) || 0,
        truckRate: parseFloat(o.truckRate) || 0,
        truckAmount: parseFloat(o.truckAmount) || 0,
        _lineIndex: 0
      });
    }
  }
  return arr;
}
function csmSalesLineKey(L) {
  return (L.containerNo || '').toUpperCase() + '\x1e' + (L.productName || '');
}
function csmSalesLineQtyMap(lines) {
  var map = {};
  (lines || []).forEach(function(L) {
    var k = csmSalesLineKey(L);
    map[k] = (map[k] || 0) + (parseFloat(L.quantity) || 0);
  });
  return map;
}
function csmSalesPurchaseDeltaForLinesSave(existingOrder, newLines) {
  var oldLines = existingOrder && !existingOrder.voided ? csmSalesNormalizeLinesFromOrder(existingOrder) : [];
  var oldMap = csmSalesLineQtyMap(oldLines);
  var newMap = csmSalesLineQtyMap(newLines);
  var keys = {};
  Object.keys(oldMap).forEach(function(k) { keys[k] = true; });
  Object.keys(newMap).forEach(function(k) { keys[k] = true; });
  var promises = [];
  Object.keys(keys).forEach(function(k) {
    var oq = oldMap[k] || 0;
    var nq = newMap[k] || 0;
    var d = oq - nq;
    if (d === 0) return;
    var sep = k.indexOf('\x1e');
    var cn = sep >= 0 ? k.slice(0, sep) : '';
    var pr = sep >= 0 ? k.slice(sep + 1) : '';
    promises.push(csmSalesPurchaseApplyQtyDelta(cn, pr, d));
  });
  if (!promises.length) return Promise.resolve();
  return Promise.all(promises);
}
function csmSalesFormatOrderCreated(iso) {
  if (!iso) return '\u2014';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, { hour12: false });
  } catch (e1) {
    return String(iso);
  }
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
function csmSalesLineTotalForDisplay(o) {
  return csmSalesLineNetVatTotal(o).total;
}
function csmSalesLineNetVatTotal(o) {
  var lines = csmSalesNormalizeLinesFromOrder(o);
  if (lines.length) {
    var net = 0;
    var vat = 0;
    var total = 0;
    lines.forEach(function(L) {
      var vm = csmSalesLineVatMode(L, o);
      var a = csmSalesComputeTotals(L.unitPrice, L.quantity, vm);
      net += a.net;
      vat += a.vat;
      total += a.total;
    });
    return { net: csmSalesRound2(net), vat: csmSalesRound2(vat), total: csmSalesRound2(total) };
  }
  var vatMode = (o && o.vatMode === 'included') ? 'included' : 'excluded';
  var u = parseFloat(o && o.unitPrice);
  var q = parseFloat(o && o.quantity);
  if ((u >= 0 || u === 0) && q > 0) {
    return csmSalesComputeTotals(u, q, vatMode);
  }
  var t = parseFloat(o && o.totalAmount) || 0;
  return { net: 0, vat: 0, total: t };
}
function csmSalesNetUnitAndVatFromLine(L, vatMode) {
  var u = parseFloat(L && L.unitPrice) || 0;
  var q = parseFloat(L && L.quantity) || 0;
  if (q <= 0) return { netUnit: 0, vatAmt: 0 };
  var a = csmSalesComputeTotals(u, q, vatMode);
  return { netUnit: csmSalesRound2(a.net / q), vatAmt: a.vat };
}
function csmSalesOrderReceiverDisplay(o) {
  if (!o) return '';
  var nm = (o.paymentReceiverName || '').trim();
  if (nm) return nm;
  var rid = o.paymentReceiverId;
  if (rid) {
    var pr = salesPaymentReceivers.find(function(x) { return x.id === rid; });
    if (pr) return (pr.name || '').trim();
  }
  return '';
}
function csmSalesProductRateKey(product) {
  return canonicalProductName(String(product || '').trim());
}
function csmSalesNormalizeRateMap(raw) {
  var out = {};
  Object.keys(raw || {}).forEach(function(k) {
    var key = csmSalesProductRateKey(k);
    var val = parseFloat(raw[k]);
    if (!key || !(val >= 0)) return;
    out[key] = val;
  });
  return out;
}
function csmSalesServiceEntryDisplay(entry) {
  return entry ? String(entry.name || '').trim() : '';
}
function csmSalesServiceRate(entry, product) {
  if (!entry) return 0;
  var rates = csmSalesNormalizeRateMap(entry.rates);
  var key = csmSalesProductRateKey(product);
  return key && rates[key] >= 0 ? rates[key] : 0;
}
function csmSalesBuildServiceSelectHtml(list, selectedId, placeholder) {
  var sid = String(selectedId || '').trim();
  var html = '<option value="">' + csmEscapeHtml(placeholder || '—') + '</option>';
  var found = false;
  (list || []).forEach(function(item) {
    var id = String(item.id || '').trim();
    if (!id) return;
    var isSel = sid && id === sid;
    if (isSel) found = true;
    html += '<option value="' + csmAttrEscape(id) + '"' + (isSel ? ' selected' : '') + '>' + csmEscapeHtml(csmSalesServiceEntryDisplay(item) || id) + '</option>';
  });
  if (sid && !found) {
    html += '<option value="' + csmAttrEscape(sid) + '" selected>' + csmEscapeHtml(sid) + '</option>';
  }
  return html;
}
function csmSalesApplyWorkerTruckRatesToLines(linesArr) {
  return (linesArr || []).map(function(L) {
    var workerEnt = L.workerId ? salesWorkers.find(function(x) { return x.id === L.workerId; }) : null;
    var truckEnt = L.truckId ? salesTrucks.find(function(x) { return x.id === L.truckId; }) : null;
    var workerRate = workerEnt ? csmSalesServiceRate(workerEnt, L.productName) : 0;
    var truckRate = truckEnt ? csmSalesServiceRate(truckEnt, L.productName) : 0;
    var workerQty = parseFloat(L.workerQty) || 0;
    var truckQty = parseFloat(L.truckQty) || 0;
    return Object.assign({}, L, {
      workerName: workerEnt ? csmSalesServiceEntryDisplay(workerEnt) : '',
      workerRate: workerRate,
      workerAmount: csmSalesRound2(workerRate * workerQty),
      truckName: truckEnt ? csmSalesServiceEntryDisplay(truckEnt) : '',
      truckRate: truckRate,
      truckAmount: csmSalesRound2(truckRate * truckQty)
    });
  });
}
function csmSalesBuildUpwtRowHtml(L, idx) {
  var workerQtyDisp = L.workerQty != null && L.workerQty !== '' ? String(L.workerQty) : '';
  var truckQtyDisp = L.truckQty != null && L.truckQty !== '' ? String(L.truckQty) : '';
  return '<tr data-upwt-i="' + idx + '">' +
    '<td style="padding:8px;border-bottom:1px solid #eee;vertical-align:middle">' + csmEscapeHtml(L.containerNo) + '</td>' +
    '<td style="padding:8px;border-bottom:1px solid #eee;vertical-align:middle">' + w1ProductHtml(L.productName) + '</td>' +
    '<td style="padding:8px;border-bottom:1px solid #eee;vertical-align:middle">' + csmEscapeHtml(String(L.quantity)) + '</td>' +
    '<td style="padding:8px;border-bottom:1px solid #eee;vertical-align:top">' +
    '<div class="upwt-svc-fields" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;max-width:100%">' +
    '<select class="upwt-worker-id" style="flex:1;min-width:120px;padding:6px;border:1px solid #ccc;border-radius:4px;font-family:var(--csm-font-en);font-weight:700">' +
    csmSalesBuildServiceSelectHtml(salesWorkers, L.workerId, 'Select worker') + '</select>' +
    '<input type="number" class="upwt-worker-qty" min="0" step="any" value="' + (workerQtyDisp === '' ? '' : csmEscapeHtml(workerQtyDisp)) + '" placeholder="Qty" title="Worker Qty (not more than line Qty)" style="width:96px;padding:6px;border:1px solid #ccc;border-radius:4px;font-family:var(--csm-font-en);font-weight:700">' +
    '</div></td>' +
    '<td style="padding:8px;border-bottom:1px solid #eee;vertical-align:top">' +
    '<div class="upwt-svc-fields" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;max-width:100%">' +
    '<select class="upwt-truck-id" style="flex:1;min-width:120px;padding:6px;border:1px solid #ccc;border-radius:4px;font-family:var(--csm-font-en);font-weight:700">' +
    csmSalesBuildServiceSelectHtml(salesTrucks, L.truckId, 'Select truck') + '</select>' +
    '<input type="number" class="upwt-truck-qty" min="0" step="any" value="' + (truckQtyDisp === '' ? '' : csmEscapeHtml(truckQtyDisp)) + '" placeholder="Qty" title="Truck Qty (not more than line Qty)" style="width:96px;padding:6px;border:1px solid #ccc;border-radius:4px;font-family:var(--csm-font-en);font-weight:700">' +
    '</div></td>' +
    '</tr>';
}
function salesUpwtReadLinesFromDom(baseLines) {
  var tb = gid('sales-upwt-lines-body');
  if (!tb) return { err: 'Missing editor' };
  var out = [];
  var err = '';
  for (var i = 0; i < baseLines.length; i++) {
    var L = baseLines[i];
    var tr = tb.querySelector('tr[data-upwt-i="' + i + '"]');
    if (!tr) {
      err = 'Editor row mismatch.';
      break;
    }
    var workerIdEl = tr.querySelector('.upwt-worker-id');
    var workerQtyEl = tr.querySelector('.upwt-worker-qty');
    var truckIdEl = tr.querySelector('.upwt-truck-id');
    var truckQtyEl = tr.querySelector('.upwt-truck-qty');
    var workerId = (workerIdEl && workerIdEl.value || '').trim();
    var workerQtyRaw = workerQtyEl ? String(workerQtyEl.value || '').trim() : '';
    var truckId = (truckIdEl && truckIdEl.value || '').trim();
    var truckQtyRaw = truckQtyEl ? String(truckQtyEl.value || '').trim() : '';
    var workerQty = parseFloat(workerQtyRaw);
    var truckQty = parseFloat(truckQtyRaw);
    var hasWorkerQty = workerQtyRaw !== '' && !isNaN(workerQty) && workerQty >= 0;
    var hasTruckQty = truckQtyRaw !== '' && !isNaN(truckQty) && truckQty >= 0;
    var wPartial = (workerId && !(hasWorkerQty && workerQty > 0)) || (!workerId && hasWorkerQty && workerQty > 0);
    var tPartial = (truckId && !(hasTruckQty && truckQty > 0)) || (!truckId && hasTruckQty && truckQty > 0);
    if (wPartial || tPartial) {
      err = 'If you enter worker or truck, set both name and Qty on each line.';
      break;
    }
    var lineQty = parseFloat(L.quantity) || 0;
    if (workerId && hasWorkerQty && workerQty > lineQty) {
      err = 'Worker Qty cannot exceed line Qty.';
      break;
    }
    if (truckId && hasTruckQty && truckQty > lineQty) {
      err = 'Truck Qty cannot exceed line Qty.';
      break;
    }
    out.push(Object.assign({}, L, {
      workerId: workerId,
      workerQty: workerId ? workerQty : 0,
      truckId: truckId,
      truckQty: truckId ? truckQty : 0
    }));
  }
  if (err) return { err: err };
  return { lines: out };
}
function openSalesOrderUpdateWorkerModal() {
  if (!salesOrdersRef) { toast('Database not connected', 'err'); return; }
  var ids = csmSalesGetSelectedOrderIds();
  if (!ids.length) { toast('Select one order', 'err'); return; }
  if (!csmSalesRequireAtMostOneSelection(ids)) return;
  var o = salesOrders.find(function(x) { return x.id === ids[0]; });
  if (!o || o.voided) { toast('Order not found or voided', 'err'); return; }
  var st = String(o.orderStatus || '').toLowerCase();
  if (st !== 'draft' && st !== 'submitted') {
    toast('Worker / Truck can be updated only for draft or submitted (not yet confirmed) orders.', 'err');
    return;
  }
  var lines = csmSalesNormalizeLinesFromOrder(o);
  if (!lines.length) { toast('This order has no product lines.', 'err'); return; }
  var hid = gid('sales-upwt-order-id');
  var noEl = gid('sales-upwt-order-no');
  var body = gid('sales-upwt-lines-body');
  if (!hid || !body) return;
  hid.value = o.id;
  if (noEl) noEl.textContent = o.orderNo || o.id;
  body.innerHTML = lines.map(function(L, i) { return csmSalesBuildUpwtRowHtml(L, i); }).join('');
  var m = gid('sales-order-upwt-modal');
  if (m) m.classList.add('sh');
}
function clSalesOrderUpwtModal() {
  var m = gid('sales-order-upwt-modal');
  if (m) m.classList.remove('sh');
}
function saveSalesOrderUpdateWorkerTruckFromModal() {
  if (!salesOrdersRef) { toast('Database not connected', 'err'); return; }
  var id = (gid('sales-upwt-order-id') && gid('sales-upwt-order-id').value || '').trim();
  if (!id) return;
  var o = salesOrders.find(function(x) { return x.id === id; });
  if (!o || o.voided) { toast('Order not found or voided', 'err'); return; }
  var st = String(o.orderStatus || '').toLowerCase();
  if (st !== 'draft' && st !== 'submitted') {
    toast('Worker / Truck can be updated only for draft or submitted (not yet confirmed) orders.', 'err');
    return;
  }
  var baseLines = csmSalesNormalizeLinesFromOrder(o);
  var rd = salesUpwtReadLinesFromDom(baseLines);
  if (rd.err) { toast(rd.err, 'err'); return; }
  var newLines = csmSalesApplyWorkerTruckRatesToLines(rd.lines);
  var L0 = newLines[0];
  var nowIso = new Date().toISOString();
  var patch = {
    lines: newLines,
    updatedAt: nowIso,
    containerNo: L0.containerNo,
    productName: L0.productName,
    quantity: L0.quantity,
    unitPrice: L0.unitPrice,
    vatMode: (L0.vatMode === 'included' || L0.vatMode === 'excluded') ? L0.vatMode : (o.vatMode || 'excluded'),
    workerId: L0.workerId || '',
    workerName: L0.workerName || '',
    workerQty: L0.workerQty || 0,
    workerRate: L0.workerRate || 0,
    workerAmount: L0.workerAmount || 0,
    truckId: L0.truckId || '',
    truckName: L0.truckName || '',
    truckQty: L0.truckQty || 0,
    truckRate: L0.truckRate || 0,
    truckAmount: L0.truckAmount || 0
  };
  csmSalesPurchaseDeltaForLinesSave(o, newLines).then(function() {
    return salesOrdersRef.child(id).update(patch);
  }).then(function() {
    toast('Worker / Truck updated', 'ok');
    clSalesOrderUpwtModal();
  }).catch(function(e) { toast('Save failed: ' + (e.message || e), 'err'); });
}
function csmSalesServiceCellHtml(name, qty) {
  qty = parseFloat(qty) || 0;
  var nm = String(name || '').trim();
  if (!nm && !(qty > 0)) return '<span style="color:#999">—</span>';
  return '<div style="font-family:var(--csm-font-en);font-weight:700;line-height:1.35">' +
    '<div>' + csmEscapeHtml(nm || '—') + '</div>' +
    '<div style="font-size:11px;color:#666">Qty: ' + csmEscapeHtml(String(qty || 0)) + ' \u00b7</div>' +
    '</div>';
}
/** Required for admin Confirm only — not for save draft / Submit. */
function csmSalesLineWorkerTruckValidForConfirm(L) {
  if (!L) return false;
  var q = parseFloat(L.quantity) || 0;
  if (!(q > 0)) return false;
  var wid = String(L.workerId || '').trim();
  var tid = String(L.truckId || '').trim();
  var wq = parseFloat(L.workerQty) || 0;
  var tq = parseFloat(L.truckQty) || 0;
  if (!wid || !(wq > 0) || !tid || !(tq > 0)) return false;
  if (wq > q || tq > q) return false;
  return true;
}
function csmSalesNetUnitAndVat(o) {
  var lines = csmSalesNormalizeLinesFromOrder(o);
  if (lines.length) {
    var L0 = lines[0];
    return csmSalesNetUnitAndVatFromLine(L0, csmSalesLineVatMode(L0, o));
  }
  var vatMode = (o && o.vatMode === 'included') ? 'included' : 'excluded';
  var u = parseFloat(o && o.unitPrice) || 0;
  var q = parseFloat(o && o.quantity) || 0;
  if (q <= 0) return { netUnit: 0, vatAmt: 0 };
  return csmSalesNetUnitAndVatFromLine({ unitPrice: u, quantity: q }, vatMode);
}
function csmSalesLocalYmd(d) {
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var da = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + da;
}
function csmSalesOrderTotalAed(o) {
  return csmSalesRound2(csmSalesLineTotalForDisplay(o));
}
function csmSalesOrderArReceivedAed(o) {
  if (!o) return 0;
  var v = parseFloat(o.arReceivedAed);
  if (!isNaN(v) && isFinite(v) && v >= 0) return csmSalesRound2(v);
  return 0;
}
function csmSalesLegacyMarkedPaid(o) {
  if (!o) return false;
  var method = csmSalesGetPaymentMethod(o);
  if (method === 'cash') return true;
  if (String(o.paymentPaidStatus || '').trim() === 'paid') return true;
  if (String(o.paymentStatus || '').trim() === 'paid') return true;
  return false;
}
function csmSalesOrderRemainingAed(o) {
  var t = csmSalesOrderTotalAed(o);
  if (!(t > 0)) return 0;
  if (csmSalesLegacyMarkedPaid(o)) return 0;
  return csmSalesRound2(Math.max(0, t - csmSalesOrderArReceivedAed(o)));
}
function csmSalesOrderReceivedAedForSummary(o) {
  var t = csmSalesOrderTotalAed(o);
  if (!(t > 0)) return 0;
  if (csmSalesLegacyMarkedPaid(o)) return t;
  return csmSalesRound2(Math.min(t, csmSalesOrderArReceivedAed(o)));
}
/** Canonical method: cash | cash_pending | credit (legacy: paymentStatus may be 'paid' or method). */
function csmSalesGetPaymentMethod(o) {
  if (!o) return 'cash_pending';
  var pm = String(o.paymentMethod || '').trim();
  if (pm === 'cash' || pm === 'cash_pending' || pm === 'credit') return pm;
  var ps = String(o.paymentStatus || '').trim();
  if (ps === 'cash' || ps === 'cash_pending' || ps === 'credit') return ps;
  if (ps === 'paid') return '';
  return 'cash_pending';
}
function csmSalesPaymentMethodLabel(method) {
  var m = String(method || '');
  if (m === 'cash') return 'Cash';
  if (m === 'cash_pending') return 'Cash pending';
  if (m === 'credit') return 'Credit';
  return m || '-';
}
/** Fully settled: legacy cash/paid flags, or cumulative arReceivedAed covers line total. */
function csmSalesIsPaymentFinanciallyPaid(o) {
  if (!o) return false;
  return csmSalesOrderRemainingAed(o) <= 0.005;
}
function csmSalesPaymentStatusCellHtml(o) {
  var paid = csmSalesIsPaymentFinanciallyPaid(o);
  return '<span style="font-family:var(--csm-font-en);font-weight:700;color:' + (paid ? '#2e7d32' : '#c62828') + '">' + (paid ? 'Paid' : 'Unpaid') + '</span>';
}
function csmSalesPayLabel(code, forFinance) {
  var c = String(code || '');
  if (c === 'paid') return 'Paid';
  return csmSalesPaymentMethodLabel(c);
}
/** Last column on confirmed orders: Paid (cash or already marked), or Paid Confirm button. */
function csmSalesPaymentConfirmCellHtml(o) {
  if (!o || o.voided) return '\u2014';
  if (String(o.orderStatus || '').toLowerCase() !== 'confirmed') return '\u2014';
  if (csmSalesIsPaymentFinanciallyPaid(o)) {
    return '<span style="font-family:var(--csm-font-en);font-weight:700;color:#2e7d32">Paid</span>';
  }
  var method = csmSalesGetPaymentMethod(o);
  if (method === 'cash_pending' || method === 'credit') {
    var sid = String(o.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return '<button type="button" class="abtn" style="font-family:var(--csm-font-en);font-weight:700" onclick="salesConfirmPaymentPaid(\'' + sid + '\')">Paid Confirm</button>';
  }
  return '<span style="color:#888">\u2014</span>';
}
function salesConfirmPaymentPaid(id) {
  if (!isAdmin) { toast('Admin only', 'err'); return; }
  if (!salesOrdersRef) { toast('Database not connected', 'err'); return; }
  var o = salesOrders.find(function(x) { return x.id === id; });
  if (!o || o.voided || String(o.orderStatus || '').toLowerCase() !== 'confirmed') {
    toast('Order not found or not confirmed', 'err');
    return;
  }
  var method = csmSalesGetPaymentMethod(o);
  if (method !== 'cash_pending' && method !== 'credit') {
    toast('Only Cash pending or Credit can be marked paid here', 'err');
    return;
  }
  var nowIso = new Date().toISOString();
  var tot = csmSalesOrderTotalAed(o);
  salesOrdersRef.child(id).update({
    paymentMethod: method,
    paymentPaidStatus: 'paid',
    paymentStatus: method,
    paymentConfirmedAt: nowIso,
    paymentConfirmedBy: currentUserEmail || currentUser || '',
    arReceivedAed: tot > 0 ? tot : csmSalesOrderArReceivedAed(o),
    updatedAt: nowIso
  }).then(function() {
    toast('Payment set to Paid', 'ok');
  }).catch(function(e) {
    toast(e.message || String(e), 'err');
  });
}
function csmSalesPrintInvoiceCellHtml(o) {
  if (!o || o.voided) return '\u2014';
  if (String(o.orderStatus || '').toLowerCase() !== 'confirmed') return '\u2014';
  var sid = String(o.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return '<button type="button" class="abtn" style="font-family:var(--csm-font-en);font-weight:700;font-size:12px;padding:4px 10px" onclick="salesPrintOrderInvoice(\'' + sid + '\')">Print</button>';
}
function salesPrintOrderInvoice(id) {
  var o = salesOrders.find(function(x) { return x.id === id; });
  if (!o || o.voided || String(o.orderStatus || '').toLowerCase() !== 'confirmed') {
    toast('Order not found or not confirmed', 'err');
    return;
  }
  var lines = csmSalesNormalizeLinesFromOrder(o);
  var tot = csmSalesLineNetVatTotal(o);
  var ht = gid('headerTitle');
  var brand = (ht && ht.textContent) ? String(ht.textContent).trim().replace(/</g, '').replace(/>/g, '') : 'Sales';
  var parts = [];
  parts.push('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>');
  parts.push(csmEscapeHtml(o.orderNo || 'Invoice'));
  parts.push('</title><style>body{font-family:Arial,Helvetica,sans-serif;font-weight:700;padding:24px;color:#1a1a1a;font-size:14px}');
  parts.push('h1{font-size:20px;margin:0 0 8px}h2{font-size:14px;color:#555;margin:0 0 20px;font-weight:700}');
  parts.push('.meta{margin:14px 0}.meta div{margin:5px 0}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}');
  parts.push('th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f5f5f5}');
  parts.push('.num{text-align:right;font-variant-numeric:tabular-nums}.tot{margin-top:18px;max-width:380px;margin-left:auto}');
  parts.push('.tot div{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e0e0e0}');
  parts.push('@media print{body{padding:10px}}</style></head><body>');
  parts.push('<h1>Sales Invoice / 销售发票</h1><h2>' + csmEscapeHtml(brand) + '</h2>');
  parts.push('<div class="meta">');
  parts.push('<div><strong>Order No.</strong> ' + csmEscapeHtml(o.orderNo || '\u2014') + '</div>');
  parts.push('<div><strong>Created</strong> ' + csmEscapeHtml(csmSalesFormatOrderCreated(o.createdAt)) + '</div>');
  parts.push('<div><strong>Confirmed</strong> ' + csmEscapeHtml(csmSalesFormatOrderCreated(o.confirmedAt)) + '</div>');
  parts.push('<div><strong>Customer</strong> ' + csmEscapeHtml(o.customerName || '') + '</div>');
  parts.push('<div><strong>Payment Method</strong> ' + csmEscapeHtml(csmSalesPaymentMethodLabel(csmSalesGetPaymentMethod(o))) + '</div>');
  parts.push('<div><strong>Payment Status</strong> ' + csmEscapeHtml(csmSalesIsPaymentFinanciallyPaid(o) ? 'Paid' : 'Unpaid') + '</div>');
  parts.push('<div><strong>Receiver</strong> ' + csmEscapeHtml(csmSalesOrderReceiverDisplay(o)) + '</div></div>');
  parts.push('<table><thead><tr>');
  parts.push('<th>Container</th><th>Product</th><th class="num">Qty</th><th class="num">Unit (AED)</th><th class="num">Net (AED)</th><th class="num">5% VAT</th><th class="num">Total (AED)</th><th>Worker</th><th>Truck</th></tr></thead><tbody>');
  lines.forEach(function(L) {
    var vm = csmSalesLineVatMode(L, o);
    var nv = csmSalesNetUnitAndVatFromLine(L, vm);
    var a = csmSalesComputeTotals(L.unitPrice, L.quantity, vm);
    parts.push('<tr><td>' + csmEscapeHtml(L.containerNo || '') + '</td><td>' + csmEscapeHtml(L.productName || '') + '</td>');
    parts.push('<td class="num">' + csmEscapeHtml(String(L.quantity != null ? L.quantity : '')) + '</td>');
    parts.push('<td class="num">' + (parseFloat(L.unitPrice) || 0).toFixed(2) + '</td>');
    parts.push('<td class="num">' + nv.netUnit.toFixed(2) + '</td><td class="num">' + nv.vatAmt.toFixed(2) + '</td><td class="num">' + a.total.toFixed(2) + '</td>');
    parts.push('<td>' + csmEscapeHtml(String(L.workerName || '').trim() || '\u2014') + '</td><td>' + csmEscapeHtml(String(L.truckName || '').trim() || '\u2014') + '</td></tr>');
  });
  parts.push('</tbody></table>');
  parts.push('<div class="tot"><div><span>Net (AED)</span><span>' + tot.net.toFixed(2) + '</span></div>');
  parts.push('<div><span>5% VAT (AED)</span><span>' + tot.vat.toFixed(2) + '</span></div>');
  parts.push('<div style="border-bottom:2px solid #333;padding-top:6px;margin-top:4px"><span>Total (AED)</span><span>' + tot.total.toFixed(2) + '</span></div></div>');
  parts.push('<p style="margin-top:22px;font-size:11px;color:#666">Printed ' + csmEscapeHtml(csmSalesFormatOrderCreated(new Date().toISOString())) + '</p>');
  parts.push('</body></html>');
  var docHtml = parts.join('');
  var w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    toast('Pop-up blocked \u2014 allow pop-ups to print', 'err');
    return;
  }
  w.document.write(docHtml);
  w.document.close();
  setTimeout(function() {
    try {
      w.focus();
      w.print();
    } catch (e2) {}
  }, 350);
}
function csmSalesOrderStatusCellHtml(o) {
  if (!o || o.voided) {
    return '<span style="font-family:var(--csm-font-en);font-weight:700;color:inherit">void / \u4F5C\u5E9F</span>';
  }
  var st = String(o.orderStatus || '').toLowerCase();
  var label = st === 'draft' ? 'Draft' : st === 'submitted' ? 'Submitted' : st === 'confirmed' ? 'Confirmed' : String(o.orderStatus || '\u2014');
  return '<span style="font-family:var(--csm-font-en);font-weight:700;color:inherit">' + csmEscapeHtml(label) + '</span>';
}
function csmSalesOrderRowGidAttr(orderId) {
  return 'g' + String(orderId || '').replace(/[^a-zA-Z0-9]/g, '_');
}
function csmSalesToggleOrderSubRows(gidAttr, btn) {
  var esc = String(gidAttr || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  var rows = document.querySelectorAll('tr.csm-sales-ord-sub[data-so-gid="' + esc + '"]');
  var open = btn.textContent === '-';
  rows.forEach(function(r) { r.style.display = open ? 'none' : 'table-row'; });
  btn.textContent = open ? '+' : '-';
}
function csmEscapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function csmAttrEscape(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
/** JSON for use inside double-quoted HTML onclick="..." (avoids breaking on embedded quotes). */
function csmHtmlAttrJson(val) {
  return JSON.stringify(val == null ? '' : val).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
function csmSalesCustomerNameFull(c) {
  if (!c) return '';
  var f = (c.nameFull != null && String(c.nameFull).trim()) ? String(c.nameFull).trim() : '';
  if (f) return f;
  return String(c.name || '').trim();
}
function csmSalesCustomerShortName(c) {
  if (!c) return '';
  return String(c.shortName || '').trim();
}
function csmSalesCustomerSearchBlob(c) {
  return [csmSalesCustomerNameFull(c), csmSalesCustomerShortName(c), c.name, c.phone, c.email, c.address]
    .map(function(x) { return String(x || '').toLowerCase(); }).join(' ');
}
function csmSalesCustomerMatchesQuery(c, q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return true;
  var blob = csmSalesCustomerSearchBlob(c);
  if (blob.indexOf(q) >= 0) return true;
  var parts = q.split(/\s+/).filter(Boolean);
  return parts.every(function(p) { return blob.indexOf(p) >= 0; });
}
function csmSalesCustomerListLabel(c) {
  var f = csmSalesCustomerNameFull(c);
  var s = csmSalesCustomerShortName(c);
  if (s && f) return s + ' — ' + f;
  return f || s || '';
}
function csmSalesCustomerOrderSnapshotName(c) {
  var f = csmSalesCustomerNameFull(c);
  var s = csmSalesCustomerShortName(c);
  if (s && f) return f + ' (' + s + ')';
  return f || s || '';
}
function refreshSalesUi() {
  csmSyncRoleFromWindow();
  if (!isAdmin && !isStaff) return;
  renderSalesDashCustomerAr();
  renderSalesCustomersTable();
  renderSalesOrdersTable();
  renderSalesFinanceTable();
  renderFinWtPanel();
  var soModal = gid('sales-order-modal');
  var prSel = gid('sales-order-payment-receiver');
  if (soModal && prSel && soModal.classList.contains('sh')) {
    var cur = prSel.value;
    salesFillPaymentReceiverSelect(prSel, cur);
    salesOrderRefreshServiceSelectorsInDom();
  }
  if (soModal && soModal.classList.contains('sh')) {
    var cid = gid('sales-order-customer-id');
    if (cid && cid.value) salesOrderCustomerComboSet(cid.value);
    var oidEl = gid('sales-order-id');
    salesOrderApplyCustomerLockState(!!(oidEl && oidEl.value));
  }
  var prM = gid('sales-payment-receivers-modal');
  if (prM && prM.classList.contains('sh')) {
    renderSalesPaymentReceiversManageTable();
  }
  var wtM = gid('sales-worker-truck-modal');
  if (wtM && wtM.classList.contains('sh')) {
    renderSalesWorkerTruckManageUi();
  }
  try { renderCompanyFinancialPending(); } catch (eFinP) {}
  try { renderCompanyFinancialPendingCustoms(); } catch (eFinPc) {}
  try { renderCompanyFinancialWorkspace(); } catch (eFinW) {}
  try {
    var tcFin = document.getElementById('tc-sales_finance');
    if (tcFin && tcFin.classList.contains('ac')) renderFinCnReconTable();
  } catch (eRr) {}
}
function csmFinNum(v) {
  var n = Number(v);
  return isFinite(n) ? n : 0;
}
function csmFinMoney(n) {
  return 'AED ' + csmFinNum(csmSalesRound2(n)).toFixed(2);
}
function csmFinFmt(n) {
  return csmFinNum(csmSalesRound2(n)).toFixed(2);
}
function csmFinIsoDateOnly(iso) {
  var s = String(iso || '').trim();
  if (!s) return '';
  return s.slice(0, 10);
}
function csmFinQuarterLabelFromIso(iso) {
  var d = new Date(iso || '');
  if (isNaN(d.getTime())) return 'Current quarter';
  var q = Math.floor(d.getMonth() / 3) + 1;
  return d.getFullYear() + ' Q' + q;
}
function csmFinMonthLabelFromIso(iso) {
  var d = new Date(iso || '');
  if (isNaN(d.getTime())) return 'Current month';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}
function csmFinSampleAccounts() {
  return [
    { code: '1000', name: 'Cash on Hand', type: 'asset' },
    { code: '1010', name: 'Bank Current Account', type: 'asset' },
    { code: '1100', name: 'Accounts Receivable', type: 'asset' },
    { code: '1300', name: 'Input VAT Recoverable', type: 'asset' },
    { code: '2000', name: 'Accounts Payable', type: 'liability' },
    { code: '2200', name: 'Output VAT Payable', type: 'liability' },
    { code: '2400', name: 'Corporate Tax Payable', type: 'liability' },
    { code: '4000', name: 'Cold Store Revenue', type: 'income' },
    { code: '5000', name: 'Worker Expense', type: 'expense' },
    { code: '5010', name: 'Truck Expense', type: 'expense' },
    { code: '9998', name: 'Suspense / Review', type: 'equity' }
  ];
}
function csmFinIntegrationDefinitions() {
  return [
    {
      source: 'Sales order / customer billing',
      eventType: 'sales_invoice_confirmed',
      inboxPath: 'csm_fin/inbox/sales',
      ledgerArea: 'GL + AR + Output VAT',
      requiredFields: 'sourceId, bizDate, customerId, amountNet, amountTax, amountGross, vatCode, links.orderId'
    },
    {
      source: 'Customer payment',
      eventType: 'customer_receipt_received',
      inboxPath: 'csm_fin/inbox/customer_receipts',
      ledgerArea: 'Cash/Bank + AR',
      requiredFields: 'sourceId, bizDate, customerId, paymentMethod, amountGross, allocations, links.paymentId'
    },
    {
      source: 'Supplier invoice / purchase cost',
      eventType: 'supplier_invoice_posted',
      inboxPath: 'csm_fin/inbox/suppliers',
      ledgerArea: 'AP + Expense + Input VAT',
      requiredFields: 'sourceId, bizDate, supplierId, amountNet, amountTax, amountGross, vatCode, links.purchaseId'
    },
    {
      source: 'Logistics fee',
      eventType: 'logistics_fee_confirmed',
      inboxPath: 'csm_fin/inbox/logistics',
      ledgerArea: 'AP/Cash + Logistics Expense',
      requiredFields: 'sourceId, bizDate, vendorId, containerNo, amountGross, paymentMethod, links.logisticsId'
    },
    {
      source: 'Worker settlement',
      eventType: 'worker_expense_approved',
      inboxPath: 'csm_fin/inbox/workers',
      ledgerArea: 'Worker Expense + Cash/Bank/AP',
      requiredFields: 'sourceId, bizDate, workerId, amountGross, approvalState, links.batchId'
    },
    {
      source: 'Truck / transport settlement',
      eventType: 'transport_expense_approved',
      inboxPath: 'csm_fin/inbox/transport',
      ledgerArea: 'Truck Expense + Cash/Bank/AP',
      requiredFields: 'sourceId, bizDate, truckId, amountGross, approvalState, links.batchId'
    },
    {
      source: 'Customs clearance company bill (demurrage / fees)',
      eventType: 'customs_clearance_fee_request',
      inboxPath: 'csm_fin/pending_customs_fees',
      ledgerArea: 'AP + clearance / cold / logistics expense (post-approval payment)',
      requiredFields: 'sourceId, bizDate, containerNo, bl, lines.logistics|coldFee|attestation|repack|waste|wasteCharge|other, status, submittedBy'
    },
    {
      source: 'Manual finance adjustment',
      eventType: 'finance_manual_adjustment',
      inboxPath: 'csm_fin/inbox/manual',
      ledgerArea: 'GL + Tax + Close',
      requiredFields: 'sourceId, bizDate, amountNet, amountTax, amountGross, approvalState, snapshot'
    }
  ];
}
function csmFinReservedRefsSnapshot() {
  return [
    ['Root', 'csm_fin'],
    ['Inbox', 'csm_fin/inbox'],
    ['Journals', 'csm_fin/journals'],
    ['Journal lines', 'csm_fin/journal_lines'],
    ['Accounts receivable', 'csm_fin/subledgers/ar'],
    ['Accounts payable', 'csm_fin/subledgers/ap'],
    ['Cash ledger', 'csm_fin/accounts/cash'],
    ['Bank ledger', 'csm_fin/accounts/bank'],
    ['VAT centre', 'csm_fin/tax/vat'],
    ['Corporate Tax', 'csm_fin/tax/corporate_tax']
  ];
}
function csmFinPushLine(lines, accountCode, accountName, debit, credit, meta) {
  lines.push({
    accountCode: accountCode,
    accountName: accountName,
    debit: csmSalesRound2(csmFinNum(debit)),
    credit: csmSalesRound2(csmFinNum(credit)),
    meta: meta || null
  });
}
function csmFinCreateJournal(base) {
  var lines = [];
  return {
    id: base.id,
    voucherNo: base.voucherNo,
    journalDate: base.journalDate,
    source: base.source,
    status: base.status || 'posted',
    description: base.description || '',
    refId: base.refId || '',
    lines: lines
  };
}
function csmFinBuildJournals() {
  var journals = [];
  (salesOrders || []).forEach(function(o) {
    if (!o || o.voided || String(o.orderStatus || '').toLowerCase() !== 'confirmed') return;
    var lines = csmSalesNormalizeLinesFromOrder(o);
    if (!lines.length) return;
    var total = 0;
    var vat = 0;
    var net = 0;
    lines.forEach(function(L) {
      var calc = csmSalesComputeTotals(L.unitPrice, L.quantity, csmSalesLineVatMode(L, o));
      total += csmFinNum(calc.total);
      vat += csmFinNum(calc.vat);
      net += csmFinNum(calc.net);
    });
    total = csmSalesRound2(total);
    vat = csmSalesRound2(vat);
    net = csmSalesRound2(net);
    var method = csmSalesGetPaymentMethod(o);
    var debitCode = method === 'cash' ? '1000' : '1100';
    var debitName = method === 'cash' ? 'Cash on Hand' : 'Accounts Receivable';
    var j = csmFinCreateJournal({
      id: 'sale_' + o.id,
      voucherNo: 'SJ-' + String(o.orderNo || o.id || '').replace(/\s+/g, ''),
      journalDate: o.confirmedAt || o.createdAt || '',
      source: 'Sales Order',
      description: 'Confirmed sales order ' + (o.orderNo || o.id || ''),
      refId: o.id || ''
    });
    csmFinPushLine(j.lines, debitCode, debitName, total, 0, { customer: o.customerName || '' });
    csmFinPushLine(j.lines, '4000', 'Cold Store Revenue', 0, net, { customer: o.customerName || '' });
    if (vat > 0) csmFinPushLine(j.lines, '2200', 'Output VAT Payable', 0, vat, { customer: o.customerName || '' });
    journals.push(j);
  });
  (salesPayments || []).forEach(function(p) {
    if (!p) return;
    var cash = csmSalesRound2(csmFinNum(p.cashAed));
    var bank = csmSalesRound2(csmFinNum(p.checkAed));
    var discount = csmSalesRound2(csmFinNum(p.discountAed));
    var allocs = p.allocations || [];
    if (!(cash > 0 || bank > 0 || discount > 0 || allocs.length)) return;
    var credited = 0;
    allocs.forEach(function(a) { credited += csmFinNum(a.amountAed); });
    credited = csmSalesRound2(credited + discount);
    if (!(credited > 0)) credited = csmSalesRound2(csmFinNum(p.actualReceivedAed) + discount);
    var j = csmFinCreateJournal({
      id: 'receipt_' + p.id,
      voucherNo: 'RV-' + String(p.id || '').replace(/^cpay_/, '').toUpperCase(),
      journalDate: p.createdAt || '',
      source: 'Customer Receipt',
      description: 'Receipt from ' + (p.customerNameSnapshot || 'customer'),
      refId: p.id || ''
    });
    if (cash > 0) csmFinPushLine(j.lines, '1000', 'Cash on Hand', cash, 0, null);
    if (bank > 0) csmFinPushLine(j.lines, '1010', 'Bank Current Account', bank, 0, null);
    if (discount > 0) csmFinPushLine(j.lines, '9998', 'Suspense / Review', discount, 0, { note: 'Discount to map to dedicated account later' });
    csmFinPushLine(j.lines, '1100', 'Accounts Receivable', 0, credited, { customer: p.customerNameSnapshot || '' });
    var payDebit = csmSalesRound2(cash + bank + discount);
    if (Math.abs(payDebit - credited) > 0.02) {
      if (payDebit > credited) csmFinPushLine(j.lines, '9998', 'Suspense / Review', 0, csmSalesRound2(payDebit - credited), { note: 'Auto-balance adjustment' });
      else csmFinPushLine(j.lines, '9998', 'Suspense / Review', csmSalesRound2(credited - payDebit), 0, { note: 'Auto-balance adjustment' });
    }
    journals.push(j);
  });
  (salesWtSettlements || []).forEach(function(b) {
    if (!b || !csmFinWtIsPaid(b)) return;
    var workerAmt = 0;
    var truckAmt = 0;
    (b.linesSnapshot || []).forEach(function(L) {
      workerAmt += csmFinNum(L.workerAmount);
      truckAmt += csmFinNum(L.truckAmount);
    });
    workerAmt = csmSalesRound2(workerAmt);
    truckAmt = csmSalesRound2(truckAmt);
    var payAmt = csmSalesRound2(csmFinNum(b.paymentAmount));
    if (!(workerAmt > 0 || truckAmt > 0 || payAmt > 0)) return;
    var j = csmFinCreateJournal({
      id: 'settle_' + b.id,
      voucherNo: 'PV-' + String(b.id || '').replace(/\s+/g, '').toUpperCase(),
      journalDate: b.paidAt || b.createdAt || '',
      source: 'Worker/Truck Settlement',
      description: 'Settlement batch ' + (b.id || ''),
      refId: b.id || ''
    });
    if (workerAmt > 0) csmFinPushLine(j.lines, '5000', 'Worker Expense', workerAmt, 0, null);
    if (truckAmt > 0) csmFinPushLine(j.lines, '5010', 'Truck Expense', truckAmt, 0, null);
    if (payAmt > 0) csmFinPushLine(j.lines, '1010', 'Bank Current Account', 0, payAmt, null);
    var settleDebit = csmSalesRound2(workerAmt + truckAmt);
    if (Math.abs(settleDebit - payAmt) > 0.02) {
      if (settleDebit > payAmt) csmFinPushLine(j.lines, '9998', 'Suspense / Review', 0, csmSalesRound2(settleDebit - payAmt), { note: 'Settlement difference review' });
      else csmFinPushLine(j.lines, '9998', 'Suspense / Review', csmSalesRound2(payAmt - settleDebit), 0, { note: 'Settlement difference review' });
    }
    journals.push(j);
  });
  journals.sort(function(a, b) {
    return String(b.journalDate || '').localeCompare(String(a.journalDate || '')) || String(b.voucherNo || '').localeCompare(String(a.voucherNo || ''));
  });
  return journals;
}
function csmFinBuildDetailRows(journals) {
  var rows = [];
  journals.forEach(function(j) {
    (j.lines || []).forEach(function(line, idx) {
      rows.push({
        id: j.id + ':' + idx,
        journalDate: j.journalDate || '',
        voucherNo: j.voucherNo || '',
        description: j.description || '',
        source: j.source || '',
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: csmFinNum(line.debit),
        credit: csmFinNum(line.credit)
      });
    });
  });
  rows.sort(function(a, b) {
    var d = String(a.journalDate || '').localeCompare(String(b.journalDate || ''));
    if (d !== 0) return d;
    return String(a.voucherNo || '').localeCompare(String(b.voucherNo || ''));
  });
  return rows;
}
function csmFinBuildSummary() {
  var sum = {
    confirmedRevenueAed: 0,
    outputVatAed: 0,
    confirmedOrders: 0,
    receiptsAed: 0,
    cashAed: 0,
    bankAed: 0,
    pendingApprovalAed: 0,
    pendingApprovalCount: 0
  };
  (salesOrders || []).forEach(function(o) {
    if (!o || o.voided || String(o.orderStatus || '').toLowerCase() !== 'confirmed') return;
    sum.confirmedOrders += 1;
    csmSalesNormalizeLinesFromOrder(o).forEach(function(L) {
      var calc = csmSalesComputeTotals(L.unitPrice, L.quantity, csmSalesLineVatMode(L, o));
      sum.confirmedRevenueAed += csmFinNum(calc.total);
      sum.outputVatAed += csmFinNum(calc.vat);
    });
  });
  (salesPayments || []).forEach(function(p) {
    if (!p) return;
    var cash = csmFinNum(p.cashAed);
    var bank = csmFinNum(p.checkAed);
    var actual = p.actualReceivedAed != null ? csmFinNum(p.actualReceivedAed) : (cash + bank);
    sum.cashAed += cash;
    sum.bankAed += bank;
    sum.receiptsAed += actual;
  });
  (salesWtSettlements || []).forEach(function(b) {
    if (!b || !csmFinWtIsAwaitingPayment(b)) return;
    sum.pendingApprovalCount += 1;
    sum.pendingApprovalAed += csmFinNum(b.grossAed);
  });
  (customsFeeRequests || []).forEach(function(r) {
    if (!r || String(r.status || 'pending') !== 'pending') return;
    sum.pendingApprovalCount += 1;
    sum.pendingApprovalAed += csmFinCustomsLinesTotal(r.lines);
  });
  return sum;
}
function csmFinBuildWorkspaceState() {
  var summary = csmFinBuildSummary();
  var journals = csmFinBuildJournals();
  var detailRows = csmFinBuildDetailRows(journals);
  var accounts = csmFinSampleAccounts();
  var latestIso = '';
  journals.forEach(function(j) {
    if (!latestIso || String(j.journalDate || '') > latestIso) latestIso = String(j.journalDate || '');
  });
  var workerExpense = 0;
  var truckExpense = 0;
  detailRows.forEach(function(r) {
    if (r.accountCode === '5000') workerExpense += r.debit - r.credit;
    if (r.accountCode === '5010') truckExpense += r.debit - r.credit;
  });
  workerExpense = csmSalesRound2(workerExpense);
  truckExpense = csmSalesRound2(truckExpense);
  return {
    summary: summary,
    journals: journals,
    detailRows: detailRows,
    accounts: accounts,
    tax: {
      monthLabel: csmFinMonthLabelFromIso(latestIso || new Date().toISOString()),
      quarterLabel: csmFinQuarterLabelFromIso(latestIso || new Date().toISOString()),
      inputVatAed: 0,
      outputVatAed: csmSalesRound2(summary.outputVatAed),
      netVatAed: csmSalesRound2(summary.outputVatAed),
      taxableProfitAed: csmSalesRound2(summary.confirmedRevenueAed - workerExpense - truckExpense),
      corpTaxRatePct: 9,
      workerExpenseAed: workerExpense,
      truckExpenseAed: truckExpense
    }
  };
}
function swCompanyFinView(view) {
  var views = ['dashboard', 'gl', 'detail', 'cashbank', 'tax', 'pending', 'paymentapp'];
  if (isStaff) {
    companyFinView = 'pending';
  } else {
    companyFinView = view || 'dashboard';
    if (views.indexOf(companyFinView) === -1) companyFinView = 'dashboard';
  }
  try { sessionStorage.setItem('csm_company_fin_view', companyFinView); } catch (e0) {}
  views.forEach(function(key) {
    var panel = gid('company-fin-panel-' + key);
    if (panel) panel.style.display = key === companyFinView ? 'block' : 'none';
    var btn = gid('company-fin-btn-' + key);
    if (btn) {
      btn.classList.toggle('btn-s', key === companyFinView);
      btn.classList.toggle('btn-g', key !== companyFinView);
    }
  });
  if (companyFinView === 'detail') renderCompanyFinDetailTable();
  if (companyFinView === 'pending') {
    try { renderCompanyFinancialPending(); } catch (e1) {}
    try { renderCompanyFinancialPendingCustoms(); } catch (e2) {}
  }
}
try { window.swCompanyFinView = swCompanyFinView; } catch (eCFW) {}
function renderCompanyFinPendingBadge(state) {
  var el = gid('company-fin-pending-badge');
  if (!el) return;
  var count = state && state.summary ? csmFinNum(state.summary.pendingApprovalCount) : 0;
  el.textContent = String(count);
}
function renderCompanyFinSnapshotCards(state) {
  var el = gid('company-fin-snapshot-cards');
  if (!el) return;
  var cards = [
    ['Journal vouchers', String(state.journals.length)],
    ['Ledger lines', String(state.detailRows.length)],
    ['Chart of accounts', String(state.accounts.length)],
    ['VAT period', state.tax.monthLabel],
    ['Reserved refs', String(csmFinReservedRefsSnapshot().length)]
  ];
  el.innerHTML = cards.map(function(card) {
    return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#f8fafc">' +
      '<div style="font-size:12px;color:#64748b;font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(card[0]) + '</div>' +
      '<div style="margin-top:6px;font-size:20px;color:#0f172a;font-family:var(--csm-font-en);font-weight:800">' + csmEscapeHtml(card[1]) + '</div>' +
      '</div>';
  }).join('');
}
function renderCompanyFinInterfacesTable() {
  var tb = gid('tb-company-fin-interfaces');
  if (!tb) return;
  var defs = csmFinIntegrationDefinitions();
  tb.innerHTML = defs.map(function(d) {
    return '<tr>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(d.source) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7;font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(d.eventType) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7"><code>' + csmEscapeHtml(d.inboxPath) + '</code></td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(d.ledgerArea) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7;color:#475569">' + csmEscapeHtml(d.requiredFields) + '</td>' +
      '</tr>';
  }).join('');
}
function renderCompanyFinGlTable(state) {
  var tb = gid('tb-company-fin-gl');
  var sumEl = gid('company-fin-gl-summary');
  if (!tb) return;
  if (sumEl) {
    sumEl.textContent = state.journals.length + ' voucher(s) generated';
  }
  if (!state.journals.length) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:#94a3b8">No journal data available.</td></tr>';
    return;
  }
  tb.innerHTML = state.journals.map(function(j) {
    var debit = 0, credit = 0;
    (j.lines || []).forEach(function(line) {
      debit += csmFinNum(line.debit);
      credit += csmFinNum(line.credit);
    });
    return '<tr>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7;font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(j.voucherNo) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(csmSalesFormatOrderCreated(j.journalDate)) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(j.source) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(j.description) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7;text-align:right">' + csmFinFmt(debit) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7;text-align:right">' + csmFinFmt(credit) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(j.status) + '</td>' +
      '</tr>';
  }).join('');
}
function renderCompanyFinDetailFilter(state) {
  var sel = gid('company-fin-account-filter');
  if (!sel) return;
  var current = String(sel.value || 'all');
  var options = ['<option value="all">All accounts</option>'];
  state.accounts.forEach(function(a) {
    options.push('<option value="' + csmEscapeHtml(a.code) + '"' + (current === a.code ? ' selected' : '') + '>' + csmEscapeHtml(a.code + ' - ' + a.name) + '</option>');
  });
  sel.innerHTML = options.join('');
  if (current && current !== 'all' && !state.accounts.some(function(a) { return a.code === current; })) {
    sel.value = 'all';
  }
}
function renderCompanyFinDetailTable() {
  var tb = gid('tb-company-fin-detail');
  if (!tb) return;
  var state = csmFinBuildWorkspaceState();
  renderCompanyFinDetailFilter(state);
  var code = gid('company-fin-account-filter') ? String(gid('company-fin-account-filter').value || 'all') : 'all';
  var rows = state.detailRows.filter(function(r) { return code === 'all' || r.accountCode === code; });
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:#94a3b8">No ledger lines for this account.</td></tr>';
    return;
  }
  var running = 0;
  tb.innerHTML = rows.map(function(r) {
    running = csmSalesRound2(running + r.debit - r.credit);
    return '<tr>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(csmSalesFormatOrderCreated(r.journalDate)) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7;font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(r.voucherNo) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(r.accountName + ' · ' + r.description) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7;text-align:right">' + csmFinFmt(r.debit) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7;text-align:right">' + csmFinFmt(r.credit) + '</td>' +
      '<td style="padding:8px 10px;border-top:1px solid #eef2f7;text-align:right">' + csmFinFmt(running) + '</td>' +
      '</tr>';
  }).join('');
}
try { window.renderCompanyFinDetailTable = renderCompanyFinDetailTable; } catch (eCFD) {}
function renderCompanyFinCashBankPanels(state) {
  var cashRows = state.detailRows.filter(function(r) { return r.accountCode === '1000'; });
  var bankRows = state.detailRows.filter(function(r) { return r.accountCode === '1010'; });
  var cashTb = gid('tb-company-fin-cash');
  var bankTb = gid('tb-company-fin-bank');
  var cashSum = gid('company-fin-cash-summary');
  var bankSum = gid('company-fin-bank-summary');
  if (cashSum) cashSum.textContent = 'Current cash movement balance: ' + csmFinMoney(state.summary.cashAed);
  if (bankSum) bankSum.textContent = 'Current bank movement balance: ' + csmFinMoney(state.summary.bankAed);
  if (cashTb) {
    cashTb.innerHTML = cashRows.length ? cashRows.map(function(r) {
      return '<tr><td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(csmSalesFormatOrderCreated(r.journalDate)) + '</td><td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(r.voucherNo) + '</td><td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(r.description) + '</td><td style="padding:8px 10px;border-top:1px solid #eef2f7;text-align:right">' + csmFinFmt(r.debit - r.credit) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" style="text-align:center;padding:16px;color:#94a3b8">No cash movements yet.</td></tr>';
  }
  if (bankTb) {
    bankTb.innerHTML = bankRows.length ? bankRows.map(function(r) {
      return '<tr><td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(csmSalesFormatOrderCreated(r.journalDate)) + '</td><td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(r.voucherNo) + '</td><td style="padding:8px 10px;border-top:1px solid #eef2f7">' + csmEscapeHtml(r.description) + '</td><td style="padding:8px 10px;border-top:1px solid #eef2f7;text-align:right">' + csmFinFmt(r.debit - r.credit) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" style="text-align:center;padding:16px;color:#94a3b8">No bank movements yet.</td></tr>';
  }
}
function renderCompanyFinTaxPanels(state) {
  var vatEl = gid('company-fin-vat-summary');
  var taxEl = gid('company-fin-tax-summary');
  if (vatEl) {
    vatEl.innerHTML =
      '<div><strong>VAT period:</strong> ' + csmEscapeHtml(state.tax.monthLabel) + '</div>' +
      '<div><strong>Output VAT:</strong> ' + csmEscapeHtml(csmFinMoney(state.tax.outputVatAed)) + '</div>' +
      '<div><strong>Input VAT:</strong> ' + csmEscapeHtml(csmFinMoney(state.tax.inputVatAed)) + '</div>' +
      '<div><strong>Net VAT payable:</strong> ' + csmEscapeHtml(csmFinMoney(state.tax.netVatAed)) + '</div>' +
      '<div style="margin-top:10px;color:#64748b">Next step: connect purchase and supplier invoices to post Input VAT and period adjustments into <code>csm_fin/tax/vat</code>.</div>';
  }
  if (taxEl) {
    var taxable = csmFinNum(state.tax.taxableProfitAed);
    var provision = csmSalesRound2(Math.max(0, taxable) * (csmFinNum(state.tax.corpTaxRatePct) / 100));
    taxEl.innerHTML =
      '<div><strong>Tax period:</strong> ' + csmEscapeHtml(state.tax.quarterLabel) + '</div>' +
      '<div><strong>Approx. taxable profit:</strong> ' + csmEscapeHtml(csmFinMoney(taxable)) + '</div>' +
      '<div><strong>Worker expense included:</strong> ' + csmEscapeHtml(csmFinMoney(state.tax.workerExpenseAed)) + '</div>' +
      '<div><strong>Truck expense included:</strong> ' + csmEscapeHtml(csmFinMoney(state.tax.truckExpenseAed)) + '</div>' +
      '<div><strong>Example provision rate:</strong> ' + csmEscapeHtml(String(state.tax.corpTaxRatePct)) + '%</div>' +
      '<div><strong>Example tax provision:</strong> ' + csmEscapeHtml(csmFinMoney(provision)) + '</div>' +
      '<div style="margin-top:10px;color:#64748b">Use this as a framework placeholder; final Corporate Tax rules, adjustments and exemptions should be configured in finance settings before filing.</div>';
  }
}
function renderCompanyFinancialWorkspace() {
  csmSyncRoleFromWindow();
  var root = gid('suiteCompanyFinancial');
  if (!root) return;
  if (isStaff) {
    companyFinView = 'pending';
    try { sessionStorage.setItem('csm_company_fin_view', 'pending'); } catch (eStf) {}
  }
  var state = csmFinBuildWorkspaceState();
  renderCompanyFinPendingBadge(state);
  renderCompanyFinSnapshotCards(state);
  renderCompanyFinInterfacesTable();
  renderCompanyFinGlTable(state);
  renderCompanyFinDetailFilter(state);
  renderCompanyFinCashBankPanels(state);
  renderCompanyFinTaxPanels(state);
  renderCompanyFinancialPending();
  renderCompanyFinancialPendingCustoms();
  if (!isStaff) {
    try { companyFinView = sessionStorage.getItem('csm_company_fin_view') || companyFinView || 'pending'; } catch (eVw) {}
  }
  swCompanyFinView(companyFinView || 'pending');
}
function csmFinCnNormalize(cn) {
  return String(cn || '').trim().toUpperCase();
}
function csmFinCnPurchaseByContainer() {
  var byCn = {};
  (purchaseRecs || []).forEach(function(p) {
    var cn = csmFinCnNormalize(p.cn);
    if (!cn) return;
    if (!byCn[cn]) byCn[cn] = [];
    byCn[cn].push(p);
  });
  return byCn;
}
function csmFinCnFuzzyMatch(cnList, q) {
  q = csmFinCnNormalize(q);
  if (!q) return cnList.slice();
  return cnList.filter(function(cn) { return cn.indexOf(q) !== -1; });
}
function csmFinCnFilterPurchaseRows(rows, supQ, startStr, endStr) {
  if (!rows || !rows.length) return [];
  supQ = String(supQ || '').trim().toLowerCase();
  startStr = String(startStr || '').trim();
  endStr = String(endStr || '').trim();
  if (!supQ && !startStr && !endStr) return rows.slice();
  return rows.filter(function(r) {
    if (supQ) {
      if (String(r.supplier || '').toLowerCase().indexOf(supQ) === -1) return false;
    }
    var pd = String(r.purchaseDate || '').trim();
    if (startStr) {
      if (!pd || pd < startStr) return false;
    }
    if (endStr) {
      if (!pd || pd > endStr) return false;
    }
    return true;
  });
}
function csmFinCnLineSubsetTotalAed(o, linesSubset) {
  if (!o || !linesSubset || !linesSubset.length) return 0;
  var total = 0;
  linesSubset.forEach(function(L) {
    var vm = csmSalesLineVatMode(L, o);
    var a = csmSalesComputeTotals(L.unitPrice, L.quantity, vm);
    total += a.total;
  });
  return csmSalesRound2(total);
}
function csmFinCnSalesOrdersForContainer(cn) {
  var u = csmFinCnNormalize(cn);
  var out = [];
  (salesOrders || []).forEach(function(o) {
    if (!o || o.voided) return;
    var lines = csmSalesNormalizeLinesFromOrder(o);
    var matchLines = lines.filter(function(L) { return L.containerNo === u; });
    if (!matchLines.length) return;
    out.push({ order: o, lines: matchLines });
  });
  out.sort(function(a, b) {
    return String(b.order.createdAt || '').localeCompare(String(a.order.createdAt || ''));
  });
  return out;
}
function csmFinCnPurchaseRows(cn) {
  var key = csmFinCnNormalize(cn);
  return (purchaseRecs || []).filter(function(p) {
    return csmFinCnNormalize(p && p.cn) === key;
  });
}
function csmFinCnPrimaryPurchaseRow(cn) {
  var rows = csmFinCnPurchaseRows(cn);
  return rows.length ? rows[0] : null;
}
function csmFinCnSupplierDisplay(cn) {
  var seen = {};
  var list = [];
  csmFinCnPurchaseRows(cn).forEach(function(r) {
    var s = String(r && r.supplier || '').trim();
    var k = s.toLowerCase();
    if (!s || seen[k]) return;
    seen[k] = true;
    list.push(s);
  });
  return list.join(' · ');
}
function csmFinCnNetAmountTotal(cn) {
  var total = 0;
  csmFinCnSalesOrdersForContainer(cn).forEach(function(item) {
    var o = item.order;
    (item.lines || []).forEach(function(L) {
      total += csmFinCnReconDisplayState(L, o).netAmount;
    });
  });
  return csmSalesRound2(total);
}
function csmFinCnGetCommissionRate(cn) {
  var primary = csmFinCnPrimaryPurchaseRow(cn);
  var rate = parseFloat(primary && primary.finCnCommissionRate);
  return rate >= 0 ? rate : 5;
}
function csmFinCnGetWorkerTruckAmount(cn) {
  var primary = csmFinCnPrimaryPurchaseRow(cn);
  var ov = parseFloat(primary && primary.finCnWorkerTruckOverride);
  if (ov >= 0) return csmSalesRound2(ov);
  var wtTotal = 0;
  csmFinCnSalesOrdersForContainer(cn).forEach(function(item) {
    (item.lines || []).forEach(function(L) {
      wtTotal += (parseFloat(L && L.workerAmount) || 0) + (parseFloat(L && L.truckAmount) || 0);
    });
  });
  return csmSalesRound2(wtTotal);
}
function csmFinCnDistributeTotal(total, weights) {
  var roundedTotal = csmSalesRound2(total);
  var out = [];
  var sumW = 0;
  var i;
  for (i = 0; i < weights.length; i++) sumW += parseFloat(weights[i]) || 0;
  if (!(sumW > 0)) {
    for (i = 0; i < weights.length; i++) weights[i] = 1;
    sumW = weights.length || 1;
  }
  var remain = roundedTotal;
  for (i = 0; i < weights.length; i++) {
    var part = (i === weights.length - 1) ? csmSalesRound2(remain) : csmSalesRound2(roundedTotal * ((parseFloat(weights[i]) || 0) / sumW));
    out.push(part);
    remain = csmSalesRound2(remain - part);
  }
  if (out.length) out[out.length - 1] = csmSalesRound2(out[out.length - 1] + remain);
  return out;
}
function csmFinCnSavePurchaseFieldTotal(cn, fieldKey, total) {
  var rows = csmFinCnPurchaseRows(cn);
  if (!rows.length) return Promise.reject(new Error('No purchase rows for this container'));
  var currentTotal = rows.reduce(function(sum, r) { return sum + (parseFloat(r && r[fieldKey]) || 0); }, 0);
  var weights = [];
  if (currentTotal > 0) {
    weights = rows.map(function(r) { return parseFloat(r && r[fieldKey]) || 0; });
  } else {
    var qtyTotal = rows.reduce(function(sum, r) { return sum + (parseFloat(r && r.qty) || 0); }, 0);
    weights = qtyTotal > 0 ? rows.map(function(r) { return parseFloat(r && r.qty) || 0; }) : rows.map(function() { return 1; });
  }
  var distributed = csmFinCnDistributeTotal(total, weights);
  var tasks = [];
  rows.forEach(function(r, idx) {
    var nextVal = csmSalesRound2(distributed[idx] || 0);
    r[fieldKey] = nextVal;
    if (fieldKey === 'coldFee' && r.coldfee != null) r.coldfee = nextVal;
    if (purchaseRef && r.id) tasks.push(purchaseRef.child(r.id).update((function() {
      var patch = {};
      patch[fieldKey] = nextVal;
      return patch;
    })()));
  });
  return Promise.all(tasks);
}
function csmFinCnSavePrimaryPurchaseMeta(cn, patch) {
  var primary = csmFinCnPrimaryPurchaseRow(cn);
  if (!primary) return Promise.reject(new Error('No purchase rows for this container'));
  Object.keys(patch || {}).forEach(function(k) { primary[k] = patch[k]; });
  if (!purchaseRef || !primary.id) return Promise.resolve();
  return purchaseRef.child(primary.id).update(patch);
}
function csmFinCnExpenseBreakdown(cn) {
  var key = csmFinCnNormalize(cn);
  var purchaseFeeDefs = [
    { key: 'demurrage', cn: '停柜费', en: 'parking', source: 'Purchase records · 采购记录' },
    { key: 'customs', cn: '清关费', en: 'Customs clearance', source: 'Purchase records · 采购记录' },
    { key: 'coldFee', cn: '冷藏费', en: 'Cold Fee', source: 'Purchase records · 采购记录' },
    { key: 'attestation', cn: '单据认证', en: 'Attestation', source: 'Purchase records · 采购记录' },
    { key: 'repack', cn: '翻包费', en: 'Repack', source: 'Purchase records · 采购记录' },
    { key: 'waste', cn: '垃圾费', en: 'Waste', source: 'Purchase records · 采购记录' },
    { key: 'other', cn: '其他', en: 'Other', source: 'Purchase records · 采购记录' }
  ];
  var totals = {};
  purchaseFeeDefs.forEach(function(d) { totals[d.key] = 0; });
  (purchaseRecs || []).forEach(function(p) {
    if (csmFinCnNormalize(p && p.cn) !== key) return;
    purchaseFeeDefs.forEach(function(d) {
      totals[d.key] += parseFloat(p && p[d.key]) || 0;
    });
  });
  var netAmountTotal = csmFinCnNetAmountTotal(key);
  var commissionRate = csmFinCnGetCommissionRate(key);
  var workerTruckAmount = csmFinCnGetWorkerTruckAmount(key);
  var defByKey = {};
  purchaseFeeDefs.forEach(function(d) { defByKey[d.key] = d; });
  function purchaseRow(k) {
    var d = defByKey[k];
    return {
      key: d.key,
      cn: d.cn,
      en: d.en,
      source: d.source,
      amount: totals[k],
      editable: true
    };
  }
  var rows = [];
  rows.push({
    key: 'workerTruck',
    cn: '卸货送货及退换货',
    en: 'Worker / Truck',
    source: 'Sales lines · 销售订单行',
    amount: workerTruckAmount,
    editable: true
  });
  rows.push(purchaseRow('demurrage'));
  rows.push({
    key: 'commission',
    cn: '佣金',
    en: 'Commission',
    source: 'Net amount × ' + csmSalesRound2(commissionRate).toFixed(2) + '% · 上栏净额 × 费率',
    amount: csmSalesRound2(netAmountTotal * commissionRate / 100),
    editable: true,
    rate: commissionRate
  });
  rows.push(purchaseRow('customs'));
  rows.push(purchaseRow('coldFee'));
  rows.push(purchaseRow('attestation'));
  rows.push(purchaseRow('repack'));
  rows.push(purchaseRow('waste'));
  rows.push(purchaseRow('other'));
  var normalizedRows = rows.map(function(r) {
    return {
      key: r.key,
      cn: r.cn,
      en: r.en,
      source: r.source,
      amount: csmSalesRound2(r.amount),
      editable: r.editable !== false,
      rate: r.rate
    };
  });
  var expenseTotal = normalizedRows.reduce(function(sum, r) { return sum + (parseFloat(r.amount) || 0); }, 0);
  return {
    netAmountTotal: netAmountTotal,
    commissionRate: commissionRate,
    rows: normalizedRows,
    expenseTotal: csmSalesRound2(expenseTotal),
    balance: csmSalesRound2(netAmountTotal - expenseTotal)
  };
}
function csmFinCnReconPrintData(cn) {
  var key = csmFinCnNormalize(cn);
  var supplierName = csmFinCnSupplierDisplay(key) || '—';
  var salesRows = [];
  var totalQty = 0;
  var totalNetAmount = 0;
  csmFinCnSalesOrdersForContainer(key).forEach(function(item) {
    var o = item.order;
    (item.lines || []).forEach(function(L) {
      var disp = csmFinCnReconDisplayState(L, o);
      salesRows.push({
        productName: String(L.productName || ''),
        netUnit: csmSalesRound2(disp.netUnit),
        qty: disp.qty,
        netAmount: csmSalesRound2(disp.netAmount)
      });
      totalQty += disp.qty;
      totalNetAmount += disp.netAmount;
    });
  });
  var expenseData = csmFinCnExpenseBreakdown(key);
  return {
    cn: key,
    supplierName: supplierName,
    salesRows: salesRows,
    totalQty: csmSalesRound2(totalQty),
    totalNetAmount: csmSalesRound2(totalNetAmount),
    feeRows: (expenseData.rows || []).filter(function(r) {
      return Math.abs(parseFloat(r && r.amount) || 0) > 1e-9;
    }),
    expenseTotal: csmSalesRound2(expenseData.expenseTotal || 0),
    balance: csmSalesRound2(expenseData.balance || 0),
    printedAt: new Date().toISOString()
  };
}
function csmOpenPrintHtmlDocument(docHtml, printTitle) {
  var w = null;
  try {
    w = window.open('', '_blank');
  } catch (e1) {
    w = null;
  }
  if (w && w.document) {
    try {
      w.document.open();
      w.document.write(String(docHtml || ''));
      w.document.close();
    } catch (e2) {
      w = null;
    }
  }
  if (!w) {
    toast('Pop-up blocked — allow pop-ups to print', 'err');
    return;
  }
  try { if (printTitle) w.document.title = String(printTitle); } catch (e3) {}
  var printed = false;
  function doPrint() {
    if (printed) return;
    printed = true;
    try {
      w.focus();
      w.print();
    } catch (e4) {}
  }
  try {
    w.onload = function() {
      setTimeout(doPrint, 250);
    };
  } catch (e6) {}
  setTimeout(doPrint, 900);
}
function csmFinCnReconGetOverrides(order) {
  var raw = order && order.finCnReconOverrides;
  return raw && typeof raw === 'object' ? raw : {};
}
function csmFinCnReconLineOverride(order, lineIdx) {
  var map = csmFinCnReconGetOverrides(order);
  var key = String(parseInt(lineIdx, 10));
  return map[key] && typeof map[key] === 'object' ? map[key] : null;
}
function csmFinCnReconFmtQty(q) {
  var num = parseFloat(q);
  if (!(num >= 0)) return '0';
  return (Math.abs(num - Math.round(num)) < 1e-9) ? String(Math.round(num)) : csmSalesRound2(num).toFixed(2);
}
function csmFinCnReconBaseQty(L) {
  return parseFloat(L && L.quantity) || 0;
}
function csmFinCnReconBaseNetUnit(L, o) {
  return csmSalesNetUnitAndVatFromLine(L, csmSalesLineVatMode(L, o)).netUnit;
}
function csmFinCnReconDisplayState(L, o) {
  var ov = csmFinCnReconLineOverride(o, L && L._lineIndex);
  var baseQty = csmFinCnReconBaseQty(L);
  var baseNetUnit = csmFinCnReconBaseNetUnit(L, o);
  var initialQty = (ov && ov.initialQty != null && ov.initialQty !== '' && !isNaN(parseFloat(ov.initialQty))) ? parseFloat(ov.initialQty) : baseQty;
  var initialNetUnit = (ov && ov.initialNetUnit != null && ov.initialNetUnit !== '' && !isNaN(parseFloat(ov.initialNetUnit))) ? parseFloat(ov.initialNetUnit) : baseNetUnit;
  var currentQty = (ov && ov.qty != null && ov.qty !== '' && !isNaN(parseFloat(ov.qty))) ? parseFloat(ov.qty) : baseQty;
  var currentNetUnit = (ov && ov.netUnit != null && ov.netUnit !== '' && !isNaN(parseFloat(ov.netUnit))) ? parseFloat(ov.netUnit) : baseNetUnit;
  return {
    initialQty: initialQty,
    initialNetUnit: initialNetUnit,
    initialAmount: csmSalesRound2(initialNetUnit * initialQty),
    qty: currentQty,
    netUnit: currentNetUnit,
    netAmount: csmSalesRound2(currentNetUnit * currentQty),
    changed: Math.abs(initialQty - currentQty) > 1e-9 || Math.abs(initialNetUnit - currentNetUnit) > 1e-9
  };
}
function csmFinCnReconDisplayCell(valueText, isChanged) {
  var style = 'text-align:right;font-variant-numeric:tabular-nums;vertical-align:top';
  if (isChanged) style += ';color:#cc0000;font-weight:700';
  return '<td style="' + style + '">' + csmEscapeHtml(String(valueText)) + '</td>';
}
function renderFinCnReconTable() {
  if (!isAdmin && !isStaff) return;
  var tb = gid('tb-fin-cn-recon');
  var empty = gid('fin-cn-recon-empty');
  if (!tb) return;
  var byCn = csmFinCnPurchaseByContainer();
  var cns = Object.keys(byCn).sort();
  var q = gid('fin-cn-recon-search') ? String(gid('fin-cn-recon-search').value || '').trim() : '';
  var supQ = gid('fin-cn-recon-supplier') ? String(gid('fin-cn-recon-supplier').value || '').trim() : '';
  var dStart = gid('fin-cn-recon-date-start') ? String(gid('fin-cn-recon-date-start').value || '').trim() : '';
  var dEnd = gid('fin-cn-recon-date-end') ? String(gid('fin-cn-recon-date-end').value || '').trim() : '';
  if (dStart && dEnd && dStart > dEnd) { var t = dStart; dStart = dEnd; dEnd = t; }
  cns = csmFinCnFuzzyMatch(cns, q);
  cns = cns.filter(function(cn) {
    return csmFinCnFilterPurchaseRows(byCn[cn], supQ, dStart, dEnd).length > 0;
  });
  if (!cns.length) {
    tb.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  tb.innerHTML = cns.map(function(cn) {
    var rows = csmFinCnFilterPurchaseRows(byCn[cn], supQ, dStart, dEnd);
    var purchaseHtml = rows.map(function(r) {
      var seq = csmEscapeHtml((r.seq != null && r.seq !== '') ? String(r.seq) : '\u2014');
      var sup = csmEscapeHtml(String(r.supplier || '\u2014'));
      var pr = csmEscapeHtml(String(r.product || '\u2014'));
      var qty = csmEscapeHtml(r.qty != null ? String(r.qty) : '\u2014');
      var dt = csmEscapeHtml(String(r.purchaseDate || '\u2014'));
      return '<div style="font-size:14px;line-height:1.5;border-bottom:1px solid #e5e7eb;padding:7px 0;font-family:var(--csm-font-en);font-weight:700">' +
        '<div style="display:grid;grid-template-columns:96px minmax(220px,1.9fr) minmax(150px,1.2fr) 88px 120px;gap:8px;align-items:start">' +
          '<div>' + seq + '</div>' +
          '<div style="word-break:break-word">' + sup + '</div>' +
          '<div style="word-break:break-word">' + pr + '</div>' +
          '<div style="text-align:right">' + qty + '</div>' +
          '<div>' + dt + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    var cnEsc = csmAttrEscape(cn);
    return '<tr><td style="font-family:var(--csm-font-en);font-weight:700;white-space:nowrap;vertical-align:top">' + csmEscapeHtml(cn) + '</td>' +
      '<td style="min-width:760px;max-width:880px;vertical-align:top">' + purchaseHtml + '</td>' +
      '<td style="vertical-align:middle"><button type="button" class="abtn" style="font-family:var(--csm-font-en);font-weight:700" data-cn="' + cnEsc + '" onclick="openFinCnReconDetailModal(this)">Details</button></td></tr>';
  }).join('');
}
function finCnReconOpenOrderEdit(orderId) {
  orderId = String(orderId || '').trim();
  if (!orderId) return;
  clFinCnReconDetailModal();
  try { swTab('sales'); } catch (e1) {}
  try { swSalesSub('orders'); } catch (e2) {}
  setTimeout(function() { openSalesOrderModal(orderId); }, 50);
}
/** Map display line L to index in a fresh csmSalesNormalizeLinesFromOrder (cannot use indexOf: new object instances each call). */
function csmFinCnReconLineMatchesNorm(a, b) {
  if (!a || !b) return false;
  if (csmSalesLineKey(a) !== csmSalesLineKey(b)) return false;
  if (Math.abs((parseFloat(a.quantity) || 0) - (parseFloat(b.quantity) || 0)) > 1e-6) return false;
  return true;
}
function csmFinCnReconResolveLineIndex(o, L) {
  var fl = csmSalesNormalizeLinesFromOrder(o);
  if (!fl.length || !L) return -1;
  var n = parseInt(L._lineIndex, 10);
  if (!isNaN(n) && n >= 0 && n < fl.length) {
    if (csmFinCnReconLineMatchesNorm(fl[n], L)) return n;
  }
  var k = csmSalesLineKey(L);
  var qL = parseFloat(L.quantity) || 0;
  var hits = [];
  for (var i = 0; i < fl.length; i++) {
    if (csmSalesLineKey(fl[i]) !== k) continue;
    if (Math.abs((parseFloat(fl[i].quantity) || 0) - qL) > 1e-6) continue;
    hits.push(i);
  }
  if (hits.length === 1) return hits[0];
  if (hits.length > 1 && !isNaN(n) && n >= 0 && hits.indexOf(n) >= 0) return n;
  if (hits.length > 0) return hits[0];
  for (var j = 0; j < fl.length; j++) {
    if (csmSalesLineKey(fl[j]) === k) return j;
  }
  return -1;
}
function csmFinCnReconBindEditButtons(tbody) {
  if (!tbody || !tbody.querySelectorAll) return;
  var btns = tbody.querySelectorAll('button.csm-fin-cn-recon-edit-btn');
  for (var i = 0; i < btns.length; i++) {
    (function(btn) {
      function onEditClick(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        var orderId = String(btn.getAttribute('data-order-id') || '').trim();
        var lineIdx = parseInt(String(btn.getAttribute('data-line-idx') || ''), 10);
        try {
          openFinCnReconLineEditModal(orderId, lineIdx);
        } catch (err) {
          try { toast('Edit failed: ' + (err && err.message ? err.message : err), 'err'); } catch (e2) {}
        }
      }
      btn.addEventListener('click', onEditClick, true);
    })(btns[i]);
  }
}
function openFinCnReconDetailModal(el) {
  var cn = el && el.getAttribute('data-cn');
  if (!cn) return;
  var m = gid('fin-cn-recon-detail-modal');
  var title = gid('fin-cn-recon-detail-title');
  var tbody = gid('tb-fin-cn-recon-detail');
  var tfoot = gid('tf-fin-cn-recon-detail');
  var feeBody = gid('tb-fin-cn-recon-fees');
  var feeFoot = gid('tf-fin-cn-recon-fees');
  if (!m || !tbody) return;
  try { m.setAttribute('data-cn', csmFinCnNormalize(cn)); } catch (eSet) {}
  if (title) title.textContent = 'Container ' + cn + ' \u2014 All sales (this container)';
  var list = csmFinCnSalesOrdersForContainer(cn);
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#888;padding:16px;font-family:var(--csm-font-en);font-weight:700">No sales orders for this container.</td></tr>';
    if (tfoot) tfoot.innerHTML = '';
  } else {
    var parts = [];
    var totalQty = 0;
    var totalInitialQty = 0;
    var totalInitialAmount = 0;
    var totalNetAmount = 0;
    list.forEach(function(item) {
      var o = item.order;
      var Ls = item.lines;
      var n = Ls.length;
      Ls.forEach(function(L, idx) {
        var disp = csmFinCnReconDisplayState(L, o);
        var qStr = csmFinCnReconFmtQty(disp.qty);
        totalQty += disp.qty;
        totalInitialQty += disp.initialQty;
        totalInitialAmount += disp.initialAmount;
        totalNetAmount += disp.netAmount;
        var tr = '<tr>';
        if (idx === 0) {
          tr += '<td rowspan="' + n + '" style="font-family:var(--csm-font-en);font-weight:700;vertical-align:top;white-space:nowrap">' + csmEscapeHtml(String(o.orderNo || o.id)) + '</td>';
          tr += '<td rowspan="' + n + '" style="font-size:12px;vertical-align:top;white-space:nowrap">' + csmEscapeHtml(csmSalesFormatOrderCreated(o.createdAt)) + '</td>';
          tr += '<td rowspan="' + n + '" style="vertical-align:top">' + csmEscapeHtml(o.customerName || '') + '</td>';
        }
        tr += '<td style="font-size:12px;max-width:200px;vertical-align:top">' + csmEscapeHtml(L.productName || '') + '</td>';
        tr += '<td style="text-align:right;font-variant-numeric:tabular-nums;vertical-align:top">' + disp.netUnit.toFixed(2) + '</td>';
        tr += '<td style="text-align:right;font-variant-numeric:tabular-nums;vertical-align:top">' + qStr + '</td>';
        tr += csmFinCnReconDisplayCell(disp.initialNetUnit.toFixed(2), disp.changed);
        tr += csmFinCnReconDisplayCell(csmFinCnReconFmtQty(disp.initialQty), disp.changed);
        tr += csmFinCnReconDisplayCell(disp.initialAmount.toFixed(2), disp.changed);
        tr += '<td style="text-align:right;font-variant-numeric:tabular-nums;vertical-align:top">' + disp.netAmount.toFixed(2) + '</td>';
        var _liR = csmFinCnReconResolveLineIndex(o, L);
        var _oid = o && o.id != null ? String(o.id) : '';
        if (_liR < 0) {
          tr += '<td style="vertical-align:middle;white-space:nowrap;color:#888;font-size:12px" title="Could not map line (contact admin)">\u2014</td>';
        } else {
          tr += '<td style="vertical-align:middle;white-space:nowrap"><button type="button" class="abtn csm-fin-cn-recon-edit-btn" style="font-family:var(--csm-font-en);font-weight:700" data-order-id="' + csmAttrEscape(_oid) + '" data-line-idx="' + csmAttrEscape(String(_liR)) + '">Edit</button></td>';
        }
        tr += '</tr>';
        parts.push(tr);
      });
    });
    tbody.innerHTML = parts.join('');
    if (tfoot) {
      tfoot.innerHTML = '<tr>' +
        '<td colspan="5" style="text-align:right;font-family:var(--csm-font-en);font-weight:700;background:var(--bg2)">Total</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;background:var(--bg2)">' + csmFinCnReconFmtQty(totalQty) + '</td>' +
        '<td style="background:var(--bg2)"></td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;background:var(--bg2)">' + csmFinCnReconFmtQty(totalInitialQty) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;background:var(--bg2)">' + csmSalesRound2(totalInitialAmount).toFixed(2) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;background:var(--bg2)">' + csmSalesRound2(totalNetAmount).toFixed(2) + '</td>' +
        '<td style="background:var(--bg2)"></td>' +
      '</tr>';
    }
    csmFinCnReconBindEditButtons(tbody);
  }
  if (feeBody) {
    var feeData = csmFinCnExpenseBreakdown(cn);
    feeBody.innerHTML = feeData.rows.map(function(r) {
      var actionHtml = r.editable ? '<button type="button" class="abtn" style="font-family:var(--csm-font-en);font-weight:700" onclick="openFinCnReconExpenseEditModal(' + csmHtmlAttrJson(cn) + ',' + csmHtmlAttrJson(r.key) + ')">Edit</button>' : '—';
      return '<tr>' +
        '<td>' + csmEscapeHtml(String(r.en || '').trim() + ' ' + String(r.cn || '').trim()) + '</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums">' + csmSalesRound2(r.amount).toFixed(2) + '</td>' +
        '<td style="white-space:nowrap">' + actionHtml + '</td>' +
      '</tr>';
    }).join('');
    if (feeFoot) {
      feeFoot.innerHTML = '<tr>' +
        '<td style="text-align:right;font-family:var(--csm-font-en);font-weight:700;background:var(--bg2)">Total</td>' +
        '<td style="text-align:right;font-variant-numeric:tabular-nums;background:var(--bg2)">' + csmSalesRound2(feeData.expenseTotal).toFixed(2) + '</td>' +
        '<td style="background:var(--bg2)"></td>' +
      '</tr>';
    }
    var balEl = gid('fin-cn-recon-balance-value');
    if (balEl) {
      balEl.textContent = csmSalesRound2(feeData.balance).toFixed(2) + ' AED';
      balEl.style.color = '#111827';
    }
  }
  m.classList.add('sh');
}
function printFinCnReconDetailPdf() {
  var modal = gid('fin-cn-recon-detail-modal');
  var cn = modal ? String(modal.getAttribute('data-cn') || '').trim() : '';
  if (!cn) { toast('Container not found', 'err'); return; }
  var data = csmFinCnReconPrintData(cn);
  var printableFeeRows = (data.feeRows || []).filter(function(r) {
    return csmSalesRound2(parseFloat(r && r.amount) || 0) !== 0;
  });
  var parts = [];
  parts.push('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Container Detail PDF</title><style>');
  parts.push('@page{size:A4 portrait;margin:8mm}');
  parts.push('html,body{margin:0;padding:0;background:#fff}');
  parts.push('body{font-family:Arial,Helvetica,sans-serif;font-weight:700;padding:8mm;color:#111827;font-size:12px;line-height:1.18;box-sizing:border-box}');
  parts.push('h1{font-size:17px;line-height:1.15;margin:0 0 8px}');
  parts.push('.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 14px;margin:0 0 10px}.meta div{margin:0}');
  parts.push('.sec{margin-top:10px}.sec h3{font-size:13px;line-height:1.15;margin:0 0 5px;color:#0f172a}');
  parts.push('table{width:100%;border-collapse:collapse;font-size:11px;line-height:1.1}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}');
  parts.push('th{background:#f8fafc}.num{text-align:right;font-variant-numeric:tabular-nums}');
  parts.push('tfoot td{background:#f8fafc}');
  parts.push('.balance{margin-top:10px;padding:8px 10px;border:1px solid #cbd5e1;background:#f8fafc;display:table;width:100%;table-layout:fixed;box-sizing:border-box}');
  parts.push('.balance .lbl,.balance .val{display:table-cell;vertical-align:bottom}.balance .lbl{font-size:11px;color:#111827}.balance .val{font-size:16px;color:#111827;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;width:170px}');
  parts.push('@media print{html,body{width:210mm;height:auto}body{padding:6mm}.sec{break-inside:avoid}table{break-inside:auto}tr{break-inside:avoid}}</style></head><body>');
  parts.push('<h1>Container reconciliation detail / 集装箱对账明细</h1>');
  parts.push('<div class="meta">');
  parts.push('<div><strong>Supplier name</strong> ' + csmEscapeHtml(data.supplierName || '—') + '</div>');
  parts.push('<div><strong>Container number</strong> ' + csmEscapeHtml(data.cn) + '</div>');
  parts.push('</div>');
  parts.push('<div class="sec"><h3>Sales details / 销售明细</h3>');
  parts.push('<table><thead><tr><th>Product / 品名</th><th class="num">Net unit</th><th class="num">Qty</th><th class="num">Net amount</th></tr></thead><tbody>');
  if (data.salesRows.length) {
    data.salesRows.forEach(function(r) {
      parts.push('<tr><td>' + csmEscapeHtml(r.productName || '—') + '</td><td class="num">' + csmSalesRound2(r.netUnit).toFixed(2) + '</td><td class="num">' + csmFinCnReconFmtQty(r.qty) + '</td><td class="num">' + csmSalesRound2(r.netAmount).toFixed(2) + '</td></tr>');
    });
  } else {
    parts.push('<tr><td colspan="4" style="text-align:center;color:#64748b">No sales lines</td></tr>');
  }
  parts.push('</tbody><tfoot><tr><td style="text-align:right"><strong>Total</strong></td><td></td><td class="num"><strong>' + csmFinCnReconFmtQty(data.totalQty) + '</strong></td><td class="num"><strong>' + csmSalesRound2(data.totalNetAmount).toFixed(2) + '</strong></td></tr></tfoot></table></div>');
  parts.push('<div class="sec"><h3>Container expense / 费用明细</h3>');
  parts.push('<table><thead><tr><th>Fee item / 费用项目</th><th class="num">Amount (AED)</th></tr></thead><tbody>');
  if (printableFeeRows.length) {
    printableFeeRows.forEach(function(r) {
      parts.push('<tr><td>' + csmEscapeHtml(String(r.en || '').trim() + ' ' + String(r.cn || '').trim()) + '</td><td class="num">' + csmSalesRound2(r.amount).toFixed(2) + '</td></tr>');
    });
  } else {
    parts.push('<tr><td colspan="2" style="text-align:center;color:#64748b">No fees</td></tr>');
  }
  parts.push('</tbody><tfoot><tr><td style="text-align:right"><strong>Total fees</strong></td><td class="num"><strong>' + csmSalesRound2(data.expenseTotal).toFixed(2) + '</strong></td></tr></tfoot></table></div>');
  parts.push('<div class="balance"><div class="lbl">Balance amount / 结余金额</div><div class="val">' + csmSalesRound2(data.balance).toFixed(2) + ' AED</div></div>');
  parts.push('</body></html>');
  csmOpenPrintHtmlDocument(parts.join(''), '');
}
function clFinCnReconDetailModal() {
  var m = gid('fin-cn-recon-detail-modal');
  if (m) m.classList.remove('sh');
}
function csmFinCnReconLineEditGetContext() {
  var orderId = String((gid('fin-cn-recon-edit-order-id') || {}).value || '').trim();
  var lineIdx = parseInt(String((gid('fin-cn-recon-edit-line-idx') || {}).value || ''), 10);
  if (!orderId || isNaN(lineIdx) || lineIdx < 0) return null;
  var order = salesOrders.find(function(x) { return x && x.id === orderId; });
  if (!order || order.voided) return null;
  var lines = csmSalesNormalizeLinesFromOrder(order);
  if (lineIdx >= lines.length) return null;
  return { orderId: orderId, lineIdx: lineIdx, order: order, lines: lines, line: lines[lineIdx] };
}
function csmFinCnReconEditPreview() {
  var out = gid('fin-cn-recon-edit-preview');
  if (!out) return;
  var ctx = csmFinCnReconLineEditGetContext();
  if (!ctx) {
    out.textContent = 'Net amount: 0.00 AED';
    return;
  }
  var netUnit = parseFloat((gid('fin-cn-recon-edit-net-unit') || {}).value);
  var qty = parseFloat((gid('fin-cn-recon-edit-qty') || {}).value);
  if (!(netUnit >= 0) || !(qty > 0)) {
    out.textContent = 'Net amount: —';
    return;
  }
  out.textContent = 'Net amount: ' + csmSalesRound2(netUnit * qty).toFixed(2) + ' AED';
}
function openFinCnReconLineEditModal(orderId, lineIdx) {
  if (!isAdmin && !isStaff) {
    toast('Only admin or staff can edit reconciliation lines', 'err');
    return;
  }
  orderId = String(orderId || '').trim();
  lineIdx = parseInt(lineIdx, 10);
  if (!orderId || isNaN(lineIdx) || lineIdx < 0) {
    toast('Invalid reconciliation line', 'err');
    return;
  }
  var order = salesOrders.find(function(x) { return x && x.id === orderId; });
  if (!order || order.voided) { toast('Order not found', 'err'); return; }
  var lines = csmSalesNormalizeLinesFromOrder(order);
  var line = lines[lineIdx];
  if (!line) { toast('Line not found', 'err'); return; }
  var meta = gid('fin-cn-recon-edit-line-meta');
  var orderIdEl = gid('fin-cn-recon-edit-order-id');
  var lineIdxEl = gid('fin-cn-recon-edit-line-idx');
  var unitEl = gid('fin-cn-recon-edit-net-unit');
  var qtyEl = gid('fin-cn-recon-edit-qty');
  var modal = gid('fin-cn-recon-line-edit-modal');
  if (!orderIdEl || !lineIdxEl || !unitEl || !qtyEl || !modal) {
    toast('Edit form not available', 'err');
    return;
  }
  try { window._finCnReconDetailRestoreCn = String(line.containerNo || '').trim(); } catch (eCn) {}
  clFinCnReconDetailModal();
  var disp = csmFinCnReconDisplayState(line, order);
  orderIdEl.value = orderId;
  lineIdxEl.value = String(lineIdx);
  unitEl.value = disp.netUnit.toFixed(2);
  qtyEl.value = csmFinCnReconFmtQty(disp.qty);
  if (meta) {
    meta.innerHTML = 'Order: ' + csmEscapeHtml(String(order.orderNo || order.id)) +
      '<br>Product: ' + csmEscapeHtml(String(line.productName || '')) +
      '<br>Container: ' + csmEscapeHtml(String(line.containerNo || '')) +
      '<br>VAT mode: ' + csmEscapeHtml(csmSalesLineVatMode(line, order) === 'included' ? 'Include VAT' : 'Exclude VAT');
  }
  csmFinCnReconEditPreview();
  modal.classList.add('sh');
}
function clFinCnReconLineEditModal(reopenDetail) {
  var modal = gid('fin-cn-recon-line-edit-modal');
  if (modal) modal.classList.remove('sh');
  var cn = '';
  try { cn = String(window._finCnReconDetailRestoreCn || '').trim(); } catch (e1) { cn = ''; }
  try { window._finCnReconDetailRestoreCn = ''; } catch (e2) {}
  if (reopenDetail && cn) {
    try {
      openFinCnReconDetailModal({ getAttribute: function(name) { return name === 'data-cn' ? cn : ''; } });
    } catch (e3) {}
  }
}
function saveFinCnReconLineEdit() {
  if (!salesOrdersRef) { toast('Database not connected', 'err'); return; }
  var ctx = csmFinCnReconLineEditGetContext();
  if (!ctx) { toast('Line not found', 'err'); return; }
  var netUnit = parseFloat((gid('fin-cn-recon-edit-net-unit') || {}).value);
  var qty = parseFloat((gid('fin-cn-recon-edit-qty') || {}).value);
  if (!(netUnit >= 0)) { toast('Enter valid net unit', 'err'); return; }
  if (!(qty > 0)) { toast('Enter valid qty', 'err'); return; }
  var disp = csmFinCnReconDisplayState(ctx.line, ctx.order);
  var overrides = Object.assign({}, csmFinCnReconGetOverrides(ctx.order));
  overrides[String(ctx.lineIdx)] = {
    netUnit: csmSalesRound2(netUnit),
    qty: qty,
    initialNetUnit: disp.initialNetUnit,
    initialQty: disp.initialQty
  };
  salesOrdersRef.child(ctx.orderId).update({
    finCnReconOverrides: overrides,
    finCnReconUpdatedAt: new Date().toISOString()
  }).then(function() {
    toast('Reconciliation line updated', 'ok');
    clFinCnReconLineEditModal(false);
    openFinCnReconDetailModal({ getAttribute: function(name) { return name === 'data-cn' ? ctx.line.containerNo : ''; } });
  }).catch(function(e) {
    toast('Save failed: ' + (e.message || e), 'err');
  });
}
function csmFinCnRefreshAfterExpenseEdit(cn) {
  try { renderPurchase(); } catch (e1) {}
  try { renderFinCnReconTable(); } catch (e2) {}
  openFinCnReconDetailModal({ getAttribute: function(name) { return name === 'data-cn' ? cn : ''; } });
}
function openFinCnReconExpenseEditModal(cn, key) {
  if (!isAdmin && !isStaff) {
    toast('Only admin or staff can edit expense items', 'err');
    return;
  }
  cn = csmFinCnNormalize(cn);
  key = String(key || '').trim();
  var feeData = csmFinCnExpenseBreakdown(cn);
  var row = (feeData.rows || []).find(function(r) { return r && r.key === key; });
  if (!cn || !row) { toast('Expense item not found', 'err'); return; }
  var modal = gid('fin-cn-recon-expense-edit-modal');
  var titleEl = gid('fin-cn-recon-expense-edit-title');
  var cnEl = gid('fin-cn-recon-expense-edit-cn');
  var keyEl = gid('fin-cn-recon-expense-edit-key');
  var metaEl = gid('fin-cn-recon-expense-edit-meta');
  var labelEl = gid('fin-cn-recon-expense-edit-label');
  var valueEl = gid('fin-cn-recon-expense-edit-value');
  if (!modal || !cnEl || !keyEl || !valueEl) { toast('Expense editor not available', 'err'); return; }
  try { window._finCnReconDetailRestoreCn = cn; } catch (e0) {}
  clFinCnReconDetailModal();
  cnEl.value = cn;
  keyEl.value = key;
  if (titleEl) titleEl.textContent = 'Edit ' + row.en;
  if (key === 'commission') {
    if (labelEl) labelEl.textContent = 'Commission rate (%)';
    valueEl.step = '0.01';
    valueEl.min = '0';
    valueEl.value = csmSalesRound2(feeData.commissionRate).toFixed(2);
    if (metaEl) {
      metaEl.innerHTML = 'Container: ' + csmEscapeHtml(cn) +
        '<br>Formula: Net amount ' + csmSalesRound2(feeData.netAmountTotal).toFixed(2) + ' AED × rate' +
        '<br>Current commission: ' + csmSalesRound2(row.amount).toFixed(2) + ' AED';
    }
  } else {
    if (labelEl) labelEl.textContent = 'Amount (AED)';
    valueEl.step = '0.01';
    valueEl.min = '0';
    valueEl.value = csmSalesRound2(row.amount).toFixed(2);
    if (metaEl) {
      metaEl.innerHTML = 'Container: ' + csmEscapeHtml(cn) +
        '<br>Item: ' + csmEscapeHtml(row.en) + ' · ' + csmEscapeHtml(row.cn) +
        '<br>Source: ' + csmEscapeHtml(row.source);
    }
  }
  modal.classList.add('sh');
}
function clFinCnReconExpenseEditModal(reopenDetail) {
  var modal = gid('fin-cn-recon-expense-edit-modal');
  if (modal) modal.classList.remove('sh');
  var cn = '';
  try { cn = String(window._finCnReconDetailRestoreCn || '').trim(); } catch (e1) { cn = ''; }
  try { window._finCnReconDetailRestoreCn = ''; } catch (e2) {}
  if (reopenDetail && cn) csmFinCnRefreshAfterExpenseEdit(cn);
}
function saveFinCnReconExpenseEdit() {
  var cn = csmFinCnNormalize((gid('fin-cn-recon-expense-edit-cn') || {}).value || '');
  var key = String((gid('fin-cn-recon-expense-edit-key') || {}).value || '').trim();
  var raw = parseFloat((gid('fin-cn-recon-expense-edit-value') || {}).value);
  if (!cn || !key) { toast('Expense item not found', 'err'); return; }
  if (!(raw >= 0)) { toast(key === 'commission' ? 'Enter valid commission rate' : 'Enter valid amount', 'err'); return; }
  var task;
  if (key === 'commission') {
    task = csmFinCnSavePrimaryPurchaseMeta(cn, { finCnCommissionRate: csmSalesRound2(raw) });
  } else if (key === 'workerTruck') {
    task = csmFinCnSavePrimaryPurchaseMeta(cn, { finCnWorkerTruckOverride: csmSalesRound2(raw) });
  } else {
    task = csmFinCnSavePurchaseFieldTotal(cn, key, csmSalesRound2(raw));
  }
  Promise.resolve(task).then(function() {
    toast('Expense updated', 'ok');
    clFinCnReconExpenseEditModal(false);
    csmFinCnRefreshAfterExpenseEdit(cn);
  }).catch(function(e) {
    toast('Save failed: ' + (e && e.message ? e.message : e), 'err');
  });
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
  if (salesSubView === 'dash') {
    try {
      var fs = sessionStorage.getItem('csm_fin_sub');
      if (fs === 'wt' || fs === 'orders') finSubView = fs;
    } catch (eFs) {}
    try { swFinSub(finSubView || 'orders'); } catch (eFin) {}
  } else {
    try {
      var tbs = document.querySelectorAll('.tab');
      tbs.forEach(function(t, i) { t.classList.toggle('ac', i === 4); });
    } catch (eTopTab) {}
  }
}
function csmSalesGetSelectedOrderIds() {
  var out = [];
  document.querySelectorAll('#tb-sales-orders .csm-sales-row-cb:checked').forEach(function(cb) {
    var id = cb.getAttribute('data-sales-order-id');
    if (id) out.push(id);
  });
  return out;
}
function csmSalesOrderCbExclusive(el) {
  if (!el || !el.checked) return;
  document.querySelectorAll('#tb-sales-orders .csm-sales-row-cb').forEach(function(cb) {
    if (cb !== el && !cb.disabled) cb.checked = false;
  });
}
function csmSalesRequireAtMostOneSelection(ids) {
  if (ids.length > 1) {
    toast('\u64A4\u9500\u3001\u63D0\u4EA4\u3001\u786E\u8BA4\u6BCF\u6B21\u6700\u591A\u52FE\u9009\u4E00\u6761\u8BA2\u5355', 'err');
    return false;
  }
  return true;
}
function csmSalesPurchaseApplyQtyDelta(cn, product, deltaQty) {
  cn = (cn || '').trim().toUpperCase();
  product = canonicalProductName((product || '').trim());
  deltaQty = parseFloat(deltaQty) || 0;
  if (!purchaseRef || !cn || !product || deltaQty === 0) return Promise.resolve();
  var matches = purchaseRecs.filter(function(p) {
    return (p.cn || '').toUpperCase() === cn && canonicalProductName((p.product || '').trim()) === product;
  });
  if (!matches.length) {
    console.warn('csmSalesPurchaseApplyQtyDelta: no purchase row for', cn, product);
    return Promise.resolve();
  }
  var p = matches[0];
  var newQty = (parseFloat(p.qty) || 0) + deltaQty;
  if (newQty < 0) newQty = 0;
  return purchaseRef.child(p.id).update({ qty: newQty }).catch(function(e) {
    console.error(e);
    return Promise.reject(e);
  });
}
function salesBatchCancel() {
  if (!salesOrdersRef) { toast('Database not connected', 'err'); return; }
  var ids = csmSalesGetSelectedOrderIds();
  if (!ids.length) { toast('\u8BF7\u52FE\u9009\u8BA2\u5355', 'err'); return; }
  if (!csmSalesRequireAtMostOneSelection(ids)) return;
  var tasks = [];
  ids.forEach(function(id) {
    var o = salesOrders.find(function(x) { return x.id === id; });
    if (!o || o.voided || o.orderStatus !== 'submitted') return;
    tasks.push(salesOrdersRef.child(id).update({ orderStatus: 'draft', updatedAt: new Date().toISOString() }));
  });
  if (!tasks.length) { toast('\u65E0\u53EF\u64A4\u9500\u7684\u5DF2\u63D0\u4EA4\u8BA2\u5355', 'err'); return; }
  Promise.all(tasks).then(function() { toast('Cancelled / \u5DF2\u64A4\u9500\u81F3\u8349\u7A3F', 'ok'); }).catch(function(e) { toast(e.message || String(e), 'err'); });
}
function salesBatchSubmit() {
  if (!salesOrdersRef) { toast('Database not connected', 'err'); return; }
  var ids = csmSalesGetSelectedOrderIds();
  if (!ids.length) { toast('\u8BF7\u52FE\u9009\u8BA2\u5355', 'err'); return; }
  if (!csmSalesRequireAtMostOneSelection(ids)) return;
  var toSubmit = [];
  ids.forEach(function(id) {
    var o = salesOrders.find(function(x) { return x.id === id; });
    if (!o || o.voided || o.orderStatus !== 'draft') return;
    toSubmit.push(o);
  });
  var tasks = [];
  toSubmit.forEach(function(o) {
    tasks.push(salesOrdersRef.child(o.id).update({ orderStatus: 'submitted', updatedAt: new Date().toISOString() }));
  });
  if (!tasks.length) { toast('\u65E0\u53EF\u63D0\u4EA4\u7684\u8349\u7A3F\u8BA2\u5355', 'err'); return; }
  Promise.all(tasks).then(function() { toast('Submitted / \u5DF2\u63D0\u4EA4', 'ok'); }).catch(function(e) { toast(e.message || String(e), 'err'); });
}
function salesBatchConfirm() {
  if (!isAdmin) return;
  if (!salesOrdersRef) { toast('Database not connected', 'err'); return; }
  var ids = csmSalesGetSelectedOrderIds();
  if (!ids.length) { toast('\u8BF7\u52FE\u9009\u8BA2\u5355', 'err'); return; }
  if (!csmSalesRequireAtMostOneSelection(ids)) return;
  var oConfirm = salesOrders.find(function(x) { return x.id === ids[0]; });
  if (oConfirm) {
    var linesCheck = csmSalesNormalizeLinesFromOrder(oConfirm);
    if (!linesCheck.length) {
      toast('Cannot confirm: order has no lines.', 'err');
      return;
    }
    var badLine = linesCheck.find(function(L) { return !csmSalesLineWorkerTruckValidForConfirm(L); });
    if (badLine) {
      toast('Cannot confirm: every line needs Worker and Truck, each with Qty > 0 and not more than line Qty. Fill them in the draft first.', 'err');
      return;
    }
  }
  var nowIso = new Date().toISOString();
  var tasks = [];
  ids.forEach(function(id) {
    var o = salesOrders.find(function(x) { return x.id === id; });
    if (!o || o.voided || o.orderStatus !== 'submitted') return;
    tasks.push(salesOrdersRef.child(id).update({
      orderStatus: 'confirmed',
      confirmedAt: nowIso,
      updatedAt: nowIso
    }));
  });
  if (!tasks.length) { toast('\u65E0\u53EF\u786E\u8BA4\u7684\u5DF2\u63D0\u4EA4\u8BA2\u5355', 'err'); return; }
  Promise.all(tasks).then(function() { toast('Confirmed', 'ok'); }).catch(function(e) { toast(e.message || String(e), 'err'); });
}
function csmSalesOrderBelongsToCustomer(o, customerId) {
  if (!o || !customerId) return false;
  if (String(o.customerId || '') === String(customerId)) return true;
  var cust = salesCustomers.find(function(x) { return String(x.id) === String(customerId); });
  if (!cust) return false;
  var snap = csmSalesCustomerOrderSnapshotName(cust);
  return snap && String(o.customerName || '').trim() === snap.trim();
}
function csmSalesConfirmedOrdersForCustomer(customerId) {
  return salesOrders.filter(function(o) {
    return !o.voided && o.orderStatus === 'confirmed' && csmSalesOrderBelongsToCustomer(o, customerId);
  });
}
function csmSalesCustomerArTotalsFromOrders(rows) {
  var paid = 0;
  var unpaid = 0;
  rows.forEach(function(o) {
    paid += csmSalesOrderReceivedAedForSummary(o);
    unpaid += csmSalesOrderRemainingAed(o);
  });
  return { paid: csmSalesRound2(paid), unpaid: csmSalesRound2(unpaid) };
}
function salesDashCustomerFilter(inp) {
  renderSalesDashCustomerAr(String(inp && inp.value != null ? inp.value : ''));
}
function renderSalesDashCustomerAr(searchQ) {
  var sel = gid('sales-dash-cust-select');
  var sumEl = gid('sales-dash-cust-summary');
  var qEl = gid('sales-dash-cust-search');
  var q = searchQ != null ? String(searchQ) : (qEl && qEl.value != null ? qEl.value : '');
  if (searchQ == null && qEl) q = qEl.value || '';
  if (!sel) return;
  var list = (salesCustomers || []).filter(function(c) { return csmSalesCustomerMatchesQuery(c, q); });
  var prev = sel.value;
  sel.innerHTML = '<option value="">— Select customer —</option>' + list.map(function(c) {
    var id = String(c.id || '').replace(/"/g, '&quot;');
    var lab = csmEscapeHtml(csmSalesCustomerListLabel(c) || id);
    return '<option value="' + csmAttrEscape(c.id) + '">' + lab + '</option>';
  }).join('');
  if (prev && list.some(function(c) { return String(c.id) === prev; })) sel.value = prev;
  if (!sel.value && list.length === 1) sel.value = list[0].id;
  var cid = sel.value;
  if (!sumEl) return;
  if (!cid) {
    sumEl.innerHTML = '<div style="color:#888;font-size:13px;font-family:var(--csm-font-en);font-weight:700">Select a customer to see Paid / Unpaid AED.</div>';
    return;
  }
  var rows = csmSalesConfirmedOrdersForCustomer(cid);
  var t = csmSalesCustomerArTotalsFromOrders(rows);
  sumEl.innerHTML =
    '<div style="background:#e8f5e9;border-radius:8px;padding:12px;text-align:center">' +
    '<div style="font-size:12px;color:#555;font-family:var(--csm-font-en);font-weight:700">Paid AED · 已付</div>' +
    '<div style="font-size:20px;font-weight:bold;color:#2e7d32">' + t.paid.toFixed(2) + '</div></div>' +
    '<div style="background:#ffebee;border-radius:8px;padding:12px;text-align:center">' +
    '<div style="font-size:12px;color:#555;font-family:var(--csm-font-en);font-weight:700">Unpaid AED · 未付</div>' +
    '<div style="font-size:20px;font-weight:bold;color:#c62828">' + t.unpaid.toFixed(2) + '</div></div>';
}
function openSalesCustomerPayModal(mode) {
  if (!isAdmin && !isStaff) { toast('Admin or staff only', 'err'); return; }
  var sel = gid('sales-dash-cust-select');
  var cid = sel && sel.value;
  if (!cid) { toast('请先选择客户 / Select a customer first', 'err'); return; }
  var cust = salesCustomers.find(function(c) { return String(c.id) === String(cid); });
  var label = cust ? csmSalesCustomerListLabel(cust) : cid;
  gid('sales-pay-mode').value = mode === 'partial' ? 'partial' : 'full';
  var labEl = gid('sales-pay-cust-label');
  if (labEl) labEl.textContent = label;
  var thP = gid('sales-pay-th-partial');
  if (thP) thP.style.display = mode === 'partial' ? '' : 'none';
  var tb = gid('sales-pay-orders-tbody');
  var orders = csmSalesConfirmedOrdersForCustomer(cid).filter(function(o) { return csmSalesOrderRemainingAed(o) > 0.01; })
    .sort(function(a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  if (!tb) return;
  var colSpan = mode === 'partial' ? 5 : 4;
  if (!orders.length) {
    tb.innerHTML = '<tr><td colspan="' + colSpan + '" style="text-align:center;color:#888;padding:12px">No unpaid confirmed orders for this customer.</td></tr>';
  } else {
    tb.innerHTML = orders.map(function(o) {
      var rem = csmSalesOrderRemainingAed(o);
      var tot = csmSalesOrderTotalAed(o);
      var oidEsc = csmAttrEscape(o.id);
      var chk = '<input type="checkbox" class="sales-pay-oid-cb" data-oid="' + oidEsc + '">';
      var row = '<tr><td style="padding:6px;border:1px solid #ddd;text-align:center">' + chk + '</td><td style="padding:6px;border:1px solid #ddd;font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(o.orderNo || o.id) + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd;text-align:right">' + tot.toFixed(2) + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;color:#c62828">' + rem.toFixed(2) + '</td>';
      if (mode === 'partial') {
        row += '<td style="padding:6px;border:1px solid #ddd"><input type="number" class="sales-pay-partial-inp" data-oid="' + oidEsc + '" step="0.01" min="0" value="" placeholder="0" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-family:var(--csm-font-en);font-weight:700"></td>';
      }
      row += '</tr>';
      return row;
    }).join('');
  }
  gid('sales-pay-discount').value = '0';
  gid('sales-pay-cash').value = '0';
  gid('sales-pay-check').value = '0';
  if (gid('sales-pay-check-date')) gid('sales-pay-check-date').value = '';
  csmSalesPayCashCheckChanged();
  var m = gid('sales-customer-pay-modal');
  if (m) m.classList.add('sh');
}
function clSalesCustomerPayModal() {
  var m = gid('sales-customer-pay-modal');
  if (m) m.classList.remove('sh');
}
function csmSalesPayCashCheckChanged() {
  var c = parseFloat(gid('sales-pay-cash') && gid('sales-pay-cash').value) || 0;
  var ch = parseFloat(gid('sales-pay-check') && gid('sales-pay-check').value) || 0;
  var act = gid('sales-pay-actual');
  if (act) act.value = csmSalesRound2(c + ch).toFixed(2);
}
function csmSalesSubmitCustomerPayment() {
  if (!isAdmin && !isStaff) { toast('Admin or staff only', 'err'); return; }
  if (!salesOrdersRef || !salesPaymentsRef) { toast('Database not connected', 'err'); return; }
  var sel = gid('sales-dash-cust-select');
  var cid = sel && sel.value;
  if (!cid) { toast('No customer', 'err'); return; }
  var cust = salesCustomers.find(function(c) { return String(c.id) === String(cid); });
  var mode = gid('sales-pay-mode') && gid('sales-pay-mode').value === 'partial' ? 'partial' : 'full';
  var discount = parseFloat(gid('sales-pay-discount') && gid('sales-pay-discount').value) || 0;
  var cash = parseFloat(gid('sales-pay-cash') && gid('sales-pay-cash').value) || 0;
  var chk = parseFloat(gid('sales-pay-check') && gid('sales-pay-check').value) || 0;
  var checkDate = gid('sales-pay-check-date') ? String(gid('sales-pay-check-date').value || '').trim() : '';
  var actual = parseFloat(gid('sales-pay-actual') && gid('sales-pay-actual').value) || 0;
  if (discount < 0 || cash < 0 || chk < 0) { toast('Amounts must be >= 0', 'err'); return; }
  if (Math.abs(actual - cash - chk) > 0.02) { toast('Actual must equal Cash + Cheque', 'err'); return; }
  var allocations = [];
  var cbs = document.querySelectorAll('.sales-pay-oid-cb:checked');
  if (!cbs.length) { toast('Select at least one order', 'err'); return; }
  var nowIso = new Date().toISOString();
  if (mode === 'full') {
    var sumRem = 0;
    cbs.forEach(function(cb) {
      var oid = cb.getAttribute('data-oid');
      var o = salesOrders.find(function(x) { return x.id === oid; });
      if (!o) return;
      var rem = csmSalesOrderRemainingAed(o);
      sumRem = csmSalesRound2(sumRem + rem);
      allocations.push({ orderId: oid, amountAed: rem });
    });
    if (!allocations.length) { toast('No amounts to apply', 'err'); return; }
    var settle = csmSalesRound2(actual + discount);
    if (Math.abs(settle - sumRem) > 0.08) {
      toast('Actual + Discount must equal sum of selected remainings (' + sumRem.toFixed(2) + ')', 'err');
      return;
    }
  } else {
    var partialErr = '';
    cbs.forEach(function(cb) {
      if (partialErr) return;
      var oid = cb.getAttribute('data-oid');
      var tr = cb.closest && cb.closest('tr');
      var inp = tr ? tr.querySelector('input.sales-pay-partial-inp') : null;
      var raw = inp ? String(inp.value || '').trim() : '';
      var amt = parseFloat(raw);
      if (!(amt > 0)) return;
      var o = salesOrders.find(function(x) { return x.id === oid; });
      if (!o) return;
      var rem = csmSalesOrderRemainingAed(o);
      if (amt > rem + 0.05) {
        partialErr = 'Pay now cannot exceed remaining on ' + (o.orderNo || oid);
        return;
      }
      allocations.push({ orderId: oid, amountAed: csmSalesRound2(amt) });
    });
    if (partialErr) { toast(partialErr, 'err'); return; }
    if (!allocations.length) { toast('Enter Pay now amount for at least one selected order', 'err'); return; }
    var sumAlloc = allocations.reduce(function(s, a) { return s + a.amountAed; }, 0);
    sumAlloc = csmSalesRound2(sumAlloc);
    var settle = csmSalesRound2(actual + discount);
    if (Math.abs(settle - sumAlloc) > 0.08) {
      toast('Actual + Discount must equal sum of Pay now (' + sumAlloc.toFixed(2) + ')', 'err');
      return;
    }
  }
  var payId = 'cpay_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var snapName = cust ? csmSalesCustomerOrderSnapshotName(cust) : '';
  var payRec = {
    mode: mode,
    customerId: cid,
    customerNameSnapshot: snapName,
    discountAed: discount,
    cashAed: cash,
    checkAed: chk,
    checkDate: checkDate,
    actualReceivedAed: actual,
    allocations: allocations,
    createdAt: nowIso,
    createdBy: currentUserEmail || currentUser || ''
  };
  var updates = {};
  updates['csm_sales_w1/payments/' + payId] = payRec;
  allocations.forEach(function(a) {
    var o = salesOrders.find(function(x) { return x.id === a.orderId; });
    if (!o) return;
    var prevAr = csmSalesOrderArReceivedAed(o);
    var newAr = csmSalesRound2(prevAr + a.amountAed);
    var tot = csmSalesOrderTotalAed(o);
    var path = 'csm_sales_w1/orders/' + a.orderId + '/';
    updates[path + 'arReceivedAed'] = newAr;
    updates[path + 'updatedAt'] = nowIso;
    if (newAr + 0.02 >= tot) {
      updates[path + 'paymentPaidStatus'] = 'paid';
      updates[path + 'paymentConfirmedAt'] = nowIso;
      updates[path + 'paymentConfirmedBy'] = currentUserEmail || currentUser || '';
    }
  });
  runChunkedRootUpdate(updates).then(function() {
    toast('Payment saved', 'ok');
    clSalesCustomerPayModal();
  }).catch(function(e) {
    toast(e.message || String(e), 'err');
  });
}
function renderSalesCustomersTable() {
  var tb = gid('tb-sales-customers');
  if (!tb) return;
  if (!salesCustomers.length) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888">No customers yet</td></tr>';
    return;
  }
  tb.innerHTML = salesCustomers.map(function(c) {
    var sid = String(c.id || '').replace(/'/g, '\\\'');
    return '<tr><td style="font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(csmSalesCustomerShortName(c) || '\u2014') + '</td><td style="font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(csmSalesCustomerNameFull(c)) + '</td><td>' + csmEscapeHtml(c.address) + '</td><td>' + csmEscapeHtml(c.vatNumber) + '</td><td>' + csmEscapeHtml(c.phone) + '</td><td>' + csmEscapeHtml(c.email) + '</td><td>' +
      '<button class="abtn" onclick="openSalesCustomerModal(\'' + sid + '\')">Edit</button> ' +
      '<button class="abtn x" onclick="deleteSalesCustomer(\'' + sid + '\')">Del</button></td></tr>';
  }).join('');
}
function csmSalesEnsurePagerSizes() {
  if (csmSalesEnsurePagerSizes._done) return;
  csmSalesEnsurePagerSizes._done = true;
  var ok = { 10: 1, 20: 1, 50: 1, 100: 1 };
  try {
    var a = parseInt(localStorage.getItem('csm_sales_orders_ps'), 10);
    if (ok[a]) salesOrdersPageSize = a;
    var b = parseInt(localStorage.getItem('csm_sales_fin_ps'), 10);
    if (ok[b]) salesFinancePageSize = b;
  } catch (e1) {}
}
function csmSalesPagerNavHtml(page, totalPages, goFnName) {
  var parts = [];
  function navBtn(label, targetPage, isDisabled) {
    if (isDisabled) {
      parts.push('<button type="button" class="btn btn-s" disabled style="opacity:.45">' + label + '</button>');
    } else {
      parts.push('<button type="button" class="btn btn-s" onclick="' + goFnName + '(' + targetPage + ')">' + label + '</button>');
    }
  }
  function pageBtn(pi) {
    if (pi === page) {
      parts.push('<span class="bdg" style="display:inline-block;min-width:1.6em;text-align:center">' + pi + '</span>');
    } else {
      parts.push('<button type="button" class="btn btn-s" onclick="' + goFnName + '(' + pi + ')">' + pi + '</button>');
    }
  }
  navBtn('First', 1, page <= 1);
  navBtn('Prev', page - 1, page <= 1);
  if (totalPages <= 15) {
    for (var i = 1; i <= totalPages; i++) pageBtn(i);
  } else {
    parts.push('<span class="bdg" style="display:inline-block;padding:5px 10px">Page ' + page + ' / ' + totalPages + '</span>');
  }
  navBtn('Next', page + 1, page >= totalPages);
  navBtn('Last', totalPages, page >= totalPages);
  return parts.join(' ');
}
function csmSalesBindOrdersPager(totalRows) {
  var rangeEl = gid('sales-orders-pager-range');
  var navEl = gid('sales-orders-pager-nav');
  var psEl = gid('sales-orders-page-size');
  var wrap = gid('sales-orders-pager');
  var ps = salesOrdersPageSize;
  if (ps !== 10 && ps !== 20 && ps !== 50 && ps !== 100) ps = 20;
  if (psEl) psEl.value = String(ps);
  if (wrap) wrap.style.display = 'flex';
  var page = salesOrdersPage;
  if (totalRows === 0) {
    if (rangeEl) rangeEl.textContent = '0 rows';
    if (navEl) navEl.innerHTML = '';
    return;
  }
  var totalPages = Math.max(1, Math.ceil(totalRows / ps));
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  var from = (page - 1) * ps + 1;
  var to = Math.min(totalRows, page * ps);
  if (rangeEl) rangeEl.textContent = 'Showing ' + from + '–' + to + ' of ' + totalRows + ' rows';
  if (navEl) navEl.innerHTML = csmSalesPagerNavHtml(page, totalPages, 'csmSalesOrdersGoPage');
}
function csmSalesBindFinancePager(totalRows) {
  var rangeEl = gid('sales-finance-pager-range');
  var navEl = gid('sales-finance-pager-nav');
  var psEl = gid('sales-finance-page-size');
  var wrap = gid('sales-finance-pager');
  var ps = salesFinancePageSize;
  if (ps !== 10 && ps !== 20 && ps !== 50 && ps !== 100) ps = 20;
  if (psEl) psEl.value = String(ps);
  if (wrap) wrap.style.display = 'flex';
  var page = salesFinancePage;
  if (totalRows === 0) {
    if (rangeEl) rangeEl.textContent = '0 rows';
    if (navEl) navEl.innerHTML = '';
    return;
  }
  var totalPages = Math.max(1, Math.ceil(totalRows / ps));
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  var from = (page - 1) * ps + 1;
  var to = Math.min(totalRows, page * ps);
  if (rangeEl) rangeEl.textContent = 'Showing ' + from + '–' + to + ' of ' + totalRows + ' rows';
  if (navEl) navEl.innerHTML = csmSalesPagerNavHtml(page, totalPages, 'csmSalesFinanceGoPage');
}
function csmSalesOrdersGoPage(p) {
  salesOrdersPage = Math.max(1, parseInt(p, 10) || 1);
  renderSalesOrdersTable();
}
function csmSalesOrdersSetPageSize(sel) {
  var v = parseInt(sel && sel.value, 10) || 20;
  salesOrdersPageSize = (v === 10 || v === 20 || v === 50 || v === 100) ? v : 20;
  salesOrdersPage = 1;
  try { localStorage.setItem('csm_sales_orders_ps', String(salesOrdersPageSize)); } catch (e1) {}
  renderSalesOrdersTable();
}
function salesOrdersFilterChange() {
  salesOrdersPage = 1;
  renderSalesOrdersTable();
}
function csmSalesFinanceGoPage(p) {
  salesFinancePage = Math.max(1, parseInt(p, 10) || 1);
  renderSalesFinanceTable();
}
function csmSalesFinanceSetPageSize(sel) {
  var v = parseInt(sel && sel.value, 10) || 20;
  salesFinancePageSize = (v === 10 || v === 20 || v === 50 || v === 100) ? v : 20;
  salesFinancePage = 1;
  try { localStorage.setItem('csm_sales_fin_ps', String(salesFinancePageSize)); } catch (e1) {}
  renderSalesFinanceTable();
}
function renderSalesOrdersTable() {
  var tb = gid('tb-sales-orders');
  if (!tb) return;
  csmSalesEnsurePagerSizes();
  var f = gid('sales-order-filter');
  var st = f ? f.value : '';
  var rows = salesOrders.filter(function(o) { return !st || o.orderStatus === st; });
  function updOrdSummary(n, sq, sn, sv, stt) {
    var fq = gid('sales-orders-foot-qty');
    var fv = gid('sales-orders-foot-vat');
    var ft = gid('sales-orders-foot-total');
    if (fq) fq.textContent = String(csmSalesRound2(sq));
    if (fv) fv.textContent = csmSalesRound2(sv).toFixed(2);
    if (ft) ft.textContent = csmSalesRound2(stt).toFixed(2);
  }
  var ps = salesOrdersPageSize;
  if (ps !== 10 && ps !== 20 && ps !== 50 && ps !== 100) ps = 20;
  salesOrdersPageSize = ps;
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="20" style="text-align:center;color:#888">No orders</td></tr>';
    updOrdSummary(0, 0, 0, 0, 0);
    csmSalesBindOrdersPager(0);
    return;
  }
  var totalRows = rows.length;
  var totalPages = Math.max(1, Math.ceil(totalRows / ps));
  if (salesOrdersPage > totalPages) salesOrdersPage = totalPages;
  if (salesOrdersPage < 1) salesOrdersPage = 1;
  var pageRows = rows.slice((salesOrdersPage - 1) * ps, salesOrdersPage * ps);
  var sumQty = 0;
  var sumNet = 0;
  var sumVat = 0;
  var sumTot = 0;
  rows.forEach(function(o) {
    if (o.voided) return;
    csmSalesNormalizeLinesFromOrder(o).forEach(function(L) {
      sumQty += parseFloat(L.quantity) || 0;
    });
    var a = csmSalesLineNetVatTotal(o);
    sumNet += a.net;
    sumVat += a.vat;
    sumTot += a.total;
  });
  var rowCountActive = rows.filter(function(o) { return !o.voided; }).length;
  updOrdSummary(rowCountActive, sumQty, sumNet, sumVat, sumTot);
  tb.innerHTML = pageRows.map(function(o) {
    var lines = csmSalesNormalizeLinesFromOrder(o);
    var L0 = lines[0] || {};
    var vm0 = csmSalesLineVatMode(L0, o);
    var nv0 = lines.length ? csmSalesNetUnitAndVatFromLine(L0, vm0) : csmSalesNetUnitAndVat(o);
    var up0 = parseFloat(L0.unitPrice);
    if (!(up0 >= 0)) up0 = parseFloat(o.unitPrice) || 0;
    var q0 = parseFloat(L0.quantity);
    if (!(q0 > 0)) q0 = parseFloat(o.quantity) || 0;
    var lineTot = csmSalesLineTotalForDisplay(o);
    var voided = !!o.voided;
    var statusCell = csmSalesOrderStatusCellHtml(o);
    var actions = '';
    if (voided && o.orderStatus === 'draft') {
      actions = '<span style="color:inherit;font-weight:700">\u5DF2\u4F5C\u5E9F</span>';
    } else if (o.orderStatus === 'draft') {
      actions = '<button class="abtn" onclick="openSalesOrderModal(\'' + o.id + '\')">Edit</button> ' +
        '<button class="abtn x" onclick="salesDeleteOrder(\'' + o.id + '\')">Del</button>';
    } else if (o.orderStatus === 'submitted') {
      actions = '<button class="abtn" onclick="salesUndoSubmit(\'' + o.id + '\')">Withdraw</button>';
    } else {
      actions = '<span style="color:inherit;font-weight:700">Locked</span>';
    }
    var trClassName = voided ? 'csm-sales-tr-voided' : (function() {
      var stRow = String(o.orderStatus || '').toLowerCase();
      if (stRow === 'draft') return 'csm-sales-tr-draft';
      if (stRow === 'submitted') return 'csm-sales-tr-submitted';
      return 'csm-sales-tr-confirmed';
    })();
    var cbDis = voided ? ' disabled' : '';
    var gidAttr = csmSalesOrderRowGidAttr(o.id);
    var expandBtn = lines.length > 1
      ? '<button type="button" class="abtn" style="background:#f0f0f0;border:1px solid #ddd;padding:2px 6px;font-size:14px;margin-right:6px" onclick="csmSalesToggleOrderSubRows(\'' + gidAttr + '\',this)">+</button>'
      : '';
    var cnCell = expandBtn + csmEscapeHtml(L0.containerNo || o.containerNo || '') +
      (lines.length > 1 ? '<span style="color:#888;font-size:11px;margin-left:4px">(' + lines.length + ')</span>' : '');
    var prodCell = w1ProductHtml(L0.productName || o.productName || '');
    var subHtml = '';
    if (lines.length > 1) {
      for (var li = 1; li < lines.length; li++) {
        var L = lines[li];
        var vmL = csmSalesLineVatMode(L, o);
        var aL = csmSalesComputeTotals(L.unitPrice, L.quantity, vmL);
        var nvL = csmSalesNetUnitAndVatFromLine(L, vmL);
        subHtml += '<tr class="csm-sales-ord-sub ' + trClassName + '" data-so-gid="' + gidAttr + '" style="display:none;background:rgba(21,101,192,.05)">' +
          '<td class="csm-sel-td"></td>' +
          '<td colspan="3"></td>' +
          '<td>' + csmEscapeHtml(L.containerNo) + '</td>' +
          '<td>' + w1ProductHtml(L.productName) + '</td>' +
          '<td>' + csmEscapeHtml(String(L.quantity)) + '</td>' +
          '<td>' + csmEscapeHtml((parseFloat(L.unitPrice) || 0).toFixed(2)) + '</td>' +
          '<td>' + csmEscapeHtml(nvL.netUnit.toFixed(2)) + '</td>' +
          '<td>' + csmEscapeHtml(nvL.vatAmt.toFixed(2)) + '</td>' +
          '<td>' + aL.total.toFixed(2) + '</td>' +
          '<td>' + csmSalesServiceCellHtml(L.workerName, L.workerQty) + '</td>' +
          '<td>' + csmSalesServiceCellHtml(L.truckName, L.truckQty) + '</td>' +
          '<td colspan="7"></td>' +
          '</tr>';
      }
    }
    return '<tr class="' + trClassName + '"><td class="csm-sel-td"><input type="checkbox" class="csm-sales-row-cb"' + cbDis + ' onchange="csmSalesOrderCbExclusive(this)" data-sales-order-id="' + csmAttrEscape(o.id) + '" title="\u9009\u4E2D\u6B64\u6761\u8BB0\u5F55" aria-label="Select row"></td><td>' + csmEscapeHtml(o.orderNo || '\u2014') + '</td><td>' + csmEscapeHtml(csmSalesFormatOrderCreated(o.createdAt)) + '</td><td>' + csmEscapeHtml(o.customerName || '') + '</td><td>' + cnCell + '</td><td>' + prodCell + '</td><td>' + csmEscapeHtml(String(q0)) + '</td><td>' +
      csmEscapeHtml(up0.toFixed(2)) + '</td><td>' + csmEscapeHtml(nv0.netUnit.toFixed(2)) + '</td><td>' + csmEscapeHtml(nv0.vatAmt.toFixed(2)) + '</td><td>' + lineTot.toFixed(2) + '</td><td>' + csmSalesServiceCellHtml(L0.workerName, L0.workerQty) + '</td><td>' + csmSalesServiceCellHtml(L0.truckName, L0.truckQty) + '</td><td>' + csmEscapeHtml(csmSalesPaymentMethodLabel(csmSalesGetPaymentMethod(o))) + '</td><td>' + csmSalesPaymentStatusCellHtml(o) + '</td><td>' + csmEscapeHtml(csmSalesOrderReceiverDisplay(o)) + '</td><td>' + statusCell + '</td><td>' + actions + '</td><td>' + csmSalesPaymentConfirmCellHtml(o) + '</td><td>' + csmSalesPrintInvoiceCellHtml(o) + '</td></tr>' + subHtml;
  }).join('');
  csmSalesBindOrdersPager(totalRows);
}
function renderSalesFinanceTable() {
  var tb = gid('tb-sales-finance');
  var elLines = gid('sales-fin-lines');
  var elTot = gid('sales-fin-total');
  var elUn = gid('sales-fin-unpaid');
  if (!tb) return;
  csmSalesEnsurePagerSizes();
  var conf = salesOrders.filter(function(o) { return o.orderStatus === 'confirmed' && !o.voided; });
  if (elLines) elLines.textContent = String(conf.length);
  var sum = conf.reduce(function(s, o) { return s + csmSalesLineTotalForDisplay(o); }, 0);
  var sumUn = conf.filter(function(o) { return !csmSalesIsPaymentFinanciallyPaid(o); })
    .reduce(function(s, o) { return s + csmSalesOrderRemainingAed(o); }, 0);
  if (elTot) elTot.textContent = sum.toFixed(2);
  if (elUn) elUn.textContent = sumUn.toFixed(2);
  function updFinSummary(n, sq, sn, sv, stt) {
    var fq = gid('sales-finance-foot-qty');
    var fv = gid('sales-finance-foot-vat');
    var ft = gid('sales-finance-foot-total');
    if (fq) fq.textContent = String(csmSalesRound2(sq));
    if (fv) fv.textContent = csmSalesRound2(sv).toFixed(2);
    if (ft) ft.textContent = csmSalesRound2(stt).toFixed(2);
  }
  if (!conf.length) {
    tb.innerHTML = '<tr><td colspan="18" style="text-align:center;color:#888">No confirmed orders</td></tr>';
    updFinSummary(0, 0, 0, 0, 0);
    csmSalesBindFinancePager(0);
    return;
  }
  var sorted = conf.slice().sort(function(a, b) {
    var an = String(a.orderNo || '');
    var bn = String(b.orderNo || '');
    if (an && bn) return bn.localeCompare(an, undefined, { numeric: true });
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    return String(b.confirmedAt || b.createdAt || '').localeCompare(String(a.confirmedAt || a.createdAt || ''));
  });
  var ps = salesFinancePageSize;
  if (ps !== 10 && ps !== 20 && ps !== 50 && ps !== 100) ps = 20;
  salesFinancePageSize = ps;
  var totalRows = sorted.length;
  var totalPages = Math.max(1, Math.ceil(totalRows / ps));
  if (salesFinancePage > totalPages) salesFinancePage = totalPages;
  if (salesFinancePage < 1) salesFinancePage = 1;
  var pageRows = sorted.slice((salesFinancePage - 1) * ps, salesFinancePage * ps);
  var fq = 0;
  var fn = 0;
  var fv = 0;
  var ft = 0;
  sorted.forEach(function(o) {
    if (o.voided) return;
    csmSalesNormalizeLinesFromOrder(o).forEach(function(L) {
      fq += parseFloat(L.quantity) || 0;
    });
    var a = csmSalesLineNetVatTotal(o);
    fn += a.net;
    fv += a.vat;
    ft += a.total;
  });
  updFinSummary(sorted.length, fq, fn, fv, ft);
  tb.innerHTML = pageRows.map(function(o) {
    var lines = csmSalesNormalizeLinesFromOrder(o);
    var L0 = lines[0] || {};
    var vm0 = csmSalesLineVatMode(L0, o);
    var nv0 = lines.length ? csmSalesNetUnitAndVatFromLine(L0, vm0) : csmSalesNetUnitAndVat(o);
    var up0 = parseFloat(L0.unitPrice);
    if (!(up0 >= 0)) up0 = parseFloat(o.unitPrice) || 0;
    var q0 = parseFloat(L0.quantity);
    if (!(q0 > 0)) q0 = parseFloat(o.quantity) || 0;
    var gidAttr = csmSalesOrderRowGidAttr(o.id);
    var expandBtn = lines.length > 1
      ? '<button type="button" class="abtn" style="background:#f0f0f0;border:1px solid #ddd;padding:2px 6px;font-size:14px;margin-right:6px" onclick="csmSalesToggleOrderSubRows(\'' + gidAttr + '\',this)">+</button>'
      : '';
    var cnCell = expandBtn + csmEscapeHtml(L0.containerNo || o.containerNo || '') +
      (lines.length > 1 ? '<span style="color:#888;font-size:11px;margin-left:4px">(' + lines.length + ')</span>' : '');
    var prodCell = w1ProductHtml(L0.productName || o.productName || '');
    var subHtml = '';
    if (lines.length > 1) {
      for (var li = 1; li < lines.length; li++) {
        var L = lines[li];
        var vmL = csmSalesLineVatMode(L, o);
        var aL = csmSalesComputeTotals(L.unitPrice, L.quantity, vmL);
        var nvL = csmSalesNetUnitAndVatFromLine(L, vmL);
        subHtml += '<tr class="csm-sales-ord-sub" data-so-gid="' + gidAttr + '" style="display:none;background:rgba(21,101,192,.05)">' +
          '<td class="csm-sel-td"></td>' +
          '<td colspan="3"></td>' +
          '<td>' + csmEscapeHtml(L.containerNo) + '</td>' +
          '<td>' + w1ProductHtml(L.productName) + '</td>' +
          '<td>' + csmEscapeHtml(String(L.quantity)) + '</td>' +
          '<td>' + csmEscapeHtml((parseFloat(L.unitPrice) || 0).toFixed(2)) + '</td>' +
          '<td>' + csmEscapeHtml(nvL.netUnit.toFixed(2)) + '</td>' +
          '<td>' + csmEscapeHtml(nvL.vatAmt.toFixed(2)) + '</td>' +
          '<td>' + aL.total.toFixed(2) + '</td>' +
          '<td>' + csmSalesServiceCellHtml(L.workerName, L.workerQty) + '</td>' +
          '<td>' + csmSalesServiceCellHtml(L.truckName, L.truckQty) + '</td>' +
          '<td></td><td></td><td></td><td></td><td></td>' +
          '</tr>';
      }
    }
    return '<tr><td class="csm-sel-td"><input type="checkbox" class="csm-sales-row-cb" data-sales-order-id="' + csmAttrEscape(o.id) + '" title="\u9009\u4E2D\u6B64\u6761\u8BB0\u5F55" aria-label="Select row"></td><td>' + csmEscapeHtml(o.orderNo || '\u2014') + '</td><td>' + csmEscapeHtml(csmSalesFormatOrderCreated(o.createdAt)) + '</td><td>' + csmEscapeHtml(o.customerName || '') + '</td><td>' + cnCell + '</td><td>' + prodCell + '</td><td>' + csmEscapeHtml(String(q0)) + '</td><td>' +
      csmEscapeHtml(up0.toFixed(2)) + '</td><td>' + csmEscapeHtml(nv0.netUnit.toFixed(2)) + '</td><td>' + csmEscapeHtml(nv0.vatAmt.toFixed(2)) + '</td><td>' +
      csmSalesLineTotalForDisplay(o).toFixed(2) + '</td><td>' + csmSalesServiceCellHtml(L0.workerName, L0.workerQty) + '</td><td>' + csmSalesServiceCellHtml(L0.truckName, L0.truckQty) + '</td><td>' + csmEscapeHtml(csmSalesOrderReceiverDisplay(o)) + '</td><td>' + csmEscapeHtml(csmSalesPaymentMethodLabel(csmSalesGetPaymentMethod(o))) + '</td><td>' + csmSalesPaymentStatusCellHtml(o) + '</td><td>' + csmSalesPaymentConfirmCellHtml(o) + '</td><td>' + csmSalesPrintInvoiceCellHtml(o) + '</td></tr>' + subHtml;
  }).join('');
  csmSalesBindFinancePager(totalRows);
}
function swFinSub(view) {
  finSubView = view || 'orders';
  try { sessionStorage.setItem('csm_fin_sub', finSubView); } catch (e0) {}
  var pOrd = gid('fin-panel-orders');
  var pWt = gid('fin-panel-wt');
  if (pOrd) pOrd.style.display = finSubView === 'orders' ? 'block' : 'none';
  if (pWt) pWt.style.display = finSubView === 'wt' ? 'block' : 'none';
  var b1 = gid('fin-sub-btn-orders');
  var b2 = gid('fin-sub-btn-wt');
  if (b1) { b1.classList.toggle('btn-s', finSubView === 'orders'); b1.classList.toggle('btn-g', finSubView !== 'orders'); }
  if (b2) { b2.classList.toggle('btn-s', finSubView === 'wt'); b2.classList.toggle('btn-g', finSubView !== 'wt'); }
  if (finSubView === 'wt') renderFinWtPanel();
}
/** Worker/truck settlement: only admin may Confirm paid — staff (员工) never. */
function csmFinWtCanConfirmPaid() {
  if (isStaff) return false;
  return isAdmin === true;
}
function csmFinWtStatusNorm(b) {
  return String(b && b.status != null ? b.status : '').trim().toLowerCase();
}
/** Same as Payment records: not yet paid (Pending). Includes missing/legacy status, any case. */
function csmFinWtIsAwaitingPayment(b) {
  if (!b) return false;
  var s = csmFinWtStatusNorm(b);
  return s !== 'paid' && s !== 'void' && s !== 'cancelled';
}
/** True when batch is fully paid (case-insensitive; matches 待审批 vs Payment records). */
function csmFinWtIsPaid(b) {
  return csmFinWtStatusNorm(b) === 'paid';
}
function csmSalesOrderFinTimeMs(o) {
  var s = String(o && (o.confirmedAt || o.createdAt) || '').trim();
  if (!s) return 0;
  var d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function csmFinWtLineKey(orderId, lineIndex) {
  return String(orderId || '') + ':' + String(lineIndex);
}
/** Suffix #w / #t so worker and truck can be paid in separate batches on the same line. */
function csmFinWtLineKeyForFee(orderId, lineIndex, feeKind) {
  var base = csmFinWtLineKey(orderId, lineIndex);
  if (feeKind === 'worker') return base + '#w';
  if (feeKind === 'truck') return base + '#t';
  return base;
}
function csmFinWtKeysConflict(s, b) {
  if (!s || !b) return false;
  if (s === b) return true;
  s = String(s);
  b = String(b);
  var sb = s.replace(/#w$|#t$/, '');
  var bb = b.replace(/#w$|#t$/, '');
  if (sb !== bb) return false;
  if (b === sb) return s === sb || s === sb + '#w' || s === sb + '#t' || s === b;
  if (s === sb) return b === sb || b === sb + '#w' || b === sb + '#t' || b === s;
  return (s === sb + '#w' && (b === sb + '#w' || b === sb)) || (s === sb + '#t' && (b === sb + '#t' || b === sb));
}
function csmFinWtLineSettlementStatus(searchKey) {
  var hasPaid = false;
  var hasPend = false;
  var list = salesWtSettlements || [];
  for (var bi = 0; bi < list.length; bi++) {
    var b = list[bi];
    var keys = b.lineKeys || [];
    for (var i = 0; i < keys.length; i++) {
      if (!csmFinWtKeysConflict(searchKey, keys[i])) continue;
      if (csmFinWtIsPaid(b)) { hasPaid = true; break; }
      if (csmFinWtIsAwaitingPayment(b)) hasPend = true;
    }
    if (hasPaid) break;
  }
  if (hasPaid) return 'paid';
  if (hasPend) return 'pending';
  return '';
}
function csmFinWtReservedLineKeySet() {
  var set = {};
  (salesWtSettlements || []).forEach(function(b) {
    if (!b) return;
    var sn = csmFinWtStatusNorm(b);
    if (sn === 'void' || sn === 'cancelled') return;
    if (sn !== 'pending' && sn !== 'paid' && String(b.status != null ? b.status : '').trim() !== '') return;
    (b.lineKeys || []).forEach(function(k) {
      set[k] = true;
      if (k.indexOf('#') === -1) {
        set[k + '#w'] = true;
        set[k + '#t'] = true;
      }
    });
  });
  return set;
}
function csmFinWtGetCurrentFeeType() {
  var el = gid('fin-wt-fee-type');
  var v = el ? String(el.value || '').toLowerCase() : '';
  return v === 'truck' ? 'truck' : 'worker';
}
function csmFinWtOnFeeTypeChange() {
  var ft = csmFinWtGetCurrentFeeType();
  var ww = gid('fin-wt-worker-wrap');
  var tw = gid('fin-wt-truck-wrap');
  if (ww) ww.style.display = ft === 'worker' ? '' : 'none';
  if (tw) tw.style.display = ft === 'truck' ? '' : 'none';
  var tbl = gid('fin-wt-results-table');
  if (tbl) {
    tbl.classList.remove('csm-wt-fee-worker', 'csm-wt-fee-truck');
    tbl.classList.add(ft === 'truck' ? 'csm-wt-fee-truck' : 'csm-wt-fee-worker');
  }
}
try { window.csmFinWtOnFeeTypeChange = csmFinWtOnFeeTypeChange; } catch (eFE) {}
function csmFinWtEnumerateLines(workerId, truckId, tStart, tEnd, feeKind) {
  feeKind = feeKind === 'truck' ? 'truck' : 'worker';
  var rows = [];
  (salesOrders || []).forEach(function(o) {
    if (o.voided || String(o.orderStatus || '').toLowerCase() !== 'confirmed') return;
    var ts = csmSalesOrderFinTimeMs(o);
    if (tStart > 0 && ts < tStart) return;
    if (tEnd > 0 && ts > tEnd) return;
    var lines = csmSalesNormalizeLinesFromOrder(o);
    lines.forEach(function(L, idx) {
      if (workerId && String(L.workerId || '').trim() !== workerId) return;
      if (truckId && String(L.truckId || '').trim() !== truckId) return;
      var wq = parseFloat(L.workerQty) || 0;
      var tq = parseFloat(L.truckQty) || 0;
      var wa = csmSalesRound2(parseFloat(L.workerAmount) || 0);
      var ta = csmSalesRound2(parseFloat(L.truckAmount) || 0);
      if (feeKind === 'worker') {
        if (wa <= 0 && wq <= 0) return;
        tq = 0;
        ta = 0;
      } else {
        if (ta <= 0 && tq <= 0) return;
        wq = 0;
        wa = 0;
      }
      if (!workerId && !truckId && wq <= 0 && tq <= 0 && wa <= 0 && ta <= 0) return;
      var lineKey = csmFinWtLineKeyForFee(o.id, idx, feeKind);
      var lineTotal = csmSalesRound2(feeKind === 'worker' ? wa : ta);
      rows.push({
        lineKey: lineKey,
        orderId: o.id,
        lineIndex: idx,
        orderNo: o.orderNo || '',
        orderTime: o.confirmedAt || o.createdAt || '',
        customerName: o.customerName || '',
        containerNo: L.containerNo || '',
        productName: L.productName || '',
        workerName: String(L.workerName || '').trim(),
        workerQty: wq,
        workerAmount: wa,
        truckName: String(L.truckName || '').trim(),
        truckQty: tq,
        truckAmount: ta,
        lineTotal: lineTotal,
        feeKind: feeKind
      });
    });
  });
  rows.sort(function(a, b) {
    var tb = new Date(b.orderTime || 0).getTime();
    var ta2 = new Date(a.orderTime || 0).getTime();
    if (tb !== ta2) return tb - ta2;
    return String(b.orderNo || '').localeCompare(String(a.orderNo || ''), undefined, { numeric: true });
  });
  return rows;
}
function csmFinWtFillFilterSelects() {
  var wSel = gid('fin-wt-worker');
  var tSel = gid('fin-wt-truck');
  if (!wSel || !tSel) return;
  var cw = wSel.value;
  var ct = tSel.value;
  var hw = '<option value="">All workers</option>';
  (salesWorkers || []).forEach(function(x) {
    var id = String(x.id || '').trim();
    if (!id) return;
    var nm = String(x.name || '').trim() || id;
    hw += '<option value="' + csmEscapeHtml(id) + '">' + csmEscapeHtml(nm) + '</option>';
  });
  wSel.innerHTML = hw;
  if (cw) {
    for (var iw = 0; iw < wSel.options.length; iw++) {
      if (wSel.options[iw].value === cw) { wSel.value = cw; break; }
    }
  }
  var ht = '<option value="">All trucks</option>';
  (salesTrucks || []).forEach(function(x) {
    var id = String(x.id || '').trim();
    if (!id) return;
    var nm = String(x.name || '').trim() || id;
    ht += '<option value="' + csmEscapeHtml(id) + '">' + csmEscapeHtml(nm) + '</option>';
  });
  tSel.innerHTML = ht;
  if (ct) {
    for (var it = 0; it < tSel.options.length; it++) {
      if (tSel.options[it].value === ct) { tSel.value = ct; break; }
    }
  }
}
function renderFinWtPanel() {
  if (!gid('fin-panel-wt')) return;
  var pWt = gid('fin-panel-wt');
  if (pWt && !pWt.getAttribute('data-fin-wt-dates-init')) {
    pWt.setAttribute('data-fin-wt-dates-init', '1');
    var dsEl = gid('fin-wt-start');
    var deEl = gid('fin-wt-end');
    if (dsEl && deEl && !dsEl.value && !deEl.value) {
      var now = new Date();
      var y = now.getFullYear();
      var m = ('0' + (now.getMonth() + 1)).slice(-2);
      var d = ('0' + now.getDate()).slice(-2);
      dsEl.value = y + '-' + m + '-' + d + 'T00:00';
      deEl.value = y + '-' + m + '-' + d + 'T23:59';
    }
  }
  csmFinWtFillFilterSelects();
  try { csmFinWtOnFeeTypeChange(); } catch (eFT) {}
  var tb = gid('fin-wt-results-tbody');
  var ts = gid('fin-wt-settlements-tbody');
  if (tb) tb.innerHTML = '';
  if (ts) {
    if (!(salesWtSettlements || []).length) {
      ts.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#888;font-family:var(--csm-font-en);font-weight:700">No payment records yet</td></tr>';
    } else {
      ts.innerHTML = (salesWtSettlements || []).map(function(b) {
        var wN = (salesWorkers || []).find(function(x) { return x.id === b.filterWorkerId; });
        var tN = (salesTrucks || []).find(function(x) { return x.id === b.filterTruckId; });
        var wLab = wN ? String(wN.name || '').trim() : (b.filterWorkerId ? '—' : 'All');
        var tLab = tN ? String(tN.name || '').trim() : (b.filterTruckId ? '—' : 'All');
        var period = (b.dateStart || '—') + ' → ' + (b.dateEnd || '—');
        var gross = b.grossAed != null ? Number(b.grossAed) : 0;
        var disc = b.discountAmount != null ? Number(b.discountAmount) : '';
        var pay = b.paymentAmount != null ? Number(b.paymentAmount) : '';
        var stN = csmFinWtStatusNorm(b);
        var stHtml = csmFinWtIsPaid(b)
          ? '<span style="color:#2e7d32;font-family:var(--csm-font-en);font-weight:700">Paid</span>'
          : (stN === 'void' || stN === 'cancelled'
            ? '<span style="color:#90a4ae;font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(stN) + '</span>'
            : '<span style="color:#f57f17;font-family:var(--csm-font-en);font-weight:700">Pending</span>');
        var paidAt = b.paidAt ? csmSalesFormatOrderCreated(b.paidAt) : '—';
        var actions = '';
        var openForPay = csmFinWtIsAwaitingPayment(b);
        if (openForPay && csmFinWtCanConfirmPaid()) {
          actions = '<button type="button" class="abtn" style="font-family:var(--csm-font-en);font-weight:700" onclick="csmFinWtOpenConfirm(' + JSON.stringify(b.id) + ')">Confirm paid</button>';
        } else if (openForPay && !csmFinWtCanConfirmPaid()) {
          actions = '<span style="color:#888;font-size:12px;font-family:var(--csm-font-en);font-weight:700">' + (isStaff ? 'Admin only (staff cannot confirm)' : 'Awaiting admin') + '</span>';
        } else {
          actions = '—';
        }
        var sc = b.feeScope === 'truck' ? 'Truck' : (b.feeScope === 'worker' ? 'Worker' : 'Both');
        return '<tr><td style="font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(csmSalesFormatOrderCreated(b.createdAt)) + '</td>' +
          '<td style="font-size:12px;max-width:200px;white-space:normal">' + csmEscapeHtml(period) + '</td>' +
          '<td style="font-size:12px">' + csmEscapeHtml(sc) + '</td>' +
          '<td>' + csmEscapeHtml(wLab) + '</td><td>' + csmEscapeHtml(tLab) + '</td>' +
          '<td style="text-align:center">' + csmEscapeHtml(String((b.lineKeys || []).length)) + '</td>' +
          '<td style="text-align:right">' + gross.toFixed(2) + '</td>' +
          '<td style="text-align:right">' + (disc === '' ? '—' : Number(disc).toFixed(2)) + '</td>' +
          '<td style="text-align:right">' + (pay === '' ? '—' : Number(pay).toFixed(2)) + '</td>' +
          '<td>' + stHtml + '</td><td style="font-size:12px">' + csmEscapeHtml(paidAt) + '</td><td>' + actions + '</td></tr>';
      }).join('');
    }
  }
}
function csmFinWtRunSearch() {
  if (!salesOrdersRef) { toast('Database not connected', 'err'); return; }
  var feeK = csmFinWtGetCurrentFeeType();
  var wId = feeK === 'truck' ? '' : (gid('fin-wt-worker') ? String(gid('fin-wt-worker').value || '').trim() : '');
  var tId = feeK === 'worker' ? '' : (gid('fin-wt-truck') ? String(gid('fin-wt-truck').value || '').trim() : '');
  var ds = gid('fin-wt-start') ? String(gid('fin-wt-start').value || '').trim() : '';
  var de = gid('fin-wt-end') ? String(gid('fin-wt-end').value || '').trim() : '';
  if (!ds || !de) { toast('Set start time and end time', 'err'); return; }
  var tStart = ds ? new Date(ds).getTime() : 0;
  var tEnd = de ? new Date(de).getTime() : 0;
  if (ds && isNaN(tStart)) { toast('Invalid start time', 'err'); return; }
  if (de && isNaN(tEnd)) { toast('Invalid end time', 'err'); return; }
  if (tStart > 0 && tEnd > 0 && tEnd < tStart) { toast('End must be after start', 'err'); return; }
  try { csmFinWtOnFeeTypeChange(); } catch (e0) {}
  var rows = csmFinWtEnumerateLines(wId, tId, tStart, tEnd, feeK);
  var reserved = csmFinWtReservedLineKeySet();
  var tb = gid('fin-wt-results-tbody');
  var hint = gid('fin-wt-selection-hint');
  if (!tb) return;
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#888;font-family:var(--csm-font-en);font-weight:700">No matching lines for this fee type / 当前费用类型无行</td></tr>';
    if (hint) hint.textContent = '';
    return;
  }
  tb.innerHTML = rows.map(function(r) {
    var st = csmFinWtLineSettlementStatus(r.lineKey);
    var stCell = '';
    var cb = '';
    if (st === 'paid') {
      stCell = '<span style="color:#2e7d32;font-family:var(--csm-font-en);font-weight:700">Paid</span>';
    } else if (st === 'pending') {
      stCell = '<span style="color:#f57f17;font-family:var(--csm-font-en);font-weight:700">Pending</span>';
    } else {
      stCell = '<span style="color:#1565c0;font-family:var(--csm-font-en);font-weight:700">Listed</span>';
      var dis = reserved[r.lineKey] ? ' disabled' : '';
      cb = '<input type="checkbox" class="fin-wt-row-cb" data-line-key="' + csmEscapeHtml(r.lineKey) + '"' + dis + '>';
    }
    return '<tr><td>' + cb + '</td><td>' + stCell + '</td><td style="font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(r.orderNo || '—') + '</td>' +
      '<td style="font-size:12px">' + csmEscapeHtml(csmSalesFormatOrderCreated(r.orderTime)) + '</td>' +
      '<td>' + csmEscapeHtml(r.customerName) + '</td><td>' + csmEscapeHtml(r.containerNo) + '</td><td>' + w1ProductHtml(r.productName) + '</td>' +
      '<td class="fin-wt-col-w" style="text-align:right">' + r.workerQty + '</td><td class="fin-wt-col-w" style="text-align:right">' + r.workerAmount.toFixed(2) + '</td>' +
      '<td class="fin-wt-col-t" style="text-align:right">' + r.truckQty + '</td><td class="fin-wt-col-t" style="text-align:right">' + r.truckAmount.toFixed(2) + '</td>' +
      '<td style="text-align:right">' + r.lineTotal.toFixed(2) + '</td></tr>';
  }).join('');
  if (hint) hint.textContent = rows.length + ' line(s). Select rows, then Submit payment request.';
}
function csmFinWtSubmitPending() {
  if (!salesWtSettlementsRef) { toast('Database not connected', 'err'); return; }
  var ds = gid('fin-wt-start') ? String(gid('fin-wt-start').value || '').trim() : '';
  var de = gid('fin-wt-end') ? String(gid('fin-wt-end').value || '').trim() : '';
  if (!ds || !de) { toast('Set start time and end time', 'err'); return; }
  var keys = [];
  document.querySelectorAll('.fin-wt-row-cb:checked').forEach(function(cb) {
    var k = cb.getAttribute('data-line-key');
    if (k) keys.push(k);
  });
  if (!keys.length) { toast('Select at least one line', 'err'); return; }
  var feeK = csmFinWtGetCurrentFeeType();
  var wId = feeK === 'truck' ? '' : (gid('fin-wt-worker') ? String(gid('fin-wt-worker').value || '').trim() : '');
  var tId = feeK === 'worker' ? '' : (gid('fin-wt-truck') ? String(gid('fin-wt-truck').value || '').trim() : '');
  var tStart = ds ? new Date(ds).getTime() : 0;
  var tEnd = de ? new Date(de).getTime() : 0;
  var allRows = csmFinWtEnumerateLines(wId, tId, tStart, tEnd, feeK);
  var byKey = {};
  allRows.forEach(function(r) { byKey[r.lineKey] = r; });
  var snapshot = [];
  var gross = 0;
  var reserved = csmFinWtReservedLineKeySet();
  for (var i = 0; i < keys.length; i++) {
    var lk = keys[i];
    if (reserved[lk]) {
      toast('One or more lines are already in a pending or paid batch', 'err');
      return;
    }
    var row = byKey[lk];
    if (!row) {
      toast('Selection no longer matches search — run Search again', 'err');
      return;
    }
    snapshot.push({
      orderId: row.orderId,
      orderNo: row.orderNo,
      lineIndex: row.lineIndex,
      containerNo: row.containerNo,
      productName: row.productName,
      customerName: row.customerName,
      workerQty: row.workerQty,
      workerAmount: row.workerAmount,
      truckQty: row.truckQty,
      truckAmount: row.truckAmount
    });
    gross += row.lineTotal;
  }
  gross = csmSalesRound2(gross);
  var id = 'wt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var nowIso = new Date().toISOString();
  var rec = {
    feeScope: feeK,
    filterWorkerId: wId,
    filterTruckId: tId,
    dateStart: ds || '',
    dateEnd: de || '',
    lineKeys: keys,
    linesSnapshot: snapshot,
    grossAed: gross,
    status: 'pending',
    discountAmount: '',
    paymentAmount: '',
    createdAt: nowIso,
    createdBy: currentUserEmail || currentUser || '',
    submittedAt: nowIso
  };
  salesWtSettlementsRef.child(id).set(rec).then(function() {
    toast('Submitted — status Pending until admin confirms', 'ok');
    csmFinWtRunSearch();
    renderFinWtPanel();
  }).catch(function(e) {
    toast(e.message || String(e), 'err');
  });
}
function csmFinWtOpenConfirm(batchId) {
  if (!csmFinWtCanConfirmPaid()) { toast(isStaff ? 'Staff cannot confirm paid — admin only' : 'Admin only', 'err'); return; }
  var b = (salesWtSettlements || []).find(function(x) { return x.id === batchId; });
  if (!b || !csmFinWtIsAwaitingPayment(b)) { toast('Batch not found or already paid', 'err'); return; }
  var m = gid('fin-wt-confirm-modal');
  var idEl = gid('fin-wt-confirm-batch-id');
  var payEl = gid('fin-wt-confirm-pay');
  var disEl = gid('fin-wt-confirm-disc');
  if (!m || !idEl || !payEl || !disEl) return;
  idEl.value = batchId;
  var g = b.grossAed != null ? Number(b.grossAed) : 0;
  disEl.value = '0';
  payEl.value = String(csmSalesRound2(g));
  m.classList.add('sh');
}
function clFinWtConfirmModal() {
  var m = gid('fin-wt-confirm-modal');
  if (m) m.classList.remove('sh');
}
function csmFinWtConfirmApply() {
  if (!csmFinWtCanConfirmPaid() || !salesWtSettlementsRef) { toast(isStaff ? 'Staff cannot confirm paid — admin only' : 'Admin only', 'err'); return; }
  var batchId = (gid('fin-wt-confirm-batch-id') && gid('fin-wt-confirm-batch-id').value || '').trim();
  if (!batchId) return;
  var pay = parseFloat(gid('fin-wt-confirm-pay') && gid('fin-wt-confirm-pay').value);
  var dis = parseFloat(gid('fin-wt-confirm-disc') && gid('fin-wt-confirm-disc').value);
  if (isNaN(pay) || !isFinite(pay) || pay < 0) { toast('Enter a valid payment amount', 'err'); return; }
  if (isNaN(dis) || !isFinite(dis) || dis < 0) { toast('Enter a valid discount', 'err'); return; }
  var nowIso = new Date().toISOString();
  salesWtSettlementsRef.child(batchId).update({
    status: 'paid',
    paidAt: nowIso,
    paymentAmount: csmSalesRound2(pay),
    discountAmount: csmSalesRound2(dis),
    confirmedBy: currentUserEmail || currentUser || ''
  }).then(function() {
    toast('Marked paid — payment record saved', 'ok');
    clFinWtConfirmModal();
    csmFinWtRunSearch();
    renderFinWtPanel();
    try { renderCompanyFinancialPending(); } catch (eRcf) {}
  }).catch(function(e) {
    toast(e.message || String(e), 'err');
  });
}
function csmFinPendingDetailDomId(batchId) {
  return 'fin-pd-' + String(batchId || 'x').replace(/[^a-zA-Z0-9_-]/g, '_');
}
function csmFinWtSnapshotTableHtml(lines) {
  if (!lines || !lines.length) {
    return '<p style="margin:0;color:#888;font-family:var(--csm-font-en);font-weight:700">No line snapshot</p>';
  }
  var h = '<table style="width:100%;border-collapse:collapse;font-size:12px;font-family:var(--csm-font-en);font-weight:700"><thead><tr style="background:#eee">';
  h += '<th style="padding:6px 8px;text-align:left;text-transform:none">Order</th>';
  h += '<th style="padding:6px 8px;text-align:left;text-transform:none">Container</th>';
  h += '<th style="padding:6px 8px;text-align:left;text-transform:none">Product</th>';
  h += '<th style="padding:6px 8px;text-align:right;text-transform:none">W Qty</th>';
  h += '<th style="padding:6px 8px;text-align:right;text-transform:none">W AED</th>';
  h += '<th style="padding:6px 8px;text-align:right;text-transform:none">T Qty</th>';
  h += '<th style="padding:6px 8px;text-align:right;text-transform:none">T AED</th>';
  h += '</tr></thead><tbody>';
  lines.forEach(function(L) {
    h += '<tr>';
    h += '<td style="padding:6px 8px;border-bottom:1px solid #eee">' + csmEscapeHtml(String(L.orderNo || '—')) + '</td>';
    h += '<td style="padding:6px 8px;border-bottom:1px solid #eee">' + csmEscapeHtml(String(L.containerNo || '')) + '</td>';
    h += '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-transform:capitalize">' + w1ProductHtml(L.productName || '') + '</td>';
    h += '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + csmEscapeHtml(String(L.workerQty != null ? L.workerQty : '')) + '</td>';
    h += '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + (L.workerAmount != null ? Number(L.workerAmount).toFixed(2) : '—') + '</td>';
    h += '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + csmEscapeHtml(String(L.truckQty != null ? L.truckQty : '')) + '</td>';
    h += '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + (L.truckAmount != null ? Number(L.truckAmount).toFixed(2) : '—') + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table>';
  return h;
}
function csmFinWtPendingDetailInnerHtml(b) {
  var gross = b.grossAed != null ? Number(b.grossAed) : 0;
  var meta = '<div style="margin-bottom:10px;font-size:13px;line-height:1.5;color:#333;font-family:var(--csm-font-en);font-weight:700">';
  meta += '<div><span style="color:#666">Batch ID:</span> ' + csmEscapeHtml(String(b.id || '—')) + '</div>';
  meta += '<div><span style="color:#666">Fee scope / 费用范围:</span> ' + csmEscapeHtml(b.feeScope === 'truck' ? 'Truck · 送货' : (b.feeScope === 'worker' ? 'Worker · 卸货' : 'Legacy / 历史')) + '</div>';
  meta += '<div><span style="color:#666">Gross (AED):</span> ' + gross.toFixed(2) + '</div>';
  meta += '<div><span style="color:#666">Submitted at:</span> ' + csmEscapeHtml(csmSalesFormatOrderCreated(b.submittedAt || b.createdAt)) + '</div>';
  meta += '</div>';
  return meta + csmFinWtSnapshotTableHtml(b.linesSnapshot);
}
function csmFinPendingToggle(batchId) {
  var el = gid(csmFinPendingDetailDomId(batchId));
  if (!el) return;
  el.style.display = el.style.display === 'none' ? '' : 'none';
}
function csmFinCustomsFeeTypeDefs() {
  return [
    { key: 'logistics', cn: '停柜费', en: 'Logistics' },
    { key: 'coldFee', cn: '清关费', en: 'Customs clearance' },
    { key: 'attestation', cn: '冷藏费', en: 'Cold storage' },
    { key: 'repack', cn: '单据认证', en: 'Attestation' },
    { key: 'waste', cn: '翻包费', en: 'Repack' },
    { key: 'wasteCharge', cn: '垃圾处理费', en: 'Waste charge' },
    { key: 'other', cn: '其他费用', en: 'Other charge' }
  ];
}
function csmFinPendingAllCategoryDefs() {
  return [
    { key: 'logistics', kind: 'customs', cn: '停柜费', en: 'Parking' },
    { key: 'coldFee', kind: 'customs', cn: '清关费', en: 'Customs clearance' },
    { key: 'attestation', kind: 'customs', cn: '冷藏费', en: 'Cold storage' },
    { key: 'repack', kind: 'customs', cn: '单据认证', en: 'Attestation' },
    { key: 'waste', kind: 'customs', cn: '翻包费', en: 'Repack' },
    { key: 'wtAll', kind: 'wt', section: 'worker', cn: 'Worker 待审批', en: 'All · 全部' },
    { key: 'wtWorker', kind: 'wt', section: 'worker', cn: '卸货费', en: 'Worker' },
    { key: 'wtTruck', kind: 'wt', section: 'worker', cn: '送货费', en: 'Truck' },
    { key: 'wasteCharge', kind: 'customs', cn: '垃圾处理费', en: 'Waste charge' },
    { key: 'other', kind: 'customs', cn: '其他费用', en: 'Other charge' }
  ];
}
function csmFinWtBatchUnallocated(b) {
  if (!b || !csmFinWtIsAwaitingPayment(b)) return false;
  var s = csmFinWtBatchWorkerTruckSums(b);
  return s.worker <= 0 && s.truck <= 0;
}
function csmFinWtBatchWorkerTruckSums(b) {
  var w = 0;
  var t = 0;
  (b && b.linesSnapshot || []).forEach(function(L) {
    w += csmFinNum(L && L.workerAmount);
    t += csmFinNum(L && L.truckAmount);
  });
  return { worker: csmSalesRound2(w), truck: csmSalesRound2(t) };
}
function csmFinPendingComputeCategoryCounts() {
  var cPend = (customsFeeRequests || []).filter(function(r) { return String(r && r.status || 'pending') === 'pending'; });
  var wPend = (salesWtSettlements || []).filter(function(b) { return csmFinWtIsAwaitingPayment(b); });
  var counts = {};
  csmFinPendingAllCategoryDefs().forEach(function(m) { counts[m.key] = 0; });
  cPend.forEach(function(r) {
    var lines = (r && r.lines) || {};
    csmFinCustomsFeeTypeDefs().forEach(function(d) {
      if (csmFinNum(lines[d.key]) > 0) counts[d.key] += 1;
    });
  });
  counts.wtAll = wPend.length;
  wPend.forEach(function(b) {
    var s = csmFinWtBatchWorkerTruckSums(b);
    if (s.worker > 0) counts.wtWorker += 1;
    else if (csmFinWtBatchUnallocated(b)) counts.wtWorker += 1;
    if (s.truck > 0) counts.wtTruck += 1;
  });
  return counts;
}
function csmFinPendingBuildWtRowsHtml(pending) {
  return pending.map(function(b) {
    var wN = (salesWorkers || []).find(function(x) { return x.id === b.filterWorkerId; });
    var tN = (salesTrucks || []).find(function(x) { return x.id === b.filterTruckId; });
    var wLab = wN ? String(wN.name || '').trim() : (b.filterWorkerId ? '—' : 'All');
    var tLab = tN ? String(tN.name || '').trim() : (b.filterTruckId ? '—' : 'All');
    var period = (b.dateStart || '—') + ' → ' + (b.dateEnd || '—');
    var gross = b.grossAed != null ? Number(b.grossAed) : 0;
    var nLines = (b.lineKeys || []).length;
    var by = csmEscapeHtml(String(b.createdBy || '—'));
    var detailId = csmFinPendingDetailDomId(b.id);
    var canApr = csmFinWtCanConfirmPaid();
    var btnApr = canApr
      ? '<button type="button" class="abtn" style="background:#2e7d32;color:#fff;border:none;font-family:var(--csm-font-en);font-weight:700" onclick="csmFinWtQuickApprove(' + JSON.stringify(b.id) + ')">Approve · 批准</button>'
      : '<span style="color:#888;font-size:12px;font-family:var(--csm-font-en);font-weight:700">Admin only · 仅管理员</span>';
    var btnCustom = canApr
      ? ' <button type="button" class="abtn" style="font-family:var(--csm-font-en);font-weight:700" onclick="csmFinWtOpenConfirm(' + JSON.stringify(b.id) + ')">Set amount · 金额…</button>'
      : '';
    var btnDetail = '<button type="button" class="abtn" style="font-family:var(--csm-font-en);font-weight:700" onclick="csmFinPendingToggle(' + JSON.stringify(b.id) + ')">Detail · 明细</button>';
    return '<tr><td style="padding:10px 12px;font-size:12px">' + csmEscapeHtml(csmSalesFormatOrderCreated(b.createdAt)) + '</td>' +
      '<td style="padding:10px 12px;font-size:12px;max-width:160px;white-space:normal;word-break:break-all">' + by + '</td>' +
      '<td style="padding:10px 12px;font-size:11px;max-width:200px;white-space:normal">' + csmEscapeHtml(period) + '</td>' +
      '<td style="padding:10px 12px">' + csmEscapeHtml(wLab) + '</td><td style="padding:10px 12px">' + csmEscapeHtml(tLab) + '</td>' +
      '<td style="padding:10px 12px;text-align:center">' + csmEscapeHtml(String(nLines)) + '</td>' +
      '<td style="padding:10px 12px;text-align:right">' + gross.toFixed(2) + '</td>' +
      '<td style="padding:10px 12px;white-space:normal">' + btnDetail + ' ' + btnApr + btnCustom + '</td></tr>' +
      '<tr id="' + detailId + '" class="fin-pending-detail" style="display:none"><td colspan="8" style="padding:12px 14px;border-bottom:1px solid #ffe0b2">' + csmFinWtPendingDetailInnerHtml(b) + '</td></tr>';
  }).join('');
}
function csmFinPendingBuildCustomsRowsHtml(pending, lineKey) {
  var canApr = !!(isAdmin && customsFeePendingRef);
  return pending.map(function(r) {
    var lineAmt = csmFinNum((r.lines || {})[lineKey]);
    var sumTxt = csmEscapeHtml(csmFinCustomsSummaryText(r));
    var refNo = csmEscapeHtml(String(r.refNo || r.reference || '—'));
    var bl = csmEscapeHtml(String(r.bl || r.billOfLading || '—'));
    var cn = csmEscapeHtml(String(r.containerNo || r.cn || '—'));
    var by = csmEscapeHtml(String(r.submittedBy || r.createdBy || '—'));
    var rid = r.id;
    var btnApr = canApr
      ? '<button type="button" class="abtn" style="background:#5b21b6;color:#fff;border:none;font-family:var(--csm-font-en);font-weight:700" onclick="csmFinCustomsApprove(' + JSON.stringify(rid) + ')">Approve · 批准</button>'
      : '<span style="color:#888;font-size:12px;font-family:var(--csm-font-en);font-weight:700">Admin only · 仅管理员</span>';
    return '<tr><td style="padding:10px 12px;font-size:12px">' + csmEscapeHtml(csmSalesFormatOrderCreated(r.createdAt)) + '</td>' +
      '<td style="padding:10px 12px;font-size:12px;max-width:140px;word-break:break-all">' + by + '</td>' +
      '<td style="padding:10px 12px;font-family:var(--csm-font-en);font-weight:700">' + refNo + '</td>' +
      '<td style="padding:10px 12px;font-size:12px"><div>BL: ' + bl + '</div><div>CN: ' + cn + '</div></td>' +
      '<td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums">' + csmSalesRound2(lineAmt).toFixed(2) + '</td>' +
      '<td style="padding:10px 12px;font-size:11px;color:#334155;max-width:260px;line-height:1.35">' + sumTxt + '</td>' +
      '<td style="padding:10px 12px;white-space:normal">' + btnApr + '</td></tr>';
  }).join('');
}
function csmFinPendingSelectCategory(key) {
  key = String(key == null ? '' : key).trim();
  if (!key) {
    finPendingSelectedCategoryKey = null;
    finPendingWtPanelDismissed = true;
  } else if (finPendingSelectedCategoryKey === key) {
    finPendingSelectedCategoryKey = null;
    finPendingWtPanelDismissed = true;
  } else {
    finPendingSelectedCategoryKey = key;
    finPendingWtPanelDismissed = false;
  }
  try { renderFinPendingModuleBadges(); } catch (e0) {}
  try { renderFinPendingCategoryPanel(); } catch (e1) {}
}
function renderFinPendingCategoryPanel() {
  var panel = gid('fin-pending-category-panel');
  var wWrap = gid('fin-pending-wt-wrap');
  var cWrap = gid('fin-pending-customs-wrap');
  var titleEl = gid('fin-pending-category-title');
  var subEl = gid('fin-pending-category-subtitle');
  var emptyEl = gid('fin-pending-panel-empty');
  var twTb = gid('tb-fin-pending-cat-wt');
  var cuTb = gid('tb-fin-pending-cat-customs');
  if (!panel) return;
  var k = finPendingSelectedCategoryKey;
  if (!k) {
    panel.style.display = 'none';
    if (wWrap) wWrap.style.display = 'none';
    if (cWrap) cWrap.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';
    return;
  }
  var def = csmFinPendingAllCategoryDefs().find(function(d) { return d.key === k; });
  if (!def) {
    finPendingSelectedCategoryKey = null;
    panel.style.display = 'none';
    return;
  }
  var titleParts = def.tag
    ? '<span style="font-size:12px;font-family:var(--csm-font-en);font-weight:700;color:#64748b">' + csmEscapeHtml(def.tag) + '</span> ' + csmEscapeHtml(def.cn) + ' · ' + csmEscapeHtml(def.en)
    : csmEscapeHtml(def.cn) + ' · ' + csmEscapeHtml(def.en);
  if (titleEl) titleEl.innerHTML = titleParts;
  if (subEl) {
    if (k === 'wtAll') {
      subEl.textContent = 'All pending Worker/Truck settlement batches in queue. · 当前队列内全部待审批的装卸结算批次。';
    } else {
      subEl.textContent = (def.kind === 'wt' ? 'Worker / Truck settlement' : 'Customs fee request') + ' / ' + (def.kind === 'wt' ? '装卸结算待审批' : '清关费用待审批');
    }
  }
  if (def.kind === 'wt') {
    if (cWrap) cWrap.style.display = 'none';
    if (wWrap) wWrap.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    panel.style.display = 'block';
    var wPend = (salesWtSettlements || []).filter(function(b) { return csmFinWtIsAwaitingPayment(b); });
    if (k === 'wtAll') {
    } else if (k === 'wtWorker') {
      wPend = wPend.filter(function(b) {
        var s = csmFinWtBatchWorkerTruckSums(b);
        return s.worker > 0 || csmFinWtBatchUnallocated(b);
      });
    } else if (k === 'wtTruck') {
      wPend = wPend.filter(function(b) {
        return csmFinWtBatchWorkerTruckSums(b).truck > 0;
      });
    } else {
      wPend = [];
    }
    if (twTb) {
      if (!wPend.length) {
        twTb.innerHTML = '';
        if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.textContent = 'No items in this category. · 该分类下暂无待审批。'; }
      } else {
        if (emptyEl) emptyEl.style.display = 'none';
        twTb.innerHTML = csmFinPendingBuildWtRowsHtml(wPend);
      }
    }
  } else {
    if (wWrap) wWrap.style.display = 'none';
    if (cWrap) cWrap.style.display = 'block';
    panel.style.display = 'block';
    var cPend = (customsFeeRequests || []).filter(function(r) { return String(r && r.status || 'pending') === 'pending'; });
    cPend = cPend.filter(function(r) { return csmFinNum((r.lines || {})[k]) > 0; });
    if (cuTb) {
      if (!cPend.length) {
        cuTb.innerHTML = '';
        if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.textContent = 'No items in this category. · 该分类下暂无待审批。'; }
      } else {
        if (emptyEl) emptyEl.style.display = 'none';
        cuTb.innerHTML = csmFinPendingBuildCustomsRowsHtml(cPend, k);
      }
    }
  }
}
function csmFinPendingRenderOneTile(m, counts) {
  var n = csmFinNum(counts[m.key]);
  var nStyle = n > 0
    ? 'background:#0f172a;color:#fff;min-width:24px;padding:2px 7px;border-radius:999px;text-align:center;font-size:11px'
    : 'background:#e2e8f0;color:#94a3b8;min-width:24px;padding:2px 7px;border-radius:999px;text-align:center;font-size:11px';
  var sel = finPendingSelectedCategoryKey === m.key;
  var bd = sel ? '2px solid #5b21b6' : '1px solid #c4b5fd';
  var bg = sel ? 'linear-gradient(135deg,#eef2ff,#fff7ed)' : '#fff';
  if (m.key === 'wtAll') {
    bd = sel ? '2px solid #e65100' : '1px solid #ffb74d';
    bg = sel ? 'linear-gradient(135deg,#fff3e0,#fffde7)' : 'linear-gradient(180deg,#fff8e1,#fff)';
  }
  var wFirst = m.section === 'worker' && m.key === 'wtAll';
  var wBand = wFirst ? 'border-left:3px solid #ffb74d;border-radius:0 8px 8px 0;padding-left:5px;margin-left:2px;' : '';
  var line1 = m.tag
    ? '<div style="font-size:10px;font-family:var(--csm-font-en);font-weight:700;color:#64748b;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + csmEscapeHtml(m.tag) + '</div><div style="line-height:1.25"><span style="color:#334155;font-size:12px">' + csmEscapeHtml(m.cn) + '</span> · <span style="font-family:var(--csm-font-en);font-weight:700;font-size:12px">' + csmEscapeHtml(m.en) + '</span></div>'
    : '<div style="line-height:1.3"><span style="color:#334155;font-size:12px">' + csmEscapeHtml(m.cn) + '</span> · <span style="font-family:var(--csm-font-en);font-weight:700;font-size:12px">' + csmEscapeHtml(m.en) + '</span></div>';
  return (
    '<button type="button" class="csm-pending-cat-tile" data-pending-key="' + csmAttrEscape(m.key) + '" ' +
    'style="font-family:var(--csm-font-en);font-weight:700;cursor:pointer;text-align:left;flex:1 1 0;min-width:0;align-self:stretch;box-sizing:border-box;margin:0;background:' + bg + ';border:' + bd + ';border-radius:8px;padding:7px 8px;line-height:1.3;display:flex;align-items:center;justify-content:space-between;gap:5px;min-height:46px;max-height:100%;box-shadow:0 1px 2px rgba(0,0,0,.04);' + wBand + '">' +
      '<div style="flex:1;min-width:0;overflow:hidden">' + line1 + '</div>' +
      '<span style="font-family:var(--csm-font-en);font-weight:700;flex-shrink:0;' + nStyle + '">' + String(n) + '</span>' +
    '</button>'
  );
}
function renderFinPendingModuleBadges() {
  var wrap = gid('fin-pending-module-badges');
  var counts = csmFinPendingComputeCategoryCounts();
  if (!wrap) return;
  var all = csmFinPendingAllCategoryDefs();
  var beforeW = all.filter(function(m) { return m.kind === 'customs' && ['logistics', 'coldFee', 'attestation', 'repack', 'waste'].indexOf(m.key) !== -1; });
  var workerB = all.filter(function(m) { return m.section === 'worker'; });
  var afterW = all.filter(function(m) { return m.kind === 'customs' && (m.key === 'wasteCharge' || m.key === 'other'); });
  var rowHtml = [].concat(beforeW, workerB, afterW).map(function(m) {
    return csmFinPendingRenderOneTile(m, counts);
  }).join('');
  wrap.innerHTML =
    '<div class="csm-pending-badges-one-row" style="display:flex;flex-direction:row;flex-wrap:nowrap;align-items:stretch;gap:5px;width:100%;min-width:0;box-sizing:border-box;overflow-x:auto;overflow-y:hidden;padding:2px 0;scrollbar-gutter:stable">' +
    rowHtml +
    '</div>';
  wrap.querySelectorAll('.csm-pending-cat-tile').forEach(function(btn) {
    btn.onclick = function() {
      csmFinPendingSelectCategory(btn.getAttribute('data-pending-key') || '');
    };
  });
}
try { window.renderFinPendingModuleBadges = renderFinPendingModuleBadges; } catch (eFpb) {}
try { window.csmFinPendingSelectCategory = csmFinPendingSelectCategory; } catch (eFpb2) {}
function csmFinCustomsLinesTotal(lines) {
  lines = lines || {};
  var t = 0;
  csmFinCustomsFeeTypeDefs().forEach(function(d) {
    t += csmFinNum(lines[d.key]);
  });
  return csmSalesRound2(t);
}
function csmFinCustomsSummaryText(r) {
  var lines = (r && r.lines) || {};
  var parts = [];
  csmFinCustomsFeeTypeDefs().forEach(function(d) {
    var v = csmFinNum(lines[d.key]);
    if (v > 0) parts.push(d.en + ' ' + v.toFixed(2));
  });
  return parts.length ? parts.join(' · ') : '—';
}
function renderCompanyFinancialPendingCustoms() {
  var countEl = gid('fin-pending-customs-count');
  var pending = (customsFeeRequests || []).filter(function(r) {
    return String(r.status || 'pending') === 'pending';
  });
  if (countEl) countEl.textContent = String(pending.length);
  try { renderFinPendingModuleBadges(); } catch (eBdg2) {}
  try { renderFinPendingCategoryPanel(); } catch (eBdg3) {}
}
function csmFinCustomsApprove(requestId) {
  if (!isAdmin || !customsFeePendingRef || !requestId) {
    toast(isStaff ? '仅管理员可批准 / Admin only' : 'Admin only', 'err');
    return;
  }
  var r = (customsFeeRequests || []).find(function(x) { return x.id === requestId; });
  if (!r || String(r.status || 'pending') !== 'pending') {
    toast('记录不存在或已处理 / Not found or already processed', 'err');
    return;
  }
  var nowIso = new Date().toISOString();
  customsFeePendingRef.child(requestId).update({
    status: 'approved',
    approvedAt: nowIso,
    approvedBy: currentUserEmail || currentUser || ''
  }).then(function() {
    toast('已批准 · Approved — 后续可登记支付 / Post payment in next step', 'ok');
    try { renderCompanyFinancialPendingCustoms(); } catch (e1) {}
    try { renderCompanyFinancialWorkspace(); } catch (e2) {}
  }).catch(function(e) {
    toast(e.message || String(e), 'err');
  });
}
try { window.csmFinCustomsApprove = csmFinCustomsApprove; } catch (eCfa) {}
try { window.renderCompanyFinancialPendingCustoms = renderCompanyFinancialPendingCustoms; } catch (eCfr) {}
function renderCompanyFinancialPending() {
  if (finPendingSelectedCategoryKey == null && !finPendingWtPanelDismissed) {
    var wq0 = (salesWtSettlements || []).filter(function(b) { return csmFinWtIsAwaitingPayment(b); });
    if (wq0.length) finPendingSelectedCategoryKey = 'wtAll';
  }
  var countEl = gid('fin-pending-count');
  var pending = (salesWtSettlements || []).filter(function(b) { return csmFinWtIsAwaitingPayment(b); });
  if (countEl) countEl.textContent = String(pending.length);
  var hStaff = gid('fin-pending-staff-only-hint');
  if (hStaff) hStaff.style.display = isStaff ? 'block' : 'none';
  try { renderFinPendingModuleBadges(); } catch (eBdg0) {}
  try { renderFinPendingCategoryPanel(); } catch (eBdg1) {}
}
function csmFinWtQuickApprove(batchId) {
  if (!csmFinWtCanConfirmPaid() || !salesWtSettlementsRef) {
    toast(isStaff ? 'Staff cannot approve — admin only' : 'Admin only', 'err');
    return;
  }
  var b = (salesWtSettlements || []).find(function(x) { return x.id === batchId; });
  if (!b || !csmFinWtIsAwaitingPayment(b)) {
    toast('Request not found or already processed', 'err');
    return;
  }
  var gross = b.grossAed != null ? Number(b.grossAed) : 0;
  var nowIso = new Date().toISOString();
  salesWtSettlementsRef.child(batchId).update({
    status: 'paid',
    paidAt: nowIso,
    paymentAmount: csmSalesRound2(gross),
    discountAmount: 0,
    confirmedBy: currentUserEmail || currentUser || '',
    approvedMode: 'one_click_fin_suite'
  }).then(function() {
    toast('Approved — payment recorded', 'ok');
    try { renderCompanyFinancialPending(); } catch (e1) {}
    try { renderFinWtPanel(); } catch (e2) {}
    try { renderFinPendingCategoryPanel(); } catch (e3) {}
  }).catch(function(e) {
    toast(e.message || String(e), 'err');
  });
}
function openSalesCustomerModal(id) {
  var m = gid('sales-customer-modal');
  if (!m) return;
  m.classList.add('sh');
  gid('sales-customer-id').value = id || '';
  gid('sales-customer-name-full').value = '';
  gid('sales-customer-short').value = '';
  gid('sales-customer-address').value = '';
  gid('sales-customer-vat').value = '';
  gid('sales-customer-phone').value = '';
  gid('sales-customer-email').value = '';
  if (id) {
    var c = salesCustomers.find(function(x) { return x.id === id; });
    if (c) {
      gid('sales-customer-name-full').value = csmSalesCustomerNameFull(c);
      gid('sales-customer-short').value = csmSalesCustomerShortName(c);
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
  var nameFull = (gid('sales-customer-name-full').value || '').trim();
  var shortName = (gid('sales-customer-short').value || '').trim();
  if (!nameFull) { toast('Full name required', 'err'); return; }
  if (!id) id = 'sc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  var displayName = shortName || nameFull;
  var rec = {
    nameFull: nameFull,
    shortName: shortName,
    name: displayName,
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
function salesOrderCustomerComboPrepare() {
  var hid = gid('sales-order-customer-id');
  var inp = gid('sales-order-customer-search');
  var dd = gid('sales-order-customer-dd');
  if (hid) hid.value = '';
  if (inp) inp.value = '';
  if (dd) {
    dd.style.display = 'none';
    dd.innerHTML = '';
  }
}
function salesOrderCustomerComboSet(customerId) {
  var hid = gid('sales-order-customer-id');
  var inp = gid('sales-order-customer-search');
  var dd = gid('sales-order-customer-dd');
  if (!hid || !inp) return;
  if (!customerId) {
    salesOrderCustomerComboPrepare();
    return;
  }
  var c = salesCustomers.find(function(x) { return x.id === customerId; });
  hid.value = customerId;
  if (c) {
    inp.value = csmSalesCustomerListLabel(c);
  } else {
    inp.value = String(customerId);
  }
  if (dd) {
    dd.style.display = 'none';
    dd.innerHTML = '';
  }
}
function salesOrderCustomerComboRenderList(filterEl) {
  var dd = gid('sales-order-customer-dd');
  if (!dd) return;
  var q = filterEl ? String(filterEl.value || '').trim() : '';
  var list = salesCustomers.filter(function(c) { return csmSalesCustomerMatchesQuery(c, q); });
  list.sort(function(a, b) {
    return String(csmSalesCustomerListLabel(a)).localeCompare(String(csmSalesCustomerListLabel(b)));
  });
  var maxN = q ? 100 : 60;
  if (list.length > maxN) list = list.slice(0, maxN);
  if (!list.length) {
    dd.innerHTML = '<div style="padding:10px;color:#888;font-size:13px;font-family:var(--csm-font-en);font-weight:700">No match</div>';
    dd.style.display = 'block';
    return;
  }
  dd.innerHTML = list.map(function(c) {
    return '<button type="button" class="csm-sales-cust-item" data-cid="' + csmAttrEscape(c.id) + '" onmousedown="event.preventDefault();salesOrderCustomerComboPick(this.getAttribute(\'data-cid\'))">' + csmEscapeHtml(csmSalesCustomerListLabel(c)) + '</button>';
  }).join('');
  dd.style.display = 'block';
}
function salesOrderCustomerComboOnInput(el) {
  if (el && el.readOnly) return;
  var hid = gid('sales-order-customer-id');
  if (hid) hid.value = '';
  salesOrderCustomerComboRenderList(el);
}
function salesOrderCustomerComboOnFocus(el) {
  if (el && el.readOnly) return;
  salesOrderCustomerComboRenderList(el);
}
function salesOrderCustomerComboOnBlurSoon() {
  setTimeout(function() {
    var dd = gid('sales-order-customer-dd');
    if (dd) dd.style.display = 'none';
  }, 200);
}
function salesOrderCustomerComboPick(cid) {
  if (!cid) return;
  var inpRO = gid('sales-order-customer-search');
  if (inpRO && inpRO.readOnly) return;
  var c = salesCustomers.find(function(x) { return x.id === cid; });
  var hid = gid('sales-order-customer-id');
  var inp = gid('sales-order-customer-search');
  var dd = gid('sales-order-customer-dd');
  if (hid) hid.value = cid;
  if (inp && c) inp.value = csmSalesCustomerListLabel(c);
  if (dd) {
    dd.style.display = 'none';
    dd.innerHTML = '';
  }
}
function salesFillPaymentReceiverSelect(sel, selectedId) {
  if (!sel) return;
  var sid = selectedId != null ? String(selectedId) : '';
  sel.innerHTML = '<option value="">\u2014</option>' + salesPaymentReceivers.map(function(p) {
    var vid = String(p.id || '').replace(/"/g, '');
    return '<option value="' + vid + '">' + csmEscapeHtml(p.name || vid) + '</option>';
  }).join('');
  if (sid) {
    sel.value = sid;
    if (sel.value !== sid) {
      sel.innerHTML += '<option value="' + String(sid).replace(/"/g, '') + '" selected>' + csmEscapeHtml(sid) + '</option>';
    }
  }
}
function renderSalesPaymentReceiversManageTable() {
  var tb = gid('tb-sales-payment-receivers');
  if (!tb) return;
  if (!salesPaymentReceivers.length) {
    tb.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#888;font-family:var(--csm-font-en);font-weight:700">No receivers yet — add a name above.</td></tr>';
    return;
  }
  tb.innerHTML = salesPaymentReceivers.map(function(p) {
    return '<tr><td style="font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(p.name || '') + '</td><td><button type="button" class="abtn x" data-sales-prid="' + csmAttrEscape(p.id) + '" onclick="deleteSalesPaymentReceiver(this.getAttribute(\'data-sales-prid\'))">Del</button></td></tr>';
  }).join('');
}
function openSalesPaymentReceiversModal() {
  var m = gid('sales-payment-receivers-modal');
  if (!m) return;
  renderSalesPaymentReceiversManageTable();
  m.classList.add('sh');
  var inp = gid('sales-pr-new-name');
  if (inp) try { inp.focus(); } catch (eF) {}
}
function clSalesPaymentReceiversModal() {
  var m = gid('sales-payment-receivers-modal');
  if (m) m.classList.remove('sh');
}
function addSalesPaymentReceiver() {
  if (!salesPaymentReceiversRef) { toast('Database not connected', 'err'); return; }
  var inp = gid('sales-pr-new-name');
  var name = inp ? (inp.value || '').trim() : '';
  if (!name) { toast('Enter a name', 'err'); return; }
  var id = 'spr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  salesPaymentReceiversRef.child(id).set({ name: name, createdAt: new Date().toISOString() }).then(function() {
    if (inp) inp.value = '';
    toast('Added', 'ok');
  }).catch(function(e) { toast('Save failed: ' + (e.message || e), 'err'); });
}
function deleteSalesPaymentReceiver(id) {
  if (!id || !salesPaymentReceiversRef) return;
  var used = salesOrders.some(function(o) { return !o.voided && String(o.paymentReceiverId || '') === String(id); });
  if (used) { toast('Receiver is used on an order', 'err'); return; }
  if (!confirm('Delete this payment receiver?')) return;
  salesPaymentReceiversRef.child(id).remove().then(function() { toast('Deleted', 'ok'); }).catch(function() { toast('Delete failed', 'err'); });
}
function csmSalesRateFormHtml(prefix, rates) {
  var products = getW1ProductsNormalized();
  if (!products.length) {
    return '<div style="font-size:12px;color:#888;font-family:var(--csm-font-en);font-weight:700">No products yet. Add products in Settings first.</div>';
  }
  rates = csmSalesNormalizeRateMap(rates);
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">' + products.map(function(product) {
    var key = csmSalesProductRateKey(product);
    var val = rates[key];
    return '<label style="display:block;font-size:12px;color:#555;font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(product) +
      '<input type="number" min="0" step="any" class="' + prefix + '-rate-input" data-product="' + csmAttrEscape(product) + '" value="' + (val >= 0 ? csmEscapeHtml(String(val)) : '') + '" placeholder="AED per box" style="width:100%;margin-top:4px;padding:7px 8px;border:1px solid #ccc;border-radius:4px;font-family:var(--csm-font-en);font-weight:700"></label>';
  }).join('') + '</div>';
}
function csmSalesRateFormRead(prefix) {
  var out = {};
  document.querySelectorAll('.' + prefix + '-rate-input').forEach(function(inp) {
    var product = csmSalesProductRateKey(inp.getAttribute('data-product'));
    var val = parseFloat(inp.value);
    if (!product || !(val >= 0)) return;
    out[product] = val;
  });
  return out;
}
function csmSalesRateSummaryHtml(rates) {
  var norm = csmSalesNormalizeRateMap(rates);
  var keys = Object.keys(norm);
  if (!keys.length) return '<span style="color:#999">—</span>';
  keys.sort(function(a, b) { return String(a).localeCompare(String(b)); });
  return keys.map(function(k) {
    return '<div style="font-family:var(--csm-font-en);font-weight:700;line-height:1.35">' + csmEscapeHtml(k) + ': ' + norm[k].toFixed(2) + ' AED/box</div>';
  }).join('');
}
function salesWorkerFormReset() {
  var idEl = gid('sales-worker-edit-id');
  var nameEl = gid('sales-worker-name');
  var form = gid('sales-worker-rates-form');
  if (idEl) idEl.value = '';
  if (nameEl) nameEl.value = '';
  if (form) form.innerHTML = csmSalesRateFormHtml('sales-worker', {});
  if (nameEl) try { nameEl.focus(); } catch (eF) {}
}
function salesTruckFormReset() {
  var idEl = gid('sales-truck-edit-id');
  var nameEl = gid('sales-truck-name');
  var form = gid('sales-truck-rates-form');
  if (idEl) idEl.value = '';
  if (nameEl) nameEl.value = '';
  if (form) form.innerHTML = csmSalesRateFormHtml('sales-truck', {});
  if (nameEl) try { nameEl.focus(); } catch (eF) {}
}
function renderSalesWorkersManageTable() {
  var tb = gid('tb-sales-workers');
  if (!tb) return;
  if (!salesWorkers.length) {
    tb.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#888;font-family:var(--csm-font-en);font-weight:700">No workers yet.</td></tr>';
    return;
  }
  tb.innerHTML = salesWorkers.map(function(item) {
    var wid = encodeURIComponent(String(item.id || ''));
    return '<tr><td style="font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(item.name || '') + '</td><td>' + csmSalesRateSummaryHtml(item.rates) + '</td><td>' +
      '<button type="button" class="abtn" data-sales-worker-id="' + wid + '" onclick="editSalesWorker(decodeURIComponent(this.getAttribute(\'data-sales-worker-id\')))">Edit</button> ' +
      '<button type="button" class="abtn x" data-sales-worker-id="' + wid + '" onclick="deleteSalesWorker(decodeURIComponent(this.getAttribute(\'data-sales-worker-id\')))">Del</button></td></tr>';
  }).join('');
}
function renderSalesTrucksManageTable() {
  var tb = gid('tb-sales-trucks');
  if (!tb) return;
  if (!salesTrucks.length) {
    tb.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#888;font-family:var(--csm-font-en);font-weight:700">No trucks yet.</td></tr>';
    return;
  }
  tb.innerHTML = salesTrucks.map(function(item) {
    var tid = encodeURIComponent(String(item.id || ''));
    return '<tr><td style="font-family:var(--csm-font-en);font-weight:700">' + csmEscapeHtml(item.name || '') + '</td><td>' + csmSalesRateSummaryHtml(item.rates) + '</td><td>' +
      '<button type="button" class="abtn" data-sales-truck-id="' + tid + '" onclick="editSalesTruck(decodeURIComponent(this.getAttribute(\'data-sales-truck-id\')))">Edit</button> ' +
      '<button type="button" class="abtn x" data-sales-truck-id="' + tid + '" onclick="deleteSalesTruck(decodeURIComponent(this.getAttribute(\'data-sales-truck-id\')))">Del</button></td></tr>';
  }).join('');
}
function renderSalesWorkerTruckManageUi() {
  renderSalesWorkersManageTable();
  renderSalesTrucksManageTable();
}
function openSalesWorkerTruckModal() {
  var m = gid('sales-worker-truck-modal');
  if (!m) return;
  renderSalesWorkerTruckManageUi();
  salesWorkerFormReset();
  salesTruckFormReset();
  m.classList.add('sh');
}
function clSalesWorkerTruckModal() {
  var m = gid('sales-worker-truck-modal');
  if (m) m.classList.remove('sh');
}
function editSalesWorker(id) {
  var item = salesWorkers.find(function(x) { return x.id === id; });
  if (!item) return;
  gid('sales-worker-edit-id').value = id;
  gid('sales-worker-name').value = item.name || '';
  gid('sales-worker-rates-form').innerHTML = csmSalesRateFormHtml('sales-worker', item.rates);
}
function editSalesTruck(id) {
  var item = salesTrucks.find(function(x) { return x.id === id; });
  if (!item) return;
  gid('sales-truck-edit-id').value = id;
  gid('sales-truck-name').value = item.name || '';
  gid('sales-truck-rates-form').innerHTML = csmSalesRateFormHtml('sales-truck', item.rates);
}
function saveSalesWorkerFromModal() {
  if (!salesWorkersRef) { toast('Database not connected', 'err'); return; }
  var id = String(gid('sales-worker-edit-id').value || '').trim();
  var name = String(gid('sales-worker-name').value || '').trim();
  if (!name) { toast('Worker name required', 'err'); return; }
  if (!id) id = 'swk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  salesWorkersRef.child(id).set({ name: name, rates: csmSalesRateFormRead('sales-worker'), updatedAt: new Date().toISOString() }).then(function() {
    toast('Worker saved', 'ok');
    salesWorkerFormReset();
  }).catch(function(e) { toast('Save failed: ' + (e.message || e), 'err'); });
}
function saveSalesTruckFromModal() {
  if (!salesTrucksRef) { toast('Database not connected', 'err'); return; }
  var id = String(gid('sales-truck-edit-id').value || '').trim();
  var name = String(gid('sales-truck-name').value || '').trim();
  if (!name) { toast('Truck name required', 'err'); return; }
  if (!id) id = 'stk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  salesTrucksRef.child(id).set({ name: name, rates: csmSalesRateFormRead('sales-truck'), updatedAt: new Date().toISOString() }).then(function() {
    toast('Truck saved', 'ok');
    salesTruckFormReset();
  }).catch(function(e) { toast('Save failed: ' + (e.message || e), 'err'); });
}
function deleteSalesWorker(id) {
  if (!id || !salesWorkersRef) return;
  var used = salesOrders.some(function(o) {
    return !o.voided && csmSalesNormalizeLinesFromOrder(o).some(function(L) { return String(L.workerId || '') === String(id); });
  });
  if (used) { toast('Worker is used on an order', 'err'); return; }
  if (!confirm('Delete this worker?')) return;
  salesWorkersRef.child(id).remove().then(function() { toast('Deleted', 'ok'); }).catch(function() { toast('Delete failed', 'err'); });
}
function deleteSalesTruck(id) {
  if (!id || !salesTrucksRef) return;
  var used = salesOrders.some(function(o) {
    return !o.voided && csmSalesNormalizeLinesFromOrder(o).some(function(L) { return String(L.truckId || '') === String(id); });
  });
  if (used) { toast('Truck is used on an order', 'err'); return; }
  if (!confirm('Delete this truck?')) return;
  salesTrucksRef.child(id).remove().then(function() { toast('Deleted', 'ok'); }).catch(function() { toast('Delete failed', 'err'); });
}
function getPurchaseCnListSorted() {
  var seen = {};
  var list = [];
  if (!purchaseRecs || !purchaseRecs.length) return list;
  purchaseRecs.forEach(function(p) {
    var cn = String(p.cn || '').trim().toUpperCase();
    if (cn && !seen[cn]) {
      seen[cn] = true;
      list.push(cn);
    }
  });
  list.sort();
  return list;
}
function buildSalesOrderCnSelectHtml(selectedRaw) {
  var list = getPurchaseCnListSorted();
  var selNorm = String(selectedRaw || '').trim().toUpperCase();
  var html = '<option value="">请选择集装箱号 / Select from purchase</option>';
  var found = false;
  list.forEach(function(cn) {
    var isSel = selNorm && cn === selNorm;
    if (isSel) found = true;
    html += '<option value="' + w1EscAttr(cn) + '"' + (isSel ? ' selected' : '') + '>' + w1EscHtml(cn) + '</option>';
  });
  if (selNorm && !found) {
    html += '<option value="' + w1EscAttr(selNorm) + '" selected>' + w1EscHtml(selNorm) + ' (未在采购列表)</option>';
  }
  return html;
}
function getDistinctPurchaseProductsForCn(cn) {
  var key = String(cn || '').trim().toUpperCase();
  var out = [];
  var seen = {};
  if (!key || !purchaseRecs || !purchaseRecs.length) return out;
  purchaseRecs.forEach(function(p) {
    if (String(p.cn || '').trim().toUpperCase() !== key) return;
    var pr = String(p.product || '').trim();
    if (!pr) return;
    var lk = pr.toLowerCase();
    if (seen[lk]) return;
    seen[lk] = true;
    out.push(pr);
  });
  return out;
}
function buildSalesOrderProductOptionsMulti(distinct, selectedRaw) {
  var selN = canonicalProductName(String(selectedRaw || '').trim());
  var html = '<option value="">Select product</option>';
  var found = false;
  (distinct || []).forEach(function(p) {
    var pn = canonicalProductName(p);
    var isSel = !!selN && pn === selN;
    if (isSel) found = true;
    html += '<option value="' + w1EscAttr(p) + '"' + (isSel ? ' selected' : '') + '>' + w1EscHtml(p) + '</option>';
  });
  if (selN && !found && String(selectedRaw || '').trim()) {
    var raw = String(selectedRaw).trim();
    html += '<option value="' + w1EscAttr(raw) + '" selected>' + w1EscHtml(raw) + ' (not in list for CN)</option>';
  }
  return html;
}
function buildSalesOrderLineProductOptionsForCn(cnNorm, selectedRaw) {
  var cn = String(cnNorm || '').trim().toUpperCase();
  if (!cn) return '<option value="">Select container first</option>';
  var distinct = getDistinctPurchaseProductsForCn(cn);
  if (distinct.length === 1) return buildSalesOrderProductOptionsMulti(distinct, selectedRaw || distinct[0]);
  if (distinct.length > 1) return buildSalesOrderProductOptionsMulti(distinct, selectedRaw);
  return buildProductSelectOptionsHtml(selectedRaw);
}
function csmSalesRemainingQtyKey(cn, product) {
  return String(cn || '').trim().toUpperCase() + '\x1e' + canonicalProductName(String(product || '').trim());
}
function csmSalesPurchaseRemainingQtyForKey(cn, product) {
  var key = csmSalesRemainingQtyKey(cn, product);
  var sum = 0;
  (purchaseRecs || []).forEach(function(p) {
    if (csmSalesRemainingQtyKey(p.cn, p.product) !== key) return;
    sum += parseFloat(p.qty) || 0;
  });
  return csmSalesRound2(sum);
}
function csmSalesEditingOrderReservedQtyForKey(cn, product) {
  var orderId = String((gid('sales-order-id') && gid('sales-order-id').value) || '').trim();
  if (!orderId) return 0;
  var o = (salesOrders || []).find(function(x) { return x.id === orderId; });
  if (!o || o.voided) return 0;
  var key = csmSalesRemainingQtyKey(cn, product);
  var sum = 0;
  csmSalesNormalizeLinesFromOrder(o).forEach(function(L) {
    if (csmSalesRemainingQtyKey(L.containerNo, L.productName) !== key) return;
    sum += parseFloat(L.quantity) || 0;
  });
  return csmSalesRound2(sum);
}
function csmSalesDomAllocatedQtyForKey(key, excludeTr) {
  var tb = gid('sales-order-lines-body');
  if (!tb || !key) return 0;
  var sum = 0;
  tb.querySelectorAll('tr.csm-sol-main').forEach(function(tr) {
    if (excludeTr && tr === excludeTr) return;
    var hidCn = tr.querySelector('.sol-cn-val');
    var prEl = tr.querySelector('.sol-pr');
    var qtyEl = tr.querySelector('.sol-qty');
    var cn = String(hidCn && hidCn.value || '').trim().toUpperCase();
    var pr = canonicalProductName(String(prEl && prEl.value || '').trim());
    if (!cn || !pr) return;
    if (csmSalesRemainingQtyKey(cn, pr) !== key) return;
    sum += parseFloat(qtyEl && qtyEl.value) || 0;
  });
  return csmSalesRound2(sum);
}
function csmSalesRemainingQtyForEditorRow(tr) {
  if (!tr) return { key: '', purchasedRemaining: 0, existingReserved: 0, otherAllocated: 0, available: 0 };
  var hidCn = tr.querySelector('.sol-cn-val');
  var prEl = tr.querySelector('.sol-pr');
  var cn = String(hidCn && hidCn.value || '').trim().toUpperCase();
  var pr = canonicalProductName(String(prEl && prEl.value || '').trim());
  var key = csmSalesRemainingQtyKey(cn, pr);
  if (!cn || !pr) return { key: key, purchasedRemaining: 0, existingReserved: 0, otherAllocated: 0, available: 0 };
  var purchasedRemaining = csmSalesPurchaseRemainingQtyForKey(cn, pr);
  var existingReserved = csmSalesEditingOrderReservedQtyForKey(cn, pr);
  var otherAllocated = csmSalesDomAllocatedQtyForKey(key, tr);
  var available = csmSalesRound2(purchasedRemaining + existingReserved - otherAllocated);
  if (available < 0) available = 0;
  return {
    key: key,
    purchasedRemaining: purchasedRemaining,
    existingReserved: existingReserved,
    otherAllocated: otherAllocated,
    available: available
  };
}
function salesOrderRefreshRemainingHintForRow(tr) {
  if (!tr) return;
  var hint = tr.querySelector('.sol-qty-rem');
  var qtyEl = tr.querySelector('.sol-qty');
  var hidCn = tr.querySelector('.sol-cn-val');
  var prEl = tr.querySelector('.sol-pr');
  if (!hint || !qtyEl) return;
  var cn = String(hidCn && hidCn.value || '').trim().toUpperCase();
  var pr = canonicalProductName(String(prEl && prEl.value || '').trim());
  if (!cn || !pr) {
    hint.textContent = 'Remaining / 剩余: —';
    hint.style.color = '#888';
    qtyEl.removeAttribute('max');
    return;
  }
  var rem = csmSalesRemainingQtyForEditorRow(tr);
  hint.textContent = 'Remaining / 剩余: ' + String(rem.available);
  hint.style.color = rem.available > 0 ? '#0f766e' : '#cc0000';
  qtyEl.setAttribute('max', String(rem.available));
  var qv = parseFloat(qtyEl.value);
  if (!isNaN(qv) && qv > rem.available) qtyEl.value = String(rem.available);
}
function salesOrderRefreshAllRemainingHints() {
  var tb = gid('sales-order-lines-body');
  if (!tb) return;
  tb.querySelectorAll('tr.csm-sol-main').forEach(function(tr) {
    salesOrderRefreshRemainingHintForRow(tr);
  });
}
function buildSalesOrderLineCnCellHtml(cn) {
  var cnNorm = String(cn || '').trim().toUpperCase();
  return '<td style="padding:6px 8px;vertical-align:middle">' +
    '<div class="csm-sol-cn-wrap">' +
    '<input type="hidden" class="sol-cn-val" value="' + w1EscAttr(cnNorm) + '">' +
    '<input type="text" class="sol-cn-search" autocomplete="off" value="' + w1EscAttr(cnNorm) + '" placeholder="Search container\u2026" ' +
    'oninput="salesOrderLineCnSearchInput(this)" onfocus="salesOrderLineCnSearchFocus(this)" onblur="salesOrderLineCnSearchBlurSoon(this)" ' +
    'style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;text-transform:uppercase;font-family:var(--csm-font-en);font-weight:700;box-sizing:border-box">' +
    '<div class="sol-cn-dd csm-sales-cust-dd" style="display:none" role="listbox"></div>' +
    '</div></td>';
}
function salesOrderLineCnFilterCnList(queryUpper) {
  var q = String(queryUpper || '').trim().toUpperCase();
  var list = getPurchaseCnListSorted();
  if (!q) return list.slice(0, 100);
  return list.filter(function(cn) { return cn.indexOf(q) >= 0; }).slice(0, 100);
}
function salesOrderLineCnRenderDd(inputEl) {
  var wrap = inputEl && inputEl.closest && inputEl.closest('.csm-sol-cn-wrap');
  if (!wrap) return;
  var dd = wrap.querySelector('.sol-cn-dd');
  if (!dd) return;
  var q = String(inputEl.value || '').trim().toUpperCase();
  var hits = salesOrderLineCnFilterCnList(q);
  if (!hits.length) {
    dd.innerHTML = '<div style="padding:10px;color:#888;font-size:12px;font-family:var(--csm-font-en);font-weight:700">No matching container</div>';
    dd.style.display = 'block';
    return;
  }
  dd.innerHTML = hits.map(function(cn) {
    return '<button type="button" class="csm-sales-cust-item" data-cn="' + w1EscAttr(cn) + '" onmousedown="event.preventDefault();salesOrderLineCnDdPick(this)">' + w1EscHtml(cn) + '</button>';
  }).join('');
  dd.style.display = 'block';
}
function salesOrderLineCnDdPick(btn) {
  var cn = btn.getAttribute('data-cn');
  var wrap = btn.closest('.csm-sol-cn-wrap');
  salesOrderLineCnApplyPick(wrap, cn);
}
function salesOrderLineCnApplyPick(wrap, cn) {
  if (!wrap) return;
  var cnU = String(cn || '').trim().toUpperCase();
  var hid = wrap.querySelector('.sol-cn-val');
  var inp = wrap.querySelector('.sol-cn-search');
  var dd = wrap.querySelector('.sol-cn-dd');
  if (hid) hid.value = cnU;
  if (inp) inp.value = cnU;
  if (dd) {
    dd.style.display = 'none';
    dd.innerHTML = '';
  }
  var tr = wrap.closest('tr.csm-sol-main');
  if (tr) salesOrderLineAfterCnPicked(tr, cnU);
}
function salesOrderLineAfterCnPicked(tr, cnU) {
  var pr = tr.querySelector('.sol-pr');
  if (!pr) return;
  var prev = String(pr.value || '').trim();
  pr.innerHTML = buildSalesOrderLineProductOptionsForCn(cnU, prev);
  var distinct = getDistinctPurchaseProductsForCn(cnU);
  if (distinct.length === 1) pr.value = distinct[0];
  salesOrderRefreshRemainingHintForRow(tr);
  salesOrderRefreshAllRemainingHints();
}
function salesOrderLineProductChanged(el) {
  var tr = el && el.closest && el.closest('tr.csm-sol-main');
  if (!tr) return;
  salesOrderRefreshRemainingHintForRow(tr);
  salesOrderRefreshAllRemainingHints();
}
function salesOrderLineCnSearchInput(el) {
  var wrap = el && el.closest && el.closest('.csm-sol-cn-wrap');
  if (!wrap) return;
  var hid = wrap.querySelector('.sol-cn-val');
  var curU = (hid && hid.value || '').trim().toUpperCase();
  var ty = String(el.value || '').trim().toUpperCase();
  if (hid && curU && ty !== curU) hid.value = '';
  if (!ty) {
    if (hid) hid.value = '';
    var tr0 = wrap.closest('tr.csm-sol-main');
    if (tr0) {
      var pr0 = tr0.querySelector('.sol-pr');
      if (pr0) pr0.innerHTML = buildSalesOrderLineProductOptionsForCn('', '');
      salesOrderRefreshRemainingHintForRow(tr0);
      salesOrderRefreshAllRemainingHints();
    }
  }
  salesOrderLineCnRenderDd(el);
}
function salesOrderLineCnSearchFocus(el) {
  salesOrderLineCnRenderDd(el);
}
function salesOrderLineCnSearchBlurResolve(el) {
  var wrap = el && el.closest && el.closest('.csm-sol-cn-wrap');
  if (!wrap) return;
  var hid = wrap.querySelector('.sol-cn-val');
  if (hid && hid.value) return;
  var q = String(el.value || '').trim().toUpperCase();
  if (!q) return;
  var list = getPurchaseCnListSorted();
  if (list.indexOf(q) >= 0) {
    salesOrderLineCnApplyPick(wrap, q);
    return;
  }
  var fuzzy = list.filter(function(c) { return c.indexOf(q) >= 0; });
  if (fuzzy.length === 1) salesOrderLineCnApplyPick(wrap, fuzzy[0]);
}
function salesOrderLineCnSearchBlurSoon(el) {
  setTimeout(function() {
    var wrap = el && el.closest && el.closest('.csm-sol-cn-wrap');
    if (!wrap) return;
    var dd = wrap.querySelector('.sol-cn-dd');
    if (dd) dd.style.display = 'none';
    salesOrderLineCnSearchBlurResolve(el);
  }, 200);
}
function buildSalesOrderLineEditorRow(line) {
  line = line || {};
  var cn = line.containerNo || '';
  var pr = line.productName || '';
  var qty = line.quantity != null && line.quantity !== '' ? line.quantity : 1;
  var workerQty = line.workerQty != null && line.workerQty !== '' ? line.workerQty : '';
  var truckQty = line.truckQty != null && line.truckQty !== '' ? line.truckQty : '';
  var vm = (line.vatMode === 'included') ? 'included' : 'excluded';
  var up = line.unitPrice;
  var hasUp = up != null && up !== '' && !isNaN(parseFloat(up));
  var nu = hasUp ? parseFloat(up) : NaN;
  var mult = 1 + VAT_RATE;
  var inclVal = '';
  var exclVal = '';
  var basisAttr = '';
  if (hasUp) {
    if (vm === 'included') {
      inclVal = String(nu);
      exclVal = String(csmSalesRound2(nu / mult));
      basisAttr = ' data-price-basis="included"';
    } else {
      exclVal = String(nu);
      inclVal = String(csmSalesRound2(nu * mult));
      basisAttr = ' data-price-basis="excluded"';
    }
  }
  var svc = '<div class="csm-sol-svc-grid">' +
    '<div class="csm-sol-svc-col"><div style="font-size:11px;color:#555;margin-bottom:6px">Worker</div><div class="csm-sol-svc-fields">' +
    '<select class="sol-worker-id">' + csmSalesBuildServiceSelectHtml(salesWorkers, line.workerId, 'Select worker') + '</select>' +
    '<input type="number" class="sol-worker-qty" min="0" step="any" value="' + (workerQty === '' ? '' : csmEscapeHtml(String(workerQty))) + '" placeholder="Qty" inputmode="decimal" oninput="salesOrderServiceQtyInput(this)" title="Worker Qty (not more than line Qty; rate is AED per box for this product)">' +
    '</div></div>' +
    '<div class="csm-sol-svc-col"><div style="font-size:11px;color:#555;margin-bottom:6px">Truck</div><div class="csm-sol-svc-fields">' +
    '<select class="sol-truck-id">' + csmSalesBuildServiceSelectHtml(salesTrucks, line.truckId, 'Select truck') + '</select>' +
    '<input type="number" class="sol-truck-qty" min="0" step="any" value="' + (truckQty === '' ? '' : csmEscapeHtml(String(truckQty))) + '" placeholder="Qty" inputmode="decimal" oninput="salesOrderServiceQtyInput(this)" title="Truck Qty (not more than line Qty; rate is AED per box for this product)">' +
    '</div></div></div>';
  return '<tr class="csm-sol-main"' + basisAttr + '>' +
    buildSalesOrderLineCnCellHtml(cn) +
    '<td style="padding:6px 8px;vertical-align:middle"><select class="sol-pr csm-product-select" onchange="salesOrderLineProductChanged(this)" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box">' +
    buildSalesOrderLineProductOptionsForCn(String(cn || '').trim().toUpperCase(), pr) + '</select></td>' +
    '<td style="padding:6px 8px;vertical-align:middle"><div class="sol-qty-rem" style="font-size:11px;color:#0f766e;margin-bottom:4px;font-family:var(--csm-font-en);font-weight:700">Remaining / 剩余: —</div><input type="number" class="sol-qty" min="0.01" step="any" value="' + csmEscapeHtml(String(qty)) + '" oninput="salesOrderLineQtyChanged(this)" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-family:var(--csm-font-en);font-weight:700;box-sizing:border-box"></td>' +
    '<td style="padding:6px 8px;vertical-align:middle"><input type="number" class="sol-price-incl" min="0" step="any" value="' + (inclVal === '' ? '' : csmEscapeHtml(inclVal)) + '" oninput="salesOrderLinePriceSync(this)" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-family:var(--csm-font-en);font-weight:700;box-sizing:border-box" title="Unit including 5% VAT \u2014 other column auto-fills"></td>' +
    '<td style="padding:6px 8px;vertical-align:middle"><input type="number" class="sol-price-excl" min="0" step="any" value="' + (exclVal === '' ? '' : csmEscapeHtml(exclVal)) + '" oninput="salesOrderLinePriceSync(this)" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;font-family:var(--csm-font-en);font-weight:700;box-sizing:border-box" title="Unit before 5% VAT \u2014 other column auto-fills"></td>' +
    '<td style="padding:6px 4px;vertical-align:middle;text-align:center"><button type="button" class="abtn x" onclick="salesOrderRemoveLine(this)" title="Remove line">\u00d7</button></td>' +
    '</tr>' +
    '<tr class="csm-sol-sub"><td colspan="6" style="padding:6px 8px;vertical-align:top;background:#fafafa;border-bottom:1px solid #e0e0e0">' + svc + '</td></tr>';
}
function salesOrderRefreshServiceSelectorsInDom() {
  var tb = gid('sales-order-lines-body');
  if (!tb) return;
  tb.querySelectorAll('tr.csm-sol-sub').forEach(function(sub) {
    var workerSel = sub.querySelector('.sol-worker-id');
    var truckSel = sub.querySelector('.sol-truck-id');
    if (workerSel) {
      var workerVal = workerSel.value;
      workerSel.innerHTML = csmSalesBuildServiceSelectHtml(salesWorkers, workerVal, 'Select worker');
      if (workerVal) workerSel.value = workerVal;
    }
    if (truckSel) {
      var truckVal = truckSel.value;
      truckSel.innerHTML = csmSalesBuildServiceSelectHtml(salesTrucks, truckVal, 'Select truck');
      if (truckVal) truckSel.value = truckVal;
    }
  });
}
function salesOrderLinePriceSync(el) {
  var tr = el && el.closest && el.closest('tr');
  if (!tr || tr._csmPriceSyncing) return;
  var inc = tr.querySelector('.sol-price-incl');
  var exc = tr.querySelector('.sol-price-excl');
  if (!inc || !exc) return;
  var mult = 1 + VAT_RATE;
  tr._csmPriceSyncing = true;
  try {
    if (el === inc) {
      var s = String(inc.value || '').trim();
      if (s === '' || isNaN(parseFloat(s)) || parseFloat(s) < 0) {
        exc.value = '';
        tr.removeAttribute('data-price-basis');
        return;
      }
      tr.setAttribute('data-price-basis', 'included');
      var ni = parseFloat(s);
      exc.value = String(csmSalesRound2(ni / mult));
    } else {
      var s2 = String(exc.value || '').trim();
      if (s2 === '' || isNaN(parseFloat(s2)) || parseFloat(s2) < 0) {
        inc.value = '';
        tr.removeAttribute('data-price-basis');
        return;
      }
      tr.setAttribute('data-price-basis', 'excluded');
      var ne = parseFloat(s2);
      inc.value = String(csmSalesRound2(ne * mult));
    }
  } finally {
    tr._csmPriceSyncing = false;
  }
}
function salesOrderLineQtyChanged(qtyEl) {
  var tr = qtyEl && qtyEl.closest && qtyEl.closest('tr.csm-sol-main');
  if (!tr) return;
  var rem = csmSalesRemainingQtyForEditorRow(tr);
  var qtyNow = parseFloat(qtyEl.value);
  if (!isNaN(qtyNow) && qtyNow > rem.available) qtyEl.value = String(rem.available);
  var sub = tr.nextElementSibling;
  if (!sub || !sub.classList.contains('csm-sol-sub')) return;
  var lineQty = parseFloat(qtyEl.value);
  var capOk = lineQty > 0 && !isNaN(lineQty);
  [sub.querySelector('.sol-worker-qty'), sub.querySelector('.sol-truck-qty')].forEach(function(inp) {
    if (!inp) return;
    if (capOk) inp.setAttribute('max', String(lineQty)); else inp.removeAttribute('max');
    var v = parseFloat(inp.value);
    if (capOk && !isNaN(v) && v > lineQty) inp.value = String(lineQty);
  });
  salesOrderRefreshAllRemainingHints();
}
function salesOrderServiceQtyInput(el) {
  var sub = el && el.closest && el.closest('tr.csm-sol-sub');
  if (!sub) return;
  var main = sub.previousElementSibling;
  if (!main || !main.classList.contains('csm-sol-main')) return;
  var qtyEl = main.querySelector('.sol-qty');
  if (!qtyEl) return;
  var lineQty = parseFloat(qtyEl.value);
  if (!(lineQty > 0) || isNaN(lineQty)) return;
  var v = parseFloat(el.value);
  if (!isNaN(v) && v > lineQty) el.value = String(lineQty);
}
function salesOrderSyncServiceQtyCapsFromDom() {
  var tb = gid('sales-order-lines-body');
  if (!tb) return;
  tb.querySelectorAll('tr.csm-sol-main .sol-qty').forEach(function(q) { salesOrderLineQtyChanged(q); });
  salesOrderRefreshAllRemainingHints();
}
function salesOrderFillLinesBody(orderOrNull) {
  var tb = gid('sales-order-lines-body');
  if (!tb) return;
  var lines = orderOrNull ? csmSalesNormalizeLinesFromOrder(orderOrNull) : [];
  if (!lines.length) {
    tb.innerHTML = buildSalesOrderLineEditorRow({});
    salesOrderSyncServiceQtyCapsFromDom();
    return;
  }
  tb.innerHTML = lines.map(function(L) { return buildSalesOrderLineEditorRow(L); }).join('');
  salesOrderSyncServiceQtyCapsFromDom();
}
function salesOrderAddLine() {
  var tb = gid('sales-order-lines-body');
  if (!tb) return;
  tb.insertAdjacentHTML('beforeend', buildSalesOrderLineEditorRow({}));
  salesOrderSyncServiceQtyCapsFromDom();
}
function salesOrderRemoveLine(btn) {
  var tb = gid('sales-order-lines-body');
  if (!tb) return;
  if (tb.querySelectorAll('tr.csm-sol-main').length <= 1) { toast('At least one order line is required.', 'err'); return; }
  var tr = btn.closest('tr');
  if (!tr || !tr.classList.contains('csm-sol-main')) return;
  var sub = tr.nextElementSibling;
  if (sub && sub.classList.contains('csm-sol-sub')) sub.remove();
  tr.remove();
  salesOrderRefreshAllRemainingHints();
}
function salesOrderReadLinesFromDom() {
  var tb = gid('sales-order-lines-body');
  if (!tb) return { err: 'Missing line editor' };
  var out = [];
  var incomplete = false;
  var svcQtyOver = false;
  var priceMismatch = false;
  var mult = 1 + VAT_RATE;
  var tol = 0.021;
  tb.querySelectorAll('tr.csm-sol-main').forEach(function(tr) {
    var sub = tr.nextElementSibling;
    if (!sub || !sub.classList || !sub.classList.contains('csm-sol-sub')) return;
    var hidCn = tr.querySelector('.sol-cn-val');
    var prEl = tr.querySelector('.sol-pr');
    var qtyEl = tr.querySelector('.sol-qty');
    var incEl = tr.querySelector('.sol-price-incl');
    var excEl = tr.querySelector('.sol-price-excl');
    var workerIdEl = sub.querySelector('.sol-worker-id');
    var workerQtyEl = sub.querySelector('.sol-worker-qty');
    var truckIdEl = sub.querySelector('.sol-truck-id');
    var truckQtyEl = sub.querySelector('.sol-truck-qty');
    var cn = (hidCn && hidCn.value || '').trim().toUpperCase();
    var pr = canonicalProductName((prEl && prEl.value || '').trim());
    var qty = parseFloat(qtyEl && qtyEl.value);
    var sIn = incEl ? String(incEl.value || '').trim() : '';
    var sEx = excEl ? String(excEl.value || '').trim() : '';
    var nIn = parseFloat(sIn);
    var nEx = parseFloat(sEx);
    var workerId = (workerIdEl && workerIdEl.value || '').trim();
    var workerQtyRaw = workerQtyEl ? String(workerQtyEl.value || '').trim() : '';
    var workerQty = parseFloat(workerQtyRaw);
    var truckId = (truckIdEl && truckIdEl.value || '').trim();
    var truckQtyRaw = truckQtyEl ? String(truckQtyEl.value || '').trim() : '';
    var truckQty = parseFloat(truckQtyRaw);
    var hasIn = sIn !== '' && !isNaN(nIn) && nIn >= 0;
    var hasEx = sEx !== '' && !isNaN(nEx) && nEx >= 0;
    var hasWorkerQty = workerQtyRaw !== '' && !isNaN(workerQty) && workerQty >= 0;
    var hasTruckQty = truckQtyRaw !== '' && !isNaN(truckQty) && truckQty >= 0;
    if (workerId && !(hasWorkerQty && workerQty > 0)) {
      workerId = '';
      workerQtyRaw = '';
      hasWorkerQty = false;
    }
    if (truckId && !(hasTruckQty && truckQty > 0)) {
      truckId = '';
      truckQtyRaw = '';
      hasTruckQty = false;
    }
    workerQty = parseFloat(workerQtyRaw);
    truckQty = parseFloat(truckQtyRaw);
    hasWorkerQty = workerQtyRaw !== '' && !isNaN(workerQty) && workerQty >= 0;
    hasTruckQty = truckQtyRaw !== '' && !isNaN(truckQty) && truckQty >= 0;
    var any = cn || pr || (qty > 0) || hasIn || hasEx || workerId || hasWorkerQty || truckId || hasTruckQty;
    if (!any) return;
    if (!cn || !pr || !(qty > 0)) {
      incomplete = true;
      return;
    }
    var rem = csmSalesRemainingQtyForEditorRow(tr);
    if (qty > rem.available) {
      svcQtyOver = true;
      return;
    }
    var wPartial = (!workerId && hasWorkerQty && workerQty > 0);
    var tPartial = (!truckId && hasTruckQty && truckQty > 0);
    if (wPartial || tPartial) {
      incomplete = true;
      return;
    }
    if (workerId && hasWorkerQty && workerQty > qty) {
      svcQtyOver = true;
      return;
    }
    if (truckId && hasTruckQty && truckQty > qty) {
      svcQtyOver = true;
      return;
    }
    function withServices(base) {
      base.workerId = workerId;
      base.workerQty = workerId ? workerQty : 0;
      base.truckId = truckId;
      base.truckQty = truckId ? truckQty : 0;
      return base;
    }
    if (hasIn && hasEx) {
      var basis = (tr.getAttribute('data-price-basis') || '').trim().toLowerCase();
      if (basis === 'included') {
        out.push(withServices({ containerNo: cn, productName: pr, quantity: qty, unitPrice: nIn, vatMode: 'included' }));
      } else if (basis === 'excluded') {
        out.push(withServices({ containerNo: cn, productName: pr, quantity: qty, unitPrice: nEx, vatMode: 'excluded' }));
      } else if (Math.abs(nEx - csmSalesRound2(nIn / mult)) <= tol) {
        out.push(withServices({ containerNo: cn, productName: pr, quantity: qty, unitPrice: nIn, vatMode: 'included' }));
      } else if (Math.abs(nIn - csmSalesRound2(nEx * mult)) <= tol) {
        out.push(withServices({ containerNo: cn, productName: pr, quantity: qty, unitPrice: nEx, vatMode: 'excluded' }));
      } else {
        priceMismatch = true;
      }
    } else if (hasIn) {
      out.push(withServices({ containerNo: cn, productName: pr, quantity: qty, unitPrice: nIn, vatMode: 'included' }));
    } else if (hasEx) {
      out.push(withServices({ containerNo: cn, productName: pr, quantity: qty, unitPrice: nEx, vatMode: 'excluded' }));
    } else {
      incomplete = true;
    }
  });
  if (priceMismatch) return { err: 'Include VAT and Exclude VAT must match 5% VAT on each line (or clear one column).' };
  if (svcQtyOver) return { err: 'Qty cannot exceed remaining quantity, and worker or truck Qty cannot exceed line Qty on a line.' };
  if (incomplete) return { err: 'Each line needs container, product, qty, and at least one unit price. If you enter worker or truck, set both name and Qty.' };
  if (!out.length) return { err: 'Add at least one complete line (container + product + qty + unit price).' };
  return { lines: out };
}
function salesOrderApplyCustomerLockState(locked) {
  var inp = gid('sales-order-customer-search');
  if (!inp) return;
  inp.readOnly = !!locked;
  inp.style.background = locked ? '#f5f5f5' : '';
  inp.title = locked ? 'Customer cannot be changed after the order was saved as draft.' : '';
}
function openSalesOrderModal(id) {
  var m = gid('sales-order-modal');
  if (!m) return;
  m.classList.add('sh');
  gid('sales-order-id').value = id || '';
  gid('sales-order-payment').value = 'cash_pending';
  var onDisp = gid('sales-order-order-no-display');
  var ctDisp = gid('sales-order-created-display');
  var prSel = gid('sales-order-payment-receiver');
  if (id) {
    var o = salesOrders.find(function(x) { return x.id === id; });
    if (!o) { clSalesOrderModal(); return; }
    if (o.voided) { toast('\u8BA2\u5355\u5DF2\u4F5C\u5E9F\uFF0C\u4E0D\u53EF\u7F16\u8F91', 'err'); clSalesOrderModal(); return; }
    if (o.orderStatus !== 'draft') { toast('Only draft orders editable', 'err'); clSalesOrderModal(); return; }
    salesOrderCustomerComboSet(o.customerId || '');
    salesOrderFillLinesBody(o);
    gid('sales-order-payment').value = csmSalesGetPaymentMethod(o) || 'cash_pending';
    if (onDisp) onDisp.textContent = o.orderNo || '\u2014';
    if (ctDisp) ctDisp.textContent = csmSalesFormatOrderCreated(o.createdAt);
    if (prSel) salesFillPaymentReceiverSelect(prSel, o.paymentReceiverId || '');
    salesOrderApplyCustomerLockState(true);
  } else {
    salesOrderCustomerComboPrepare();
    salesOrderApplyCustomerLockState(false);
    salesOrderFillLinesBody(null);
    if (onDisp) onDisp.textContent = csmSalesNextOrderNoForDate(csmSalesLocalYmdCompact(new Date()));
    if (ctDisp) ctDisp.textContent = csmSalesFormatOrderCreated(new Date().toISOString()) + ' \uFF08\u9884\u89C8\uFF0C\u4EE5\u4FDD\u5B58\u65F6\u4E3A\u51C6\uFF09';
    if (prSel) salesFillPaymentReceiverSelect(prSel, '');
  }
}
function clSalesOrderModal() {
  clSalesPaymentReceiversModal();
  var m = gid('sales-order-modal');
  if (m) m.classList.remove('sh');
}
function saveSalesOrderFromModal(submitAfter) {
  submitAfter = !!submitAfter;
  if (!salesOrdersRef) { toast('Database not connected', 'err'); return; }
  var id = (gid('sales-order-id').value || '').trim();
  var customerId = (gid('sales-order-customer-id') && gid('sales-order-customer-id').value || '').trim();
  var cust = salesCustomers.find(function(c) { return c.id === customerId; });
  if (!cust) { toast('Select customer', 'err'); return; }
  var payment = gid('sales-order-payment').value || '';
  if (!payment) { toast('Select payment method', 'err'); return; }
  var prEl = gid('sales-order-payment-receiver');
  var prId = prEl ? String(prEl.value || '').trim() : '';
  if (!prId) { toast('Select payment receiver', 'err'); return; }
  var rd = salesOrderReadLinesFromDom();
  if (rd.err) { toast(rd.err, 'err'); return; }
  var newLines = rd.lines;
  if (getW1ProductsNormalized().length === 0) { toast('Add products in Settings → 品名管理 first', 'err'); return; }
  if (getPurchaseCnListSorted().length === 0) {
    toast('\u6682\u65E0\u91C7\u8D2D\u8BB0\u5F55\u4E2D\u7684\u96C6\u88C5\u7BB1\u53F7\uFF0C\u8BF7\u5148\u5728 Warehouse1 \u91C7\u8D2D\u4E2D\u5F55\u5165', 'err');
    return;
  }
  var tmpTotals = csmSalesLineNetVatTotal({ lines: newLines });
  if (!id) id = 'so_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  var existing = salesOrders.find(function(x) { return x.id === id; });
  var prEnt = prId ? salesPaymentReceivers.find(function(x) { return x.id === prId; }) : null;
  var prName = prEnt ? (prEnt.name || '').trim() : '';
  if (!prName && prId && existing && String(existing.paymentReceiverId || '') === prId) {
    prName = (existing.paymentReceiverName || '').trim();
  }
  if (existing && existing.voided) { toast('\u8BA2\u5355\u5DF2\u4F5C\u5E9F\uFF0C\u4E0D\u53EF\u4FDD\u5B58', 'err'); return; }
  if (existing && existing.orderStatus !== 'draft') { toast('Not editable', 'err'); return; }
  var nowIso = new Date().toISOString();
  var ymdToday = csmSalesLocalYmdCompact(new Date());
  var orderNoVal;
  var createdVal;
  if (existing) {
    orderNoVal = existing.orderNo || csmSalesNextOrderNoForDate(csmSalesLocalYmdCompact(new Date(existing.createdAt || nowIso)));
    createdVal = existing.createdAt || nowIso;
  } else {
    orderNoVal = csmSalesNextOrderNoForDate(ymdToday);
    createdVal = nowIso;
  }
  newLines = csmSalesApplyWorkerTruckRatesToLines(newLines);
  var L0 = newLines[0];
  var orderVatMode = (L0 && (L0.vatMode === 'included' || L0.vatMode === 'excluded')) ? L0.vatMode : 'excluded';
  var paidStatus = payment === 'cash' ? 'paid' : 'unpaid';
  var rec = {
    orderNo: orderNoVal,
    customerId: customerId,
    customerName: csmSalesCustomerOrderSnapshotName(cust),
    containerNo: L0.containerNo,
    productName: L0.productName,
    quantity: L0.quantity,
    unitPrice: L0.unitPrice,
    workerId: L0.workerId || '',
    workerName: L0.workerName || '',
    workerQty: L0.workerQty || 0,
    workerRate: L0.workerRate || 0,
    workerAmount: L0.workerAmount || 0,
    truckId: L0.truckId || '',
    truckName: L0.truckName || '',
    truckQty: L0.truckQty || 0,
    truckRate: L0.truckRate || 0,
    truckAmount: L0.truckAmount || 0,
    lines: newLines,
    vatMode: orderVatMode,
    paymentMethod: payment,
    paymentPaidStatus: paidStatus,
    paymentStatus: payment,
    paymentReceiverId: prId || '',
    paymentReceiverName: prName,
    orderStatus: submitAfter ? 'submitted' : 'draft',
    totalAmount: tmpTotals.total,
    netAmount: tmpTotals.net,
    vatAmount: tmpTotals.vat,
    createdAt: createdVal,
    updatedAt: nowIso,
    voided: false
  };
  csmSalesPurchaseDeltaForLinesSave(existing, newLines).then(function() {
    return salesOrdersRef.child(id).set(rec);
  }).then(function() {
    toast(submitAfter ? 'Submitted / \u5DF2\u63D0\u4EA4' : 'Order saved (draft)', 'ok');
    clSalesOrderModal();
  }).catch(function(e) { toast('Save failed: ' + (e.message || e), 'err'); });
}
function salesUndoSubmit(id) {
  var o = salesOrders.find(function(x) { return x.id === id; });
  if (!o || o.voided || o.orderStatus !== 'submitted' || !salesOrdersRef) return;
  salesOrdersRef.child(id).update({ orderStatus: 'draft', updatedAt: new Date().toISOString() }).then(function() { toast('Withdrawn', 'ok'); }).catch(function(e) { toast(e.message, 'err'); });
}
function salesVoidDraftOrder(id) {
  var o = salesOrders.find(function(x) { return x.id === id; });
  if (!o || o.orderStatus !== 'draft' || o.voided || !salesOrdersRef) return;
  if (!confirm('\u4F5C\u5E9F\u540E\u8BA2\u5355\u5C06\u6807\u7EA2\u4FDD\u7559\uFF0C\u91C7\u8D2D\u6570\u91CF\u5C06\u8FD4\u56DE\uFF0C\u786E\u5B9A\uFF1F')) return;
  var lines = csmSalesNormalizeLinesFromOrder(o);
  var promises = [];
  if (lines.length) {
    lines.forEach(function(L) {
      promises.push(csmSalesPurchaseApplyQtyDelta(L.containerNo, L.productName, L.quantity));
    });
  } else {
    var cn = (o.containerNo || '').trim().toUpperCase();
    var prod = canonicalProductName((o.productName || '').trim());
    var qret = parseFloat(o.quantity) || 0;
    promises.push(csmSalesPurchaseApplyQtyDelta(cn, prod, qret));
  }
  Promise.all(promises).then(function() {
    return salesOrdersRef.child(id).update({
      voided: true,
      voidedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }).then(function() { toast('\u5DF2\u4F5C\u5E9F', 'ok'); }).catch(function(e) { toast(e.message || String(e), 'err'); });
}
function salesDeleteOrder(id) {
  salesVoidDraftOrder(id);
}
window.__csmMainScriptRan=1;
try { window.initApp = initApp; } catch (e) {}
try { window.initFirebase = initFirebase; } catch (e) {}
try { window.csmApplyAuthProxyToAppWithGetAuth = csmApplyAuthProxyToAppWithGetAuth; } catch (e) {}
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
try { window.salesBatchCancel = salesBatchCancel; } catch (e) {}
try { window.salesBatchSubmit = salesBatchSubmit; } catch (e) {}
try { window.salesBatchConfirm = salesBatchConfirm; } catch (e) {}
try { window.salesConfirmPaymentPaid = salesConfirmPaymentPaid; } catch (e) {}
try { window.salesPrintOrderInvoice = salesPrintOrderInvoice; } catch (e) {}
try { window.openSalesOrderUpdateWorkerModal = openSalesOrderUpdateWorkerModal; } catch (e) {}
try { window.clSalesOrderUpwtModal = clSalesOrderUpwtModal; } catch (e) {}
try { window.saveSalesOrderUpdateWorkerTruckFromModal = saveSalesOrderUpdateWorkerTruckFromModal; } catch (e) {}
try { window.csmSalesOrdersGoPage = csmSalesOrdersGoPage; } catch (e) {}
try { window.csmSalesOrdersSetPageSize = csmSalesOrdersSetPageSize; } catch (e) {}
try { window.salesOrdersFilterChange = salesOrdersFilterChange; } catch (e) {}
try { window.csmSalesFinanceGoPage = csmSalesFinanceGoPage; } catch (e) {}
try { window.csmSalesFinanceSetPageSize = csmSalesFinanceSetPageSize; } catch (e) {}
try { window.csmSalesOrderCbExclusive = csmSalesOrderCbExclusive; } catch (e) {}
try { window.csmSalesToggleOrderSubRows = csmSalesToggleOrderSubRows; } catch (e) {}
try { window.salesOrderAddLine = salesOrderAddLine; } catch (e) {}
try { window.salesOrderRemoveLine = salesOrderRemoveLine; } catch (e) {}
try { window.salesOrderLineCnSearchInput = salesOrderLineCnSearchInput; } catch (e) {}
try { window.salesOrderLineCnSearchFocus = salesOrderLineCnSearchFocus; } catch (e) {}
try { window.salesOrderLineCnSearchBlurSoon = salesOrderLineCnSearchBlurSoon; } catch (e) {}
try { window.salesOrderLineCnDdPick = salesOrderLineCnDdPick; } catch (e) {}
try { window.salesOrderLinePriceSync = salesOrderLinePriceSync; } catch (e) {}
try { window.salesOrderLineQtyChanged = salesOrderLineQtyChanged; } catch (e) {}
try { window.salesOrderServiceQtyInput = salesOrderServiceQtyInput; } catch (e) {}
try { window.salesOrderLineProductChanged = salesOrderLineProductChanged; } catch (e) {}
try { window.salesOrderCustomerComboOnInput = salesOrderCustomerComboOnInput; } catch (e) {}
try { window.salesOrderCustomerComboOnFocus = salesOrderCustomerComboOnFocus; } catch (e) {}
try { window.salesOrderCustomerComboOnBlurSoon = salesOrderCustomerComboOnBlurSoon; } catch (e) {}
try { window.salesOrderCustomerComboPick = salesOrderCustomerComboPick; } catch (e) {}
try { window.openSalesPaymentReceiversModal = openSalesPaymentReceiversModal; } catch (e) {}
try { window.clSalesPaymentReceiversModal = clSalesPaymentReceiversModal; } catch (e) {}
try { window.addSalesPaymentReceiver = addSalesPaymentReceiver; } catch (e) {}
try { window.deleteSalesPaymentReceiver = deleteSalesPaymentReceiver; } catch (e) {}
try { window.openSalesWorkerTruckModal = openSalesWorkerTruckModal; } catch (e) {}
try { window.clSalesWorkerTruckModal = clSalesWorkerTruckModal; } catch (e) {}
try { window.salesWorkerFormReset = salesWorkerFormReset; } catch (e) {}
try { window.salesTruckFormReset = salesTruckFormReset; } catch (e) {}
try { window.saveSalesWorkerFromModal = saveSalesWorkerFromModal; } catch (e) {}
try { window.saveSalesTruckFromModal = saveSalesTruckFromModal; } catch (e) {}
try { window.editSalesWorker = editSalesWorker; } catch (e) {}
try { window.editSalesTruck = editSalesTruck; } catch (e) {}
try { window.deleteSalesWorker = deleteSalesWorker; } catch (e) {}
try { window.deleteSalesTruck = deleteSalesTruck; } catch (e) {}
try { window.swFinSub = swFinSub; } catch (e) {}
try { window.csmFinWtRunSearch = csmFinWtRunSearch; } catch (e) {}
try { window.csmFinWtSubmitPending = csmFinWtSubmitPending; } catch (e) {}
try { window.csmFinWtOpenConfirm = csmFinWtOpenConfirm; } catch (e) {}
try { window.clFinWtConfirmModal = clFinWtConfirmModal; } catch (e) {}
try { window.csmFinWtConfirmApply = csmFinWtConfirmApply; } catch (e) {}
try { window.renderCompanyFinancialPending = renderCompanyFinancialPending; } catch (e) {}
try { window.csmFinPendingToggle = csmFinPendingToggle; } catch (e) {}
try { window.csmFinWtQuickApprove = csmFinWtQuickApprove; } catch (e) {}
try { window.renderFinCnReconTable = renderFinCnReconTable; } catch (e) {}
try { window.openFinCnReconDetailModal = openFinCnReconDetailModal; } catch (e) {}
try { window.clFinCnReconDetailModal = clFinCnReconDetailModal; } catch (e) {}
try { window.printFinCnReconDetailPdf = printFinCnReconDetailPdf; } catch (e) {}
try { window.finCnReconOpenOrderEdit = finCnReconOpenOrderEdit; } catch (e) {}
try { window.openFinCnReconLineEditModal = openFinCnReconLineEditModal; } catch (e) {}
try { window.clFinCnReconLineEditModal = clFinCnReconLineEditModal; } catch (e) {}
try { window.saveFinCnReconLineEdit = saveFinCnReconLineEdit; } catch (e) {}
try { window.csmFinCnReconEditPreview = csmFinCnReconEditPreview; } catch (e) {}
try { window.openFinCnReconExpenseEditModal = openFinCnReconExpenseEditModal; } catch (e) {}
try { window.clFinCnReconExpenseEditModal = clFinCnReconExpenseEditModal; } catch (e) {}
try { window.saveFinCnReconExpenseEdit = saveFinCnReconExpenseEdit; } catch (e) {}
