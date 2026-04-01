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

// 冷库费率：
// 冷库1: 38 AED/托盘/周 + 5% VAT
// 冷库2/3/4: 60 AED/托盘/周 + 5% VAT
const VAT_RATE = 0.05;
const DAYS_PER_WEEK = 7;

// 根据冷库获取费率
function getRateByStore(store) {
  switch(store) {
    case 1: return 38;
    case 2: 
    case 3: 
    case 4: return 60;
    default: return 38;
  }
}

// ============================================================
// STATE
// ============================================================
var recs = [];
var currentColdStore = 1;
var currentUser = null; // 当前登录用户
var isAdmin = false; // 是否是管理员

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
    
    // 默认设置管理员权限（可根据需要修改为登录验证）
    currentUser = 'admin';
    isAdmin = true;
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
    
    var status = r.dep ? '<span class="bdg bdg-d">已出库</span>' : '<span class="bdg bdg-a">在库</span>';
    
    // 管理员才显示修改按钮
    var editBtn = isAdmin ? '<button class="abtn" onclick="showEditRecord(\'' + r.id + '\')" style="margin-left:4px">✏️</button>' : '';
    
    // 费用显示：已出库显示实际费用，在库显示预估费用
    var feeDisplay = actualFee > 0 ? 
      '<strong style="color:#0066cc">' + actualFee.toFixed(2) + ' AED</strong>' : 
      '<span style="color:#999">-</span>';
    
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
  // 按集装箱号分组出库记录
  var cnGroups = {};
  recs.filter(function(r) { return r.type === 'checkout'; }).forEach(function(r) {
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

  // 添加没有出库记录的入库集装箱（显示第一周）
  // 不限制冷库，显示所有入库记录
  var allInRecs = recs.filter(function(r) { return !r.type; });
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
  // 获取搜索后的数据
  var data = [];
  var cnGroups = {};
  
  recs.filter(function(r) { return r.type === 'checkout'; }).forEach(function(r) {
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
  
  // 添加没有出库记录的入库集装箱
  var allInRecs = recs.filter(function(r) { return !r.type; });
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
    
    // 主行
    html += '<tr id="pur-tr-'+r.id+'">' +
      '<td><button type="button" class="abtn" style="background:#e8f4ff;border-color:#00bfff;color:#00bfff;padding:2px 6px;font-size:11px" onclick="quickCheckIn(\''+r.id+'\')">📥 一键入库</button> '+(r.cn||'-')+'</td>' +
      '<td style="font-family:Arial;text-transform:capitalize">'+(r.supplier||'-')+'</td><td style="font-family:Arial;text-transform:capitalize">'+(r.product||'-')+'</td><td>'+purchaseDate+'</td><td>'+(r.qty||0)+'</td>' +
      '<td>'+(r.demurrage||0)+'</td><td>'+(r.customs||0)+'</td><td>'+(r.coldFee||0)+'</td>' +
      '<td>'+(r.repack||0)+'</td><td>'+(r.waste||0)+'</td><td>'+(r.other||0)+'</td>' +
      '<td><strong style="color:#0066cc">'+total.toFixed(2)+'</strong></td>' +
      '<td><button type="button" class="abtn" onclick="openEditPurchase(\''+r.id+'\')">✏️ 修改</button><button type="button" class="abtn x" onclick="delPurchase(\''+r.id+'\')">🗑 删除</button></td></tr>';
  });
  
  tb.innerHTML = html;
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

  // 保存采购记录数据
  quickInData = r;

  // 显示冷库选择弹窗
  gid('quickInInfo').textContent = '📦 ' + r.cn + ' | ' + r.supplier + ' | ' + r.product;
  gid('quickInModal').classList.add('sh');
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
