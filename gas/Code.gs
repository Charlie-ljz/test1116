/**
 * 金禾 GRAIN & GOLD — 線上點餐後端（Google Apps Script）
 *
 * 功能
 *  - GET  ?action=menu  ：回傳「商品」工作表的菜單（上架、售完狀態皆由 Sheet 控制）
 *  - POST（JSON 文字）  ：接收結帳資料 → 伺服器端重新驗價 → 寫入「訂單」「明細」→ Email 通知店家與顧客
 *
 * 安裝：請看 gas/README.md。第一次請先在編輯器執行 setup()。
 */

const TZ = 'Asia/Taipei';
const SHEET = { PRODUCTS: '商品', ORDERS: '訂單', ITEMS: '明細', SETTINGS: '設定' };

const PRODUCT_HEADERS = ['id', '分類', '名稱', '說明', '價格', '單位', '標籤', '圖片網址', '上架', '售完', '排序'];
const ORDER_HEADERS = ['訂單編號', '建立時間', '狀態', '取餐方式', '門市', '姓名', '電話', 'Email', '宅配地址', '備註',
  '商品小計', '配送費', '應付總額', '付款方式', '付款狀態', '明細摘要', '通知結果', 'requestId'];
const ITEM_HEADERS = ['訂單編號', '商品ID', '商品名稱', '單價', '數量', '小計'];
const STATUSES = ['待處理', '製作中', '已完成', '已取餐', '已取消'];

const DEFAULT_SETTINGS = [
  ['店名', '金禾 GRAIN & GOLD', '用於 Email 寄件名稱與標題'],
  ['店家通知信箱', '', '新訂單會寄到這裡；多個信箱用逗號分隔。留空則不通知店家'],
  ['營業中', 'TRUE', 'FALSE 時網站暫停接單'],
  ['配送費', 120, '宅配運費（NT$）'],
  ['門市清單', '台北旗艦店,台北信義店', '取餐門市，用逗號分隔，需與網站選項一致'],
  ['訂單編號前綴', 'JH', '訂單編號格式：前綴 + 日期 + 流水號']
];

const SEED_PRODUCTS = [
    ["p1", "potsticker", "經典鮮肉鍋貼", "台灣豬肉搭配鮮甜高麗菜，底部金黃酥脆。", 75, "10 顆", "人氣 NO.1", "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80", true, false, 10],
    ["p2", "potsticker", "韓式泡菜鍋貼", "微酸微辣的泡菜風味，香氣層次豐富。", 85, "10 顆", "微辣", "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=800&q=80", true, false, 20],
    ["p3", "potsticker", "韭香鮮肉鍋貼", "韭菜清香與鮮肉交織，經典不敗。", 80, "10 顆", "經典", "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80", true, false, 30],
    ["p4", "potsticker", "玉米鮮肉鍋貼", "甜玉米搭配鮮嫩肉餡，大人小孩都喜歡。", 85, "10 顆", "清甜", "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=800&q=80", true, false, 40],
    ["d1", "dumpling", "高麗菜鮮肉水餃", "薄皮包裹飽滿內餡，清甜多汁。", 75, "10 顆", "人氣", "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=800&q=80", true, false, 50],
    ["d2", "dumpling", "韭菜鮮肉水餃", "韭香濃郁，口感紮實有層次。", 80, "10 顆", "經典", "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80", true, false, 60],
    ["d3", "dumpling", "鮮蝦豬肉水餃", "鮮蝦與豬肉結合，口感鮮甜。", 120, "10 顆", "精選", "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=800&q=80", true, false, 70],
    ["d4", "dumpling", "玉米鮮肉水餃", "清甜玉米粒與鮮肉的柔和組合。", 85, "10 顆", "清甜", "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80", true, false, 80],
    ["s1", "soup", "酸辣湯", "酸香微辣，搭配鍋貼的經典選擇。", 45, "1 碗", "微辣", "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80", true, false, 90],
    ["s2", "soup", "玉米濃湯", "香甜濃郁，口感滑順溫暖。", 45, "1 碗", "暖心", "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80", true, false, 100],
    ["s3", "soup", "古早味紅茶", "清爽茶香，甜度適中。", 30, "1 杯", "飲品", "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=800&q=80", true, false, 110],
    ["s4", "soup", "無糖青茶", "清新茶韻，解膩順口。", 35, "1 杯", "無糖", "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=800&q=80", true, false, 120],
    ["a1", "side", "黃金泡菜", "酸甜爽脆，帶出清爽好滋味。", 45, "1 份", "人氣", "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80", true, false, 130],
    ["a2", "side", "涼拌小黃瓜", "蒜香清爽，冰涼開胃。", 40, "1 份", "清爽", "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80", true, false, 140],
    ["a3", "side", "滷香豆干", "滷汁入味，鹹香適口。", 40, "1 份", "經典", "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80", true, false, 150],
    ["a4", "side", "香滷海帶", "清爽柔韌，帶有淡淡滷香。", 35, "1 份", "小菜", "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80", true, false, 160],
    ["gift50", "gift", "招牌招財鍋貼禮盒", "冷凍鍋貼家庭分享組，50 顆裝。", 499, "50 顆", "冷凍禮盒", "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80", true, false, 170]
];

