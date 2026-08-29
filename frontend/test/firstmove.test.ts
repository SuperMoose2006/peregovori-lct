// firstmove.test.ts — ГАРАНТИРОВАННАЯ первая подсказка за столом.
//
// Подсветок на столе было две, и обе ждали УДАЧИ игрока: «вы вскрыли интерес»
// (вопрос попал в тему) и «их цена поехала» (ход заработал движение). Прогон в
// браузере за новичка, который жмёт наугад — «ок», «да», «сколько?», — дал ноль
// подсветок за шесть ходов: ни один интерес не открылся, цена все шесть ходов
// стояла на стартовых 100 ₽/шт. Вводная, которая показывается только тем, кто и
// так справился, не вводная.
//
// Третий шаг привязан к событию, которое случается ВСЕГДА: первый ход сделан.
// Здесь проверяется его текст — потому что подсказка «спросите про X» стоит
// ровно столько, сколько стоит X: тема обязана быть с ЭТОГО стола и обязана
// реально вскрывать интерес в офлайн-ядре (инвариант 9 в миниатюре).
import test from "node:test";
import assert from "node:assert/strict";
import { firstMoveBody } from "../src/components/Table";
import { logAnchor } from "../src/components/Chat";
import { I18N } from "../src/i18n";
import { SCENARIOS } from "../src/data/scenarios";
import { analyze, applyMove, newSession, stateView } from "../src/mock/engine";
import type { Lang } from "../src/types";

const LANGS: Lang[] = ["ru", "en"];

test("подсказка первого хода называет и прибавку, и тему — на обоих языках", () => {
  for (const lang of LANGS) {
    const o = I18N[lang].onboarding;
    const withGain = firstMoveBody(o, 5, "Производство");
    assert.ok(withGain.includes("5"), `${lang}: число прибавки потерялось`);
    assert.ok(withGain.includes("Производство"), `${lang}: тема потерялась`);
    // Незакрытый плейсхолдер — это «{topic}» на экране жюри.
    assert.ok(!/\{[a-z]+\}/i.test(withGain), `${lang}: остался плейсхолдер: ${withGain}`);

    // Ноль прибавки — другая первая фраза, но тема на месте и там.
    const noGain = firstMoveBody(o, 0, "Оплата");
    assert.ok(!/\{[a-z]+\}/i.test(noGain), `${lang}: остался плейсхолдер: ${noGain}`);
    assert.ok(noGain.includes("Оплата"), `${lang}: тема потерялась при нулевой прибавке`);
    assert.notEqual(noGain.slice(0, 12), withGain.slice(0, 12),
      `${lang}: «ничего не сдвинулось» и «+5» не должны читаться одинаково`);
    // Дробную прибавку показываем целым числом: «+4.7» шкала не рисует.
    assert.equal(firstMoveBody(o, 4.7, "Оплата"), firstMoveBody(o, 5, "Оплата"));
  }
});

test("тема, которую называет подсказка, действительно вскрывает интерес", () => {
  // Подсказка берёт ПЕРВЫЙ невскрытый слот с рельса. Проверяем именно его: если
  // движок отдаёт слоты в одном порядке, а темы вскрываются в другом, новичок
  // спросит ровно то, что ему велели, и не получит ничего.
  for (const sc of SCENARIOS) {
    for (const lang of LANGS) {
      const s = newSession(sc, lang);
      const slots = stateView(s).interests;
      assert.ok(slots.length > 0, `${sc.id}/${lang}: слотов интересов нет`);
      const topic = slots.find((slot) => !slot.text)?.topic ?? "";
      assert.ok(topic, `${sc.id}/${lang}: подсказке нечего назвать`);
      const body = firstMoveBody(I18N[lang].onboarding, 0, topic);
      assert.ok(body.includes(topic), `${sc.id}/${lang}: тема не попала в текст`);

      const line = lang === "ru" ? `Что для вас важно в ${topic}?` : `What matters to you in ${topic}?`;
      s.turn += 1;
      applyMove(s, analyze(line), line);
      assert.ok(s.interests.length > 0,
        `${sc.id}/${lang}: подсказка велела спросить про «${topic}», а интерес не открылся`);
    }
  }
});

test("«шкалы не сдвинулись» — не пустая строка и не совпадает с ярлыком шкалы", () => {
  for (const lang of LANGS) {
    const t = I18N[lang];
    assert.ok(t.deltaNone.trim().length > 3, `${lang}: подпись нулевого хода слишком короткая`);
    for (const v of Object.values(t.metersShort)) {
      assert.notEqual(t.deltaNone, v, `${lang}: подпись нулевого хода спутана с ярлыком шкалы`);
    }
  }
});

test("лента отпускает верх, как только игрок сходил", () => {
  // Карточка «Стол накрыт» держит верх ленты, пока догонять нечего.
  assert.equal(logAnchor(true, false), "top");
  // Но она живёт до конца первого хода — а реплика игрока и пузырь ожидания
  // приходят В СЕРЕДИНЕ. Держать верх здесь значит спрятать оба.
  assert.equal(logAnchor(true, true), "bottom");
  assert.equal(logAnchor(false, false), "bottom");
  assert.equal(logAnchor(false, true), "bottom");
});

test("подпись повтора и подпись нулевого хода говорят разное", () => {
  // Две соседние подписи в одной строке дельт. Совпади они по смыслу — вместо
  // причины («вы это уже говорили») человек прочитал бы следствие дважды.
  for (const lang of ["ru", "en"] as const) {
    const t = I18N[lang];
    assert.notEqual(t.deltaRepeat, t.deltaNone, `${lang}: подписи повтора и нуля совпали`);
    assert.ok(t.deltaRepeat.trim().length > 5, `${lang}: подпись повтора слишком короткая`);
  }
});
