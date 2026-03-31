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

// 冷库1费率：38 AED/托盘/周 + 5% VAT
const RATE_PER_PALLET_PER_WEEK = 38;
const VAT_RATE = 0.05;
const RATE_WITH_VAT = RATE_PER_PALLET_PER_WEEK * (1 + VAT_RATE); // 39.9 AED
const DAYS_PER_WEEK = 7;

// ============================================================
// STATE
// ============================================================
var recs = [];
var currentColdStore = 1;

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
  } catch(e) {
    console.error('Firebase init error:', e);
    toast('❌ Firebase 连接失败: ' + e.message, 'err');
  }
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
  var cn = (gid('f-cn').value || '').trim().toUpperCase();
  var supplier = (gid('f-supplier').value || '').trim();
  var product = (gid('f-product').value || '').trim();
  var pallets = parseInt(gid('f-pallets').value) || 1;
  var items = parseInt(gid('f-items').value) || 1;
  var at = gid('f-at').value;

  if (!cn || cn.length < 4) { toast('请输入有效的集装箱号码 (至少4个字符)', 'err'); return; }
  if (!product) { toast('请输入品名', 'err'); return; }
  if (!at) { toast('请输入入库日期', 'err'); return; }

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
    dbRef.child(id).set(rec);
  }
  toast('✅ 入库成功: ' + cn, 'ok');

  // 清空表单
  gid('f-cn').value = '';
  gid('f-supplier').value = '';
  gid('f-product').value = '';
  gid('f-pallets').value = '1';
  gid('f-items').value = '1';
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
  updStats();
}

function renderRecords() {
  // 分离入库记录和出库记录
  var inRecs = recs.filter(function(r) { return r.store === currentColdStore && !r.type; })
    .sort(function(a, b) { return new Date(b.arr) - new Date(a.arr); });
  var outRecs = recs.filter(function(r) { return r.store === currentColdStore && r.type === 'checkout'; })
    .sort(function(a, b) { return new Date(b.dep) - new Date(a.dep); });

  var tb = gid('tb-all');
  var es = gid('es-all');
  if (!tb || !es) return;

  if (inRecs.length === 0 && outRecs.length === 0) {
    tb.innerHTML = ''; es.style.display = 'block'; return;
  }
  es.style.display = 'none';

  var html = inRecs.map(function(r) {
    var remaining_pallets = r.pallets - (r.pallets_out || 0);
    var remaining_items = r.items - (r.items_out || 0);
    var fee = calcFee(r);
    var status = r.dep ? '<span class="bdg bdg-d">已出库</span>' : '<span class="bdg bdg-a">在库</span>';
    return '<tr style="background:#fff">' +
      '<td><strong>' + r.cn + '</strong></td>' +
      '<td>' + (r.supplier || '-') + '</td><td>' + r.product + '</td>' +
      '<td>冷库 ' + r.store + '</td>' +
      '<td>' + r.pallets + ' / <span style="color:#ff9900">' + remaining_pallets + '</span></td>' +
      '<td>' + r.items + ' / <span style="color:#ff9900">' + remaining_items + '</span></td>' +
      '<td>' + fdt(r.arr) + '</td><td>' + fdt(r.dep) + '</td>' +
      '<td><strong style="color:#0066cc">' + fee.toFixed(2) + ' AED</strong></td>' +
      '<td>' + status + '</td>' +
      '<td><button class="abtn" onclick="showDet(\'' + r.id + '\')">详情</button></td></tr>';
  });

  // 显示出库记录
  html = html.concat(outRecs.map(function(r) {
    // 获取原始入库记录
    var inRec = recs.find(function(x) { return x.id === r.refId; });
    var remaining_pallets = inRec ? (inRec.pallets - (inRec.pallets_out || 0)) : 0;
    var remaining_items = inRec ? (inRec.items - (inRec.items_out || 0)) : 0;
    return '<tr style="background:#f0fff0">' +
      '<td><strong>' + r.cn + '</strong></td>' +
      '<td>' + (r.supplier || '-') + '</td><td>' + r.product + '</td>' +
      '<td>冷库 ' + r.store + '</td>' +
      '<td><span style="color:#cc0000">-' + r.pallets_out + '</span></td>' +
      '<td><span style="color:#cc0000">-' + r.items_out + '</span></td>' +
      '<td style="color:#00aa00;font-weight:bold">' + fdt(r.dep) + '</td>' +
      '<td style="color:#999">-</td>' +
      '<td><span style="color:#ff9900">' + remaining_pallets + '</span> / <span style="color:#00aa00">' + inRec.pallets + '</span></td>' +
      '<td><span style="color:#ff9900">' + remaining_items + '</span> / <span style="color:#00aa00">' + inRec.items + '</span></td>' +
      '<td><button class="abtn" onclick="showOutDet(\'' + r.id + '\')">详情</button></td></tr>';
  }));

  tb.innerHTML = html.join('');
}

