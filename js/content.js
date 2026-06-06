/*
 * 横断学習コンテンツ(学習用サンプル)
 * ----------------------------------------------------------------------------
 * ⚠️ 注意: これは学習アプリの動作確認用サンプルです。
 *   法令は毎年改正されます。実際の受験対策では必ず最新の条文・通達で
 *   裏取りをしてください(特に時効・金額・年齢要件は改正が多い分野です)。
 *
 * データ構造を理解すれば、自分で横断テーマやカードを追加できます。
 *   - topic.table : 科目をまたぐ比較表(横断学習の核)
 *   - topic.cards : アクティブリコール用の一問一答
 * ----------------------------------------------------------------------------
 */

const SUBJECTS = {
  kijun:  { id: 'kijun',  short: '労基', name: '労働基準法',       color: '#e11d48' },
  anei:   { id: 'anei',   short: '安衛', name: '労働安全衛生法',   color: '#f97316' },
  rosai:  { id: 'rosai',  short: '労災', name: '労災保険法',       color: '#eab308' },
  koyo:   { id: 'koyo',   short: '雇用', name: '雇用保険法',       color: '#22c55e' },
  choshu: { id: 'choshu', short: '徴収', name: '徴収法',           color: '#14b8a6' },
  kenpo:  { id: 'kenpo',  short: '健保', name: '健康保険法',       color: '#3b82f6' },
  konen:  { id: 'konen',  short: '厚年', name: '厚生年金保険法',   color: '#6366f1' },
  kokunen:{ id: 'kokunen',short: '国年', name: '国民年金法',       color: '#a855f7' },
  roippan:{ id: 'roippan',short: '労一', name: '労務管理その他',   color: '#64748b' },
  shaippan:{id: 'shaippan',short:'社一', name: '社会保険に関する一般常識', color: '#94a3b8' },
};

// 横断テーマ(再構築中)。新規は必ずTAC『横断学習.pdf』か公的サイトで裏取り。
const CROSS_TOPICS = [];

// 記憶の宮殿(場所法)も一旦空に。
const PALACE = [];

// グローバルに公開(file:// でも動くようES modulesは使わない)
window.SHARO = { SUBJECTS, CROSS_TOPICS, PALACE };
