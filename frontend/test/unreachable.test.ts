// unreachable.test.ts — цель, до которой оппонент дойти не может, и мерка
// экономики. Зеркало services/gateway/tests/test_unreachable_target.py:
// инвариант 8 требует, чтобы правка формулы жила в двух местах и считала
// одинаково, поэтому здесь проверяется РОВНО то же самое на офлайн-ядре.
//
// Замер, из которого всё выросло (tools/scenario_audit.py): у семи столов дно
// оппонента стоит ЗА целью игрока, у `conflict` (цель 5 при дне 6) и `investor`
// (цель 15 при дне 18) — не доходя. Там `economic` упирался в 86 и 67, и
// продукт об этом молчал.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, SCENARIO_MAP } from "../src/data/scenarios";
import { bestAvailable, newSession, scoreSession, targetReachable } from "../src/mock/engine";
import { formatDeal } from "../src/lib/format";
import type { Lang } from "../src/types";

// Столы НАЗВАНЫ, а не вычислены: вычисленный список молча опустеет, если кто-то
// поправит числа, и тест начнёт доказывать пустоту.
const BEYOND_REACH = ["conflict", "investor"];
const LANGS: Lang[] = ["ru", "en"];

/** Партия, доведённая до рукопожатия на заданной цифре, без ходов: проверяется
 *  мерка, а она чистая функция от цифры сделки и углов стола. */
function closed(id: string, deal: number, lang: Lang = "ru") {
  const s = newSession(SCENARIO_MAP[id], lang);
  s.status = "agreement";
  s.deal = deal;
  return s;
}

test("состав столов с недостижимой целью тот же, что на сервере", () => {
  const beyond = SCENARIOS.filter((sc) => !targetReachable(sc)).map((sc) => sc.id);
  assert.deepEqual(beyond, BEYOND_REACH);
});

test("где цель достижима — мерка ровно цель, число в число", () => {
  // Цена правки: не «почти не изменилось», а тождество со старой формулой
  // (deal − resv) / (target − resv) на любой цифре сделки.
  for (const sc of SCENARIOS) {
    if (BEYOND_REACH.includes(sc.id)) continue;
    assert.equal(bestAvailable(sc), sc.target, sc.id);
    const lo = Math.min(sc.resv, sc.floor), hi = Math.max(sc.resv, sc.floor);
    for (let i = 0; i <= 40; i++) {
      const deal = lo + ((hi - lo) * i) / 40;
      const want = Math.max(0, Math.min(100, Math.round(((deal - sc.resv) / (sc.target - sc.resv)) * 100)));
      assert.equal(scoreSession(closed(sc.id, deal)).economic, want, `${sc.id} @ ${deal}`);
    }
  }
});

test("где цель за дном — мерка дно, и прежняя давала меньше 100", () => {
  for (const id of BEYOND_REACH) {
    const sc = SCENARIO_MAP[id];
    assert.equal(bestAvailable(sc), sc.floor, id);
    const old = Math.round(((sc.floor - sc.resv) / (sc.target - sc.resv)) * 100);
    assert.ok(old < 100, `${id}: стол попал в список по ошибке (${old})`);
  }
});

test("выжал всё доступное — экономика 100 на девяти столах из девяти", () => {
  // Дно оппонента — предел по инварианту 1, дальше не бывает; значит экономика
  // там обязана быть полной, а не упираться в потолок стола.
  for (const sc of SCENARIOS) {
    assert.equal(scoreSession(closed(sc.id, sc.floor)).economic, 100, sc.id);
  }
});

test("разбор называет сменившуюся мерку — и только там, где она сменилась", () => {
  // Принцип 2. `tips[0]` разбор показывает словом наставника: игрок, увидевший
  // 100 при цифре хуже собственной цели, обязан прочитать почему.
  for (const sc of SCENARIOS) {
    for (const lang of LANGS) {
      const tips = scoreSession(closed(sc.id, sc.floor, lang)).tips;
      const marker = lang === "ru" ? "недостижимой цели" : "unreachable target";
      if (BEYOND_REACH.includes(sc.id)) {
        assert.ok(tips[0].includes(marker), `${sc.id}/${lang}: разбор молчит о мерке`);
        assert.ok(tips[0].includes(formatDeal(sc.floor, sc.unit[lang], lang)),
          `${sc.id}/${lang}: не названо, докуда можно было дойти`);
      } else {
        assert.ok(tips.every((t) => !t.includes(marker)),
          `${sc.id}/${lang}: сказано про недостижимую цель там, где она достижима`);
      }
    }
  }
});

test("бриф каждого стола называет цель и красную линию", () => {
  // Семь столов их называли, `conflict` и `investor` — нет, и именно там цель
  // была недостижима: человек не мог заподозрить, что упирается в стол, а не в
  // себя. Предупреждение об амбициозной цели стоит только там, где оно правда.
  for (const sc of SCENARIOS) {
    for (const lang of LANGS) {
      const nums = (sc.brief[lang].match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((n) => parseFloat(n.replace(",", ".")));
      assert.ok(nums.includes(sc.target), `${sc.id}/${lang}: бриф не называет цель`);
      assert.ok(nums.includes(sc.resv), `${sc.id}/${lang}: бриф не называет красную линию`);
      const corners = [sc.target, sc.resv, sc.open, sc.floor];
      for (const n of nums) assert.ok(corners.includes(n), `${sc.id}/${lang}: ${n} — не угол стола`);
      const warned = /амбициозна|ambitious/.test(sc.brief[lang]);
      assert.equal(warned, BEYOND_REACH.includes(sc.id), `${sc.id}/${lang}: предупреждение не по адресу`);
    }
  }
});