function calcFee(r) {
  if (!r.arr) return 0;
  
  var start = new Date(r.arr);
  var end = r.dep ? new Date(r.dep) : new Date();
  var days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  
  if (days <= 0) return 0;
  
  var weeks = Math.ceil(days / 7);
  var totalPallets = r.pallets - (r.pallets_out || 0);
  
  return weeks * totalPallets * RATE_WITH_VAT;
}

function updStats() {
  var inRecs = recs.filter(function(r) { return r.store === currentColdStore && !r.dep; });
  
  gid('s-total').textContent = recs.length;
  gid('s-pallets').textContent = inRecs.reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);
  gid('s-items').textContent = inRecs.reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);

  gid('stat-store1-count').textContent = recs.filter(function(r) { return r.store === 1 && !r.dep; }).length;
  gid('stat-store1-pallets').textContent = recs.filter(function(r) { return r.store === 1 && !r.dep; }).reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);
  gid('stat-store1-items').textContent = recs.filter(function(r) { return r.store === 1 && !r.dep; }).reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);

  gid('stat-store2-count').textContent = recs.filter(function(r) { return r.store === 2 && !r.dep; }).length;
  gid('stat-store2-pallets').textContent = recs.filter(function(r) { return r.store === 2 && !r.dep; }).reduce(function(s, r) { return s + r.pallets - (r.pallets_out || 0); }, 0);
  gid('stat-store2-items').textContent = recs.filter(function(r) { return r.store === 2 && !r.dep; }).reduce(function(s, r) { return s + r.items - (r.items_out || 0); }, 0);
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
    html += '费率: ' + RATE_PER_PALLET_PER_WEEK + ' AED/托盘/周 + ' + (VAT_RATE*100) + '% VAT = ' + RATE_WITH_VAT + ' AED/托盘/周';
    html += '</div>';

    mcon.innerHTML = html;
  }

  gid('modal').classList.add('sh');
}