/* =========================================================
 * 第一次安裝：建立工作表、欄位、下拉選單與預設菜單
 * ========================================================= */
function setup() {
  const ss = SpreadsheetApp.getActive();

  const products = getOrCreate_(ss, SHEET.PRODUCTS, PRODUCT_HEADERS);
  if (products.getLastRow() < 2) {
    products.getRange(2, 1, SEED_PRODUCTS.length, PRODUCT_HEADERS.length).setValues(SEED_PRODUCTS);
  }
  products.getRange('I2:J').insertCheckboxes();
  products.setColumnWidth(3, 160); products.setColumnWidth(4, 280); products.setColumnWidth(8, 220);

  const orders = getOrCreate_(ss, SHEET.ORDERS, ORDER_HEADERS);
  orders.getRange('G:G').setNumberFormat('@');                       // 電話保留開頭 0
  orders.getRange('C2:C').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  orders.getRange('O2:O').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['未付款', '已付款', '已退款'], true).build());
  orders.setColumnWidth(16, 320);

  getOrCreate_(ss, SHEET.ITEMS, ITEM_HEADERS);

  const settings = getOrCreate_(ss, SHEET.SETTINGS, ['項目', '值', '說明']);
  if (settings.getLastRow() < 2) {
    settings.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
  }
  settings.setColumnWidth(2, 260); settings.setColumnWidth(3, 380);

  const first = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);

  // 編輯 Sheet 時自動清除菜單快取
  const hasTrigger = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'onSheetEdit_');
  if (!hasTrigger) ScriptApp.newTrigger('onSheetEdit_').forSpreadsheet(ss).onEdit().create();

  safeToast_(ss, '安裝完成！請到「設定」工作表填入店家通知信箱，再部署成網頁應用程式。');
}

function getOrCreate_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#38291f').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}
function safeToast_(ss, msg) { try { ss.toast(msg, '金禾點餐', 8); } catch (e) {} }
function onSheetEdit_() { CacheService.getScriptCache().remove('menu'); }

/* =========================================================
 * Web App 入口
 * ========================================================= */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'menu';
  try {
    if (action === 'menu') return json_({ ok: true, menu: getMenu_(), settings: publicSettings_() });
    if (action === 'ping') return json_({ ok: true, time: new Date().toISOString() });
    return json_({ ok: false, error: 'UNKNOWN_ACTION' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'SERVER_ERROR' });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return json_(handleOrder_(payload));
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'SERVER_ERROR', message: '系統忙碌中，請稍後再試。' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
 * 讀取資料
 * ========================================================= */
function readTable_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues();
  const head = values.shift();
  return values.map(r => { const o = {}; head.forEach((h, i) => o[h] = r[i]); return o; });
}

