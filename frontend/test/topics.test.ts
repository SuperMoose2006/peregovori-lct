// topics.test.ts — темы переговоров в БРАУЗЕРНОМ ядре (инвариант 8).
//
// Офлайновое вскрытие требовало попадания в hiddenInterestKeywords: чтобы секрет
// открылся, игрок был обязан назвать его СОДЕРЖАНИЕ. Тема называет ОБЛАСТЬ
// («производство»), видна игроку на столе — и вопрос по ней становится выбором,
// а не угадыванием. Серверная половина тех же утверждений лежит в
// services/gateway/tests/test_interest_topics.py; расходиться им нельзя.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS } from "../src/data/scenarios";
import { analyze, applyMove, hintLine, newSession, stateView, topicStems } from "../src/mock/engine";
import type { Lang } from "../src/types";

const LANGS: Lang[] = ["ru", "en"];
const byId = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const probe = (lang: Lang, topic: string) =>
  lang === "ru" ? `Что для вас важно в ${topic}?` : `What matters to you in ${topic}?`;

// Играем один ход и смотрим, что вскрылось. Доверие на старте (40) выше ворот
// вскрытия, поэтому первый же вопрос по теме обязан сработать.
function askOnce(scId: string, lang: Lang, text: string) {
  const s = newSession(byId(scId), lang);
  s.turn += 1;
  const r = applyMove(s, analyze(text), text);
  return { s, r };
}

test("основы темы: короткие слова отбрасываются, хвост срезается ради морфологии", () => {
  // Зеркало engine.py::_topic_stems — те же три случая.
  assert.deepEqual(topicStems("Оплата"), ["опла"]);
  assert.deepEqual(topicStems("Срок контракта"), ["срок", "контрак"]);
  assert.deepEqual(topicStems("Тишина и порядок"), ["тиши", "поряд"]);
});

test("каждая тема вскрывает СВОЙ интерес — на всех столах и обоих языках", () => {
  for (const sc of SCENARIOS) {
    for (const lang of LANGS) {
      sc.interestTopics[lang].forEach((topic, i) => {
        const { s } = askOnce(sc.id, lang, probe(lang, topic));
        assert.deepEqual(s.interests, [i], `${sc.id}/${lang}: «${topic}»`);
      });
    }
  }
});

test("общий вопрос без темы по-прежнему не вскрывает ничего", () => {
  const generic: Record<Lang, string[]> = {
    ru: [
      "Что для вас важнее всего в этой сделке — и почему именно это?",
      "Почему для вас это важно?",
      "Что вас больше всего беспокоит в этой сделке?",
    ],
    en: [
      "What matters most to you in this deal — and why exactly that?",
      "Why is that important to you?",
      "What are you really after here?",
    ],
  };
  for (const sc of SCENARIOS) {
    for (const lang of LANGS) {
      for (const q of generic[lang]) {
        const { s, r } = askOnce(sc.id, lang, q);
        assert.deepEqual(s.interests, [], `${sc.id}/${lang}: «${q}»`);
        // opened_up подставляет в реплику текст интереса — выдача секрета за
        // спиной у счётчика. Общий вопрос его получить не может.
        assert.notEqual(r.reaction, "opened_up", `${sc.id}/${lang}: «${q}»`);
      }
    }
  }
});

test("состояние несёт темы всегда, а текст интереса — только после вскрытия", () => {
  for (const lang of LANGS) {
    const sc = byId("supplier");
    const s = newSession(sc, lang);
    let slots = stateView(s).interests!;
    assert.deepEqual(slots.map((x) => x.topic), sc.interestTopics[lang]);
    assert.ok(slots.every((x) => x.text === null), "текст секрета уехал до вскрытия");

    const line = probe(lang, sc.interestTopics[lang][1]);
    s.turn += 1;
    applyMove(s, analyze(line), line);
    slots = stateView(s).interests!;
    assert.equal(slots[1].text, sc.interests[lang][1]);
    assert.equal(slots[0].text, null);
    assert.equal(slots[2].text, null);
  }
});

test("реплика, которую предлагает офлайновый тренер, вскрывает интерес", () => {
  // Тренер цитировал «Что для вас важнее всего в этой сделке?» — вопрос без
  // темы, на который движок отвечает probe_vague. Тренер называл приём и не
  // давал его.
  for (const sc of SCENARIOS) {
    for (const lang of LANGS) {
      const s = newSession(sc, lang);
      const line = hintLine(s);
      assert.ok(analyze(line).moves.includes("interests_probe"), `${sc.id}/${lang}: «${line}»`);
      const { s: after } = askOnce(sc.id, lang, line);
      assert.equal(after.interests.length, 1, `${sc.id}/${lang}: «${line}»`);
    }
  }
});

test("каждое КЛЮЧЕВОЕ СЛОВО ведёт к своему интересу — и переживает нормализацию", () => {
  // Зеркало test_interest_topics.py::test_every_keyword_uncovers_its_own_interest.
  // Проверки тем выше мало: вскрытие останавливается на ПЕРВОМ совпадении, и
  // ярлык темы, стоящий выше по списку, способен молча съесть слово соседнего
  // интереса. На `rent`/en так и было: «Finding tenants» давало основу «tenan» и
  // забирало «quiet tenant», «tidy tenant», «reliable tenant», «decent tenant» —
  // спросив про тихого жильца, игрок получал секрет про простой.
  for (const sc of SCENARIOS) {
    for (const lang of LANGS) {
      (sc.hiddenInterestKeywords?.[lang] ?? []).forEach((words, i) => {
        for (const word of words) {
          // Слово ищется подстрокой в УЖЕ нормализованной реплике, а само не
          // нормализуется ничем: апостроф в словаре делает запись мёртвой молча.
          assert.equal(word, word.toLowerCase().replace(/ё/g, "е"), `${sc.id}/${lang}: «${word}»`);
          assert.ok(!/['"`]/.test(word), `${sc.id}/${lang}: «${word}» — апостроф не переживёт norm()`);
          const { s } = askOnce(sc.id, lang, probe(lang, word));
          assert.deepEqual(s.interests, [i], `${sc.id}/${lang}: слово «${word}»`);
        }
      });
    }
  }
});