function clModal() {
  gid('modal').classList.remove('sh');
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
    mcon.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div class="mr"><span class="ml">记录类型</span><span class="mv"><span style="color:#00aa00;font-weight:bold">📤 出库记录</span></span></div>' +
      '<div class="mr"><span class="ml">集装箱号</span><span class="mv"><strong>' + r.cn + '</strong></span></div>' +
      '<div class="mr"><span class="ml">供应商</span><span class="mv">' + (r.supplier || '-') + '</span></div>' +
      '<div class="mr"><span class="ml">品名</span><span class="mv">' + r.product + '</span></div>' +
      '<div class="mr"><span class="ml">冷库</span><span class="mv">冷库 ' + r.store + '</span></div>' +
      '<div class="mr"><span class="ml">入库时间</span><span class="mv">' + fdt(r.inDate) + '</span></div>' +
      '<div class="mr"><span class="ml">入库托盘</span><span class="mv">' + r.inPallets + '</span></div>' +
      '<div class="mr"><span class="ml">入库件数</span><span class="mv">' + r.inItems + '</span></div>' +
      '<div class="mr"><span class="ml">出库时间</span><span class="mv" style="color:#00aa00;font-weight:bold">' + fdt(r.dep) + '</span></div>' +
      '<div class="mr"><span class="ml">出库托盘</span><span class="mv" style="color:#cc0000;font-weight:bold">' + r.pallets_out + '</span></div>' +
      '<div class="mr"><span class="ml">出库件数</span><span class="mv" style="color:#cc0000;font-weight:bold">' + r.items_out + '</span></div>' +
      '<div class="mr"><span class="ml">当前库存托盘</span><span class="mv" style="color:#ff9900;font-weight:bold">' + remaining_pallets + '</span></div>' +
      '<div class="mr"><span class="ml">当前库存件数</span><span class="mv" style="color:#ff9900;font-weight:bold">' + remaining_items + '</span></div>' +
      '</div><div style="margin-top:14px;padding:10px;background:#fff3cd;border:1px solid #ffc107;border-radius:5px;text-align:center;color:#856404;font-size:13px">此为单次出库记录，完整费用请查看入库记录详情</div>';
  }
  gid('modal').classList.add('sh');
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
  
  var tabNames = ['purchase', 'records', 'stats'];
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
  // 清空表单
  gid('fp-cn').value = '';
  gid('fp-supplier').value = '';
  gid('fp-product').value = '';
  gid('fp-date').value = nowFmt();
  gid('fp-qty').value = '0';
  gid('fp-demurrage').value = '0';
  gid('fp-customs').value = '0';
  gid('fp-coldfee').value = '0';
  gid('fp-repack').value = '0';
  gid('fp-waste').value = '0';
  gid('fp-other').value = '0';
  gid('purchaseModal').classList.add('sh');
}

function clPurchaseModal() {
  gid('purchaseModal').classList.remove('sh');
}

function addPurchase() {
  var cn = (gid('fp-cn').value || '').trim().toUpperCase();
  var supplier = (gid('fp-supplier').value || '').trim();
  var product = (gid('fp-product').value || '').trim();
  var purchaseDate = gid('fp-date').value;

  if (!cn) { toast('请输入集装箱号', 'err'); return; }
  if (!supplier) { toast('请输入供应商', 'err'); return; }
  if (!product) { toast('请输入品名', 'err'); return; }

  var id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  var item = {
    id: id,
    cn: cn,
    supplier: supplier,
    product: product,
    purchaseDate: purchaseDate,
    qty: parseFloat(gid('fp-qty').value) || 0,
    demurrage: parseFloat(gid('fp-demurrage').value) || 0,
    customs: parseFloat(gid('fp-customs').value) || 0,
    coldFee: parseFloat(gid('fp-coldfee').value) || 0,
    repack: parseFloat(gid('fp-repack').value) || 0,
    waste: parseFloat(gid('fp-waste').value) || 0,
    other: parseFloat(gid('fp-other').value) || 0
  };

  // 保存到 Firebase
  if (purchaseRef) {
    purchaseRef.child(id).set(item);
  }
  
  clPurchaseModal();
  toast('✅ 采购记录已添加', 'ok');
}

function delPurchase(id) {
  if (!confirm('确认删除这条采购记录？ / Confirm delete?')) return;
  if (purchaseRef) {
    purchaseRef.child(id).remove();
  }
}