function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

function getSettings_() {
  const map = {};
  readTable_(SHEET.SETTINGS).forEach(r => { map[r['項目']] = r['值']; });
  return {
    storeName: String(map['店名'] || '金禾 GRAIN & GOLD'),
    storeEmail: String(map['店家通知信箱'] || '').trim(),
    open: map['營業中'] === '' || map['營業中'] === undefined ? true : isTrue_(map['營業中']),
    deliveryFee: Number(map['配送費']) || 0,
    stores: String(map['門市清單'] || '').split(',').map(s => s.trim()).filter(Boolean),
    prefix: String(map['訂單編號前綴'] || 'JH')
  };
}

function publicSettings_() {
  const s = getSettings_();
  return { open: s.open, deliveryFee: s.deliveryFee, stores: s.stores };
}

function getMenu_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('menu');
  if (hit) return JSON.parse(hit);
  const menu = readTable_(SHEET.PRODUCTS)
    .filter(r => r['id'] && isTrue_(r['上架']))
    .sort((a, b) => (Number(a['排序']) || 0) - (Number(b['排序']) || 0))
    .map(r => ({
      id: String(r['id']), category: String(r['分類']), name: String(r['名稱']), desc: String(r['說明']),
      price: Number(r['價格']) || 0, unit: String(r['單位']), tag: String(r['標籤']),
      image: String(r['圖片網址']), soldOut: isTrue_(r['售完'])
    }));
  try { cache.put('menu', JSON.stringify(menu), 60); } catch (e) {}
  return menu;
}

/* =========================================================
 * 訂單處理
 * ========================================================= */

/** 取餐方式規則（與網站一致）：禮盒＋現做 → 僅外帶；僅禮盒 → 外帶／宅配；僅現做 → 內用／外帶 */
function allowedFulfillments_(items) {
  const hasGift = items.some(i => i.category === 'gift');
  const hasFresh = items.some(i => i.category !== 'gift');
  if (hasGift && hasFresh) return ['takeaway'];
  if (hasGift) return ['takeaway', 'delivery'];
  return ['dinein', 'takeaway'];
}

const FULFILLMENT_LABEL = { dinein: '內用', takeaway: '外帶', delivery: '宅配' };

