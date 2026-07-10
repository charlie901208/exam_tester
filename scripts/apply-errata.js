// 套用使用者「刊誤.docx」(2026-07-10)：29筆答案更正 + 補入113年9題、112年8題
// 只 UPDATE 指定題的答案欄位、INSERT 新題；絕不刪除任何資料
const db = require('../db');
const today = new Date().toISOString().slice(0, 10);
const SRC = '使用者提供（刊誤.docx 補充/更正）';

// ── 答案更正：seq(113年題庫) → 正解字母 ──
const corrections = {
  3: 'C', 18: 'A', 20: 'A', 21: 'C', 23: 'C', 39: 'C', 49: 'B', 87: 'D', 155: 'A',
  246: 'B', 296: 'A', 300: 'D', 477: 'A', 531: 'C', 589: 'D', 651: 'C', 677: 'D',
  683: 'A', 799: 'C', 921: 'D', 1033: 'C', 1169: 'D', 1220: 'D', 1297: 'B',
  1398: 'A', 1422: 'B', 1429: 'D', 1441: 'A', 1446: 'B',
  // 刊誤下半部「缺少題目」中已存在於DB者，一併核對答案
  156: 'A', 753: 'C', 1170: 'D',
};

const upd = db.prepare(`UPDATE questions SET answer=?, ans_confidence=1, needs_review=0
  WHERE seq=? AND bank_years LIKE '%113%'`);
let changed = 0, same = 0;
for (const [seq, ans] of Object.entries(corrections)) {
  const q = db.prepare("SELECT answer FROM questions WHERE seq=? AND bank_years LIKE '%113%'").get(seq);
  const idx = 'ABCD'.indexOf(ans);
  if (q.answer === idx) same++; else changed++;
  upd.run(idx, seq);
}
console.log(`答案更正：${changed} 題改變、${same} 題原本已相同（均設為已確認）`);

// ── 補入缺漏題 ──
const add = [
  // [bank, seq, stem, [opts], ans]
  [113, 124, '依危害性化學品標示及通識規則之規定,下列何者非屬危害性化學品應標示之內容?', ['危害成分', '警示語', '用途說明', '危害警告訊息'], 'C'],
  [113, 268, '固定梯子梯長連續超過 6 公尺時,應於距梯底 2 公尺以上部分設下列何者?', ['護圍', '護籠', '斜籠', '支撐'], 'B'],
  [113, 281, '依職業安全衛生設施規則規定,雇主對於堆高機之操作,不得超過該機械所能承受之最大荷重,且其載運之貨物應保持穩固狀態,防止下列何種災害?', ['感電', '火災', '翻倒', '缺氧'], 'C'],
  [113, 354, '依營造安全衛生設施標準 17 條規定,有關墜落災害防止事項之敘述中,下列採取之先後優先順序,何者為正確? a.張掛安全網 b.限制作業人員進入管制區 c.設置護欄、護蓋 d.經由設計或工法之選擇,儘量使勞工於地面完成作業,減少高處作業項目 e.設置警示線系統 f.經由施工程序之變更,優先施作永久構造物之上下設備或防墜設施 g.使勞工佩掛安全帶', ['d.f.c.a.g.e.b', 'c.d.e.f.g.a.b', 'd.e.f.c.a.b.g', 'a.b.d.c.e.f.g'], 'A'],
  [113, 383, '依營造安全衛生設施標準 21 條規定,有關下列護蓋之敘述,何者正確?a.應具有能使人員及車輛安全通過之強度 b.應以有效方法防止滑溜、掉落、掀出或移動 c.供車輛通行者,得以車輛後軸載重之2倍設計之,並不得妨礙車輛之正常通行 d.為柵狀構造者,柵條間隔不得大於 3 公分 e.上面不得放置機動設備或超過其設計強度之重物 f.臨時性開口處使用之護蓋,表面漆以綠色,並書以警告訊息', ['a.b.c.d.f.', 'b.c.d.e.f.', 'a.b.d.e.f.', 'a.b.c.d.e'], 'D'],
  [113, 450, '作用於施工架之載重(積載荷重)包括垂直荷重與水平荷重,其中下列何種荷重不屬於垂直荷重?', ['施工架自重', '擬置放之物料等重量', '風力', '作業人員'], 'C'],
  [113, 483, '露天開挖作業防止崩塌災害,以下作業方式何者為非?', ['開挖垂直深度超過1.5 公尺應設置擋土支撐', '露天開挖作業主管應到場指揮監督', '應注意接臨道路震動與排水', '趕工需要,無需設置擋土支撐'], 'D'],
  [113, 974, '何種作業較少發生人體墜落災害?', ['利用高架作業', '作業時配戴安全帶', '利用合梯作業', '地面作業'], 'D'],
  [113, 1440, '失能傷害頻率(FR)數值之表示方式，取小數點第幾位數？', ['0', '2', '1', '無規定'], 'B'],
  [112, 3, '墜落防止方法？', ['開口設置護欄', '開口掛安全網', '使用安全母索及安全帶', '以上皆是'], 'D'],
  [112, 4, '護欄的上欄杆高度應在幾公分以上？', ['75', '85', '90', '100 公分'], 'C'],
  [112, 7, '發生職業災害大都是因為？', ['天意', '人為', '別人', '陷阱'], 'B'],
  [112, 11, '下列何者為危險性機械設備？', ['堆高機', '剪床', '工地用升降機', '怪手'], 'C'],
  [112, 12, '從事水箱作業時，要有何主管監督才可作業？', ['有機溶劑作業', '鉛作業', '粉塵作業', '缺氧作業'], 'D'],
  [112, 13, '開挖垂直深度多少公尺以上時要在露天開挖作業主管監督下？', ['1', '1.5', '2', '2.5'], 'B'],
  [112, 14, '堆放磚、瓦、木塊或同類材料應距離開口部分多少公尺以上?', ['1', '1.5', '2', '2.5'], 'C'],
  [112, 15, '在高壓電線旁架設施工架應如何處理？', ['先移設高壓電線', '不理高壓電線', '摸摸看', '以上皆是'], 'A'],
];

const ins = db.prepare(`INSERT INTO questions(seq, stem, options, answer, ans_confidence, needs_review, source_name, source_url, bank_years, fetched_at)
  VALUES(?,?,?,?,1,0,?,'',?,?)`);
let added = 0, skipped = 0;
for (const [bank, seq, stem, opts, ans] of add) {
  const exists = db.prepare("SELECT 1 FROM questions WHERE seq=? AND bank_years LIKE '%'||?||'%'").get(seq, bank);
  if (exists) { skipped++; console.log(`略過(已存在): ${bank}年#${seq}`); continue; }
  ins.run(seq, stem, JSON.stringify(opts), 'ABCD'.indexOf(ans), SRC, String(bank), today);
  added++;
}
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
console.log(`補入 ${added} 題、略過 ${skipped} 題`);
console.log('題庫總數:', db.prepare('SELECT COUNT(*) c FROM questions').get().c);