function renderPurchase() {
  var tb = gid('tb-purchase');
  var es = gid('es-purchase');
  if (!tb || !es) return;
  if (purchaseRecs.length === 0) { tb.innerHTML = ''; es.style.display = 'block'; return; }
  es.style.display = 'none';

  var html = '';
  purchaseRecs.forEach(function(r) {
    var total = (r.demurrage||0)+(r.customs||0)+(r.coldFee||0)+(r.repack||0)+(r.waste||0)+(r.other||0);
    var purchaseDate = r.purchaseDate ? fdt(r.purchaseDate+'T00:00:00') : '-';
    
    // 查找对应的入库记录
    var inRec = null;
    for (var i = 0; i < recs.length; i++) {
      if (recs[i].cn === r.cn && !recs[i].type && recs[i].store === currentColdStore) { inRec = recs[i]; break; }
    }
    
    var outRecs = [];
    if (inRec) {
      for (var j = 0; j < recs.length; j++) {
        if (recs[j].refId === inRec.id && recs[j].type === 'checkout') outRecs.push(recs[j]);
      }
    }
    
    var expandBtn = outRecs.length > 0 ? '<button type="button" class="abtn" style="padding:2px 6px;font-size:11px;margin-right:4px" onclick="togglePurchaseExpand(\''+r.id+'\')">+</button>' : '';
    
    // 主行
    html += '<tr id="pur-tr-'+r.id+'">' +
      '<td>' + expandBtn + '<button type="button" class="abtn" style="background:#e8f4ff;border-color:#00bfff;color:#00bfff;padding:2px 6px;font-size:11px" onclick="quickCheckIn(\''+r.id+'\")>📥 一键入库</button> '+(r.cn||'-')+'</td>' +
      '<td>'+(r.supplier||'-')+'</td><td>'+(r.product||'-')+'</td><td>'+purchaseDate+'</td><td>'+(r.qty||0)+'</td>' +
      '<td>'+(r.demurrage||0)+'</td><td>'+(r.customs||0)+'</td><td>'+(r.coldFee||0)+'</td>' +
      '<td>'+(r.repack||0)+'</td><td>'+(r.waste||0)+'</td><td>'+(r.other||0)+'</td>' +
      '<td><strong style="color:#0066cc">'+total.toFixed(2)+'</strong></td>' +
      '<td><button type="button" class="abtn" onclick="openEditPurchase(\''+r.id+'\")>✏️</button><button type="button" class="abtn x" onclick="delPurchase(\''+r.id+'\")>🗑</button></td></tr>';
    
    // 展开行
    if (outRecs.length > 0) {
      html += '<tr id="pur-expand-'+r.id+'" style="display:none"><td colspan="13" style="padding:10px;background:#f5f5f5;border-bottom:2px solid #ddd">' +
        '<div style="font-size:11px;color:#666;margin-bottom:8px;font-weight:bold">📋 关联出库记录 ('+outRecs.length+' 次)</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px"><tr style="background:#e8f8e8">' +
        '<th style="padding:6px;border:1px solid #c8e8c8">#</th>' +
        '<th style="padding:6px;border:1px solid #c8e8c8">出库时间</th>' +
        '<th style="padding:6px;border:1px solid #c8e8c8">出库托盘</th>' +
        '<th style="padding:6px;border:1px solid #c8e8c8">出库件数</th>' +
        '<th style="padding:6px;border:1px solid #c8e8c8">剩余托盘</th>' +
        '<th style="padding:6px;border:1px solid #c8e8c8">原始托盘</th>' +
        '<th style="padding:6px;border:1px solid #c8e8c8">剩余件数</th>' +
        '<th style="padding:6px;border:1px solid #c8e8c8">原始件数</th></tr>';
      
      outRecs.forEach(function(or, idx) {
        var remP = inRec.pallets - (inRec.pallets_out||0);
        var remI = inRec.items - (inRec.items_out||0);
        html += '<tr style="background:#fff"><td style="padding:6px;border:1px solid #c8e8c8;text-align:center">'+(idx+1)+'</td>' +
          '<td style="padding:6px;border:1px solid #c8e8c8">'+fdt(or.dep)+'</td>' +
          '<td style="padding:6px;border:1px solid #c8e8c8;color:#cc0000;font-weight:bold">'+or.pallets_out+'</td>' +
          '<td style="padding:6px;border:1px solid #c8e8c8;color:#cc0000;font-weight:bold">'+or.items_out+'</td>' +
          '<td style="padding:6px;border:1px solid #c8e8c8;color:#ff9900;font-weight:bold">'+remP+'</td>' +
          '<td style="padding:6px;border:1px solid #c8e8c8">'+inRec.pallets+'</td>' +
          '<td style="padding:6px;border:1px solid #c8e8c8;color:#ff9900;font-weight:bold">'+remI+'</td>' +
          '<td style="padding:6px;border:1px solid #c8e8c8">'+inRec.items+'</td></tr>';
      });
      html += '</table></td></tr>';
    }
  });
  
  tb.innerHTML = html;
}