/** 純函式：驗證輸入並依 Sheet 價格重算。回傳 {ok, order} 或 {ok:false, error, message} */
function validateOrder_(p, menu, settings) {
  const fail = (error, message, extra) => Object.assign({ ok: false, error: error, message: message }, extra || {});

  if (!settings.open) return fail('CLOSED', '目前暫停接單，請稍後再試。');
  if (p.website) return fail('REJECTED', '送出失敗。');                       // honeypot

  const name = String(p.name || '').trim();
  const phone = String(p.phone || '').trim();
  const email = String(p.email || '').trim();
  const address = String(p.address || '').trim();
  const note = String(p.note || '').trim();
  const store = String(p.store || '').trim();
  const fulfillment = String(p.fulfillment || '');

  if (!name || name.length > 50) return fail('INVALID', '請輸入正確的姓名。');
  if (!/^[0-9+\-() ]{8,20}$/.test(phone)) return fail('INVALID', '請輸入正確的聯絡電話。');
  if (email && (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return fail('INVALID', '電子郵件格式不正確。');
  if (note.length > 200) return fail('INVALID', '備註過長。');
  if (!Array.isArray(p.items) || p.items.length === 0 || p.items.length > 30) return fail('INVALID', '購物車內容不正確。');

  const byId = {}; menu.forEach(m => byId[m.id] = m);
  const seen = {}, lines = [];
  for (const it of p.items) {
    const id = String(it.id || ''), qty = Math.floor(Number(it.qty));
    const m = byId[id];
    if (!m) return fail('ITEM_UNAVAILABLE', '部分商品已下架，請重新整理頁面後再下單。', { menuChanged: true });
    if (m.soldOut) return fail('ITEM_UNAVAILABLE', '「' + m.name + '」目前已售完。', { menuChanged: true });
    if (!(qty >= 1 && qty <= 99) || seen[id]) return fail('INVALID', '商品數量不正確。');
    seen[id] = true;
    lines.push({ id: id, category: m.category, name: m.name, price: m.price, qty: qty, subtotal: m.price * qty });
  }

  if (!allowedFulfillments_(lines).includes(fulfillment)) return fail('INVALID', '所選取餐方式不適用於此購物車內容。');
  if (fulfillment === 'delivery') {
    if (!address || address.length > 200) return fail('INVALID', '請輸入完整宅配地址。');
  } else if (!settings.stores.includes(store)) {
    return fail('INVALID', '請選擇取餐門市。');
  }

  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const deliveryFee = fulfillment === 'delivery' ? settings.deliveryFee : 0;
  const total = subtotal + deliveryFee;

  if (p.clientTotal !== undefined && Number(p.clientTotal) !== total) {
    return fail('PRICE_CHANGED', '商品價格已更新，請確認最新金額後重新送出。', { total: total, menuChanged: true });
  }

  return {
    ok: true,
    order: {
      name: name, phone: phone, email: email, address: fulfillment === 'delivery' ? address : '',
      note: note, store: fulfillment === 'delivery' ? '' : store, fulfillment: fulfillment,
      lines: lines, subtotal: subtotal, deliveryFee: deliveryFee, total: total,
      payment: fulfillment === 'delivery' ? '貨到付款' : '到店付款'
    }
  };
}

function handleOrder_(payload) {
  const cache = CacheService.getScriptCache();
  const requestId = String(payload.requestId || '').slice(0, 64);

  // 重複送出（雙擊、網路重試）：回傳先前結果
  if (requestId) {
    const prev = cache.get('req_' + requestId);
    if (prev) return JSON.parse(prev);
  }

  const settings = getSettings_();
  const checked = validateOrder_(payload, getMenu_(), settings);
  if (!checked.ok) return checked;
  const o = checked.order;

  // 簡易防濫用：同一支電話 10 分鐘內最多 5 筆
  const rateKey = 'rate_' + o.phone.replace(/\D/g, '');
  const count = Number(cache.get(rateKey) || 0);
  if (count >= 5) return { ok: false, error: 'RATE_LIMIT', message: '送出次數過多，請稍後再試或來電訂購。' };
  cache.put(rateKey, String(count + 1), 600);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let orderNumber;
  try {
    orderNumber = nextOrderNumber_(settings.prefix);
    const ss = SpreadsheetApp.getActive();
    const summary = o.lines.map(l => l.name + ' × ' + l.qty).join('、');
    const orderRow = [
      orderNumber, new Date(), '待處理', FULFILLMENT_LABEL[o.fulfillment], clean_(o.store), clean_(o.name), o.phone,
      clean_(o.email), clean_(o.address), clean_(o.note), o.subtotal, o.deliveryFee, o.total, o.payment, '未付款',
      summary, '', requestId
    ];
    const orders = ss.getSheetByName(SHEET.ORDERS);
    orders.appendRow(orderRow);
    const orderRowIndex = orders.getLastRow();
    orders.getRange(orderRowIndex, 2).setNumberFormat('yyyy-mm-dd hh:mm:ss');

    const items = ss.getSheetByName(SHEET.ITEMS);
    const rows = o.lines.map(l => [orderNumber, l.id, clean_(l.name), l.price, l.qty, l.subtotal]);
    items.getRange(items.getLastRow() + 1, 1, rows.length, ITEM_HEADERS.length).setValues(rows);
    SpreadsheetApp.flush();

    // 寄信（失敗不影響訂單）
    const mailResult = sendEmails_(orderNumber, o, settings);
    orders.getRange(orderRowIndex, ORDER_HEADERS.indexOf('通知結果') + 1).setValue(mailResult);
  } finally {
    lock.releaseLock();
  }

  const result = { ok: true, orderNumber: orderNumber, total: o.total, payment: o.payment, emailed: !!o.email };
  if (requestId) cache.put('req_' + requestId, JSON.stringify(result), 21600);
  return result;
}

function nextOrderNumber_(prefix) {
  const props = PropertiesService.getScriptProperties();
  const day = Utilities.formatDate(new Date(), TZ, 'yyMMdd');
  const key = 'seq_' + day;
  const n = (Number(props.getProperty(key)) || 0) + 1;
  props.setProperty(key, String(n));
  // 清掉舊日期的計數器
  Object.keys(props.getProperties()).forEach(k => { if (k.indexOf('seq_') === 0 && k !== key) props.deleteProperty(k); });
  return prefix + day + '-' + ('000' + n).slice(-3);
}

/** 避免試算表公式注入：以 = + - @ 開頭的文字前面加上單引號 */
function clean_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/* =========================================================
 * Email 通知
 * ========================================================= */
function esc_(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function orderHtml_(no, o, intro) {
  const rows = o.lines.map(l =>
    '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc_(l.name) + '</td>' +
    '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">' + l.qty + '</td>' +
    '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">NT$ ' + l.subtotal + '</td></tr>').join('');
  const where = o.fulfillment === 'delivery' ? '宅配地址：' + esc_(o.address) : '取餐門市：' + esc_(o.store);
  return '<div style="font-family:sans-serif;color:#38291f;max-width:520px">' +
    '<p>' + intro + '</p>' +
    '<p><b>訂單編號：' + esc_(no) + '</b></p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:14px">' +
    '<tr style="background:#f6efe5"><th style="padding:6px 10px;text-align:left">品項</th><th>數量</th><th style="text-align:right;padding:6px 10px">小計</th></tr>' +
    rows + '</table>' +
    '<p style="margin:10px 0 0">商品小計：NT$ ' + o.subtotal + '　配送費：NT$ ' + o.deliveryFee + '</p>' +
    '<p style="font-size:18px;margin:4px 0"><b>應付總額：NT$ ' + o.total + '</b>（' + esc_(o.payment) + '）</p>' +
    '<p>取餐方式：' + FULFILLMENT_LABEL[o.fulfillment] + '<br>' + where + '</p>' +
    '<p>聯絡人：' + esc_(o.name) + '　電話：' + esc_(o.phone) + '<br>備註：' + esc_(o.note || '無') + '</p></div>';
}

function sendEmails_(no, o, s) {
  const out = [];
  try {
    if (s.storeEmail) {
      MailApp.sendEmail({
        to: s.storeEmail, name: s.storeName, subject: '【新訂單】' + no + '｜NT$ ' + o.total + '｜' + FULFILLMENT_LABEL[o.fulfillment],
        htmlBody: orderHtml_(no, o, '收到一筆新的線上訂單：')
      });
      out.push('店家✓');
    }
  } catch (e) { out.push('店家✗ ' + e.message); }
  try {
    if (o.email) {
      MailApp.sendEmail({
        to: o.email, name: s.storeName, subject: '【' + s.storeName + '】訂單確認 ' + no,
        htmlBody: orderHtml_(no, o, esc_(o.name) + ' 您好，感謝您的訂購！我們已收到您的訂單，內容如下：')
      });
      out.push('顧客✓');
    }
  } catch (e) { out.push('顧客✗ ' + e.message); }
  return out.join(' / ') || '未寄送';
}

/* =========================================================
 * 測試用：在編輯器直接執行，會寫入一筆測試訂單
 * ========================================================= */
function testOrder() {
  const menu = getMenu_();
  const res = handleOrder_({
    requestId: 'test-' + Date.now(), items: [{ id: menu[0].id, qty: 2 }], fulfillment: 'takeaway',
    store: getSettings_().stores[0], name: '測試顧客', phone: '0912345678', email: '', note: '測試單',
    clientTotal: menu[0].price * 2
  });
  console.log(JSON.stringify(res));
}
