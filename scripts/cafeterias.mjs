// 阪大豊中キャンパスの対象食堂。west2-univ.jp の t= パラメータでメニューを区別する。
// 営業時間・定休日は https://www.osaka-univ.coop/food/food_351.html の公開情報を元にした雛形。
// 営業形態が変わった場合は本ファイルを更新する。

export const CAFETERIAS = [
  {
    id: '663252',
    slug: 'toyonaka-library',
    name: '豊中図書館下食堂',
    fullName: '大阪大学生協豊中図書館下食堂',
    campus: '豊中',
    hours: '平日 11:00-19:30 / 土 11:00-13:30',
    holidays: '日祝',
  },
  {
    id: '663258',
    slug: 'kasane',
    name: 'カフェテリアかさね',
    fullName: '大阪大学生協カフェテリアかさね',
    campus: '豊中',
    hours: '平日 11:00-19:30',
    holidays: '土日祝',
  },
  {
    id: '663253',
    slug: 'welfare-3f',
    name: '福利会館3階食堂',
    fullName: '大阪大学生協福利会館3階食堂',
    campus: '豊中',
    hours: '平日 11:00-14:00 / 17:00-19:30',
    holidays: '土日祝',
  },
];

export function sourceUrl(id) {
  return `https://west2-univ.jp/sp/menu.php?t=${id}`;
}