function togglePurchaseExpand(id) {
  var row = gid('pur-expand-' + id);
  if (row) {
    row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
  }
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
    return stored ? JSON.parse(stored) : { admin: 'admin123', user: 'user123' };
  } catch(e) { return { admin: 'admin123', user: 'user123' }; }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function addAccount() {
  var username = (gid('sett-user-input').value || '').trim();
  var password = (gid('sett-pass-input').value || '').trim();
  if (!username) { toast('请输入用户名', 'err'); return; }
  if (!password) { toast('请输入密码', 'err'); return; }
  
  var users = getUsers();
  if (users[username]) { toast('用户名已存在', 'err'); return; }
  
  users[username] = password;
  saveUsers(users);
  gid('sett-user-input').value = '';
  gid('sett-pass-input').value = '';
  renderAccountList();
  toast('✅ 账号已添加: ' + username, 'ok');
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

function quickCheckIn(purchaseId) {
  console.log('=== quickCheckIn START ===');
  console.log('purchaseId:', purchaseId);
  console.log('purchaseRecs length:', purchaseRecs.length);
  console.log('purchaseRecs:', JSON.stringify(purchaseRecs));
  
  if (!purchaseRecs || purchaseRecs.length === 0) {
    toast('采购数据未加载，请刷新页面重试', 'err');
    console.log('ERROR: purchaseRecs is empty');
    return;
  }
  
  var r = purchaseRecs.find(function(x) { return x.id === purchaseId; });
  console.log('Found record:', r);
  
  if (!r) {
    console.log('Record not found! Available IDs:', purchaseRecs.map(function(x) { return x.id; }));
    toast('未找到采购记录', 'err');
    return;
  }
  
  // 直接填入入库表单
  console.log('Filling form with:', r.cn, r.supplier, r.product);
  
  // 切换到库存记录 tab
  swTab('records');
  
  // 延迟填入，确保 DOM 已渲染
  setTimeout(function() {
    gid('f-cn').value = r.cn || '';
    gid('f-supplier').value = r.supplier || '';
    gid('f-product').value = r.product || '';
    gid('f-items').value = String(r.qty || 1);
    gid('f-pallets').value = '1';
    gid('f-at').value = nowFmt();
    
    console.log('Form filled successfully');
    toast('✅ 已填入: ' + r.cn + ' | ' + r.supplier + ' | ' + r.product, 'ok');
    
    // 滚动到入库表单
    document.querySelector('.left').scrollTop = 0;
  }, 100);
}

function clQuickInModal() {
  gid('quickInModal').classList.remove('sh');
  quickInData = null;
}

function doQuickIn(storeNum) {
  if (!quickInData) return;
  
  // 切换冷库
  selectColdStore(storeNum);
  
  // 切换到库存记录 tab
  swTab('records');
  
  // 自动填入入库表单
  gid('f-cn').value = quickInData.cn || '';
  gid('f-supplier').value = quickInData.supplier || '';
  gid('f-product').value = quickInData.product || '';
  gid('f-items').value = quickInData.qty || '1';
  gid('f-pallets').value = '1';
  
  // 设置入库日期为今天
  gid('f-at').value = nowFmt();
  
  clQuickInModal();
  toast('✅ 已填入入库信息，请确认后点击入库', 'ok');
  
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
  // 提取集装箱号（第一个竖线之前的部分）
  var cn = text.split('|')[0].trim();
  gid('f-cno').value = cn;
  hideSuggest('checkout-cn');
}
