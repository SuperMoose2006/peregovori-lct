// СГЕНЕРИРОВАНО tools/sync_campaigns.py — РУКАМИ НЕ ПРАВИТЬ.
// Источник: services/gateway/app/engine/campaigns.py
//
// Офлайн-ядро обязано играть ту же игру, что сервер (инвариант 8), а «то же»
// начинается с одинакового текста актов. Расхождение валит tests/test_campaign_sync.py.
import type { Lang } from "../types";

type L = Record<Lang, string>;

export interface StageDef {
  scenario_id: string;
  act: L;
  intro: L;
}

export interface CampaignDef {
  id: string;
  icon: string;
  title: L;
  tagline: L;
  stages: StageDef[];
  /** Эпилог по итогу всей кампании: ключ репутации → текст. Оценку не трогает. */
  epilogue: Record<string, L>;
}

/**
 * Пороги полос эпилога. ЕДЕТ ИЗ PYTHON, а не переписан руками: пороги должны
 * совпадать и с `views.reputation_intro`, иначе оппонент в четвёртом акте
 * здоровается «наслышан, вы жёстки», а финал хвалит за отношения.
 */
export const EPILOGUE_BANDS: [number, string][] = [[45.0, "triumph"], [15.0, "solid"], [-15.0, "mixed"], [-45.0, "strained"]];

/**
 * Чем оппонент здоровается, узнав репутацию из прошлых актов.
 *
 * Едет из Python вместе с порогами: приветствие в четвёртом акте и финал
 * обязаны описывать одного человека. Офлайн-ядро без этой таблицы применяло
 * сдвиг доверия молча — механика работала и была не видна.
 */
export const REPUTATION_LINES: Record<string, Record<Lang, string>> = {
  "triumph": {
    "ru": "Наслышан — говорят, с вами приятно и по делу вести дела.",
    "en": "I've heard good things — they say you're straight and fair to deal with."
  },
  "solid": {
    "ru": "Слышал, вы уверенно ведёте переговоры.",
    "en": "I hear you drive a confident bargain."
  },
  "mixed": {
    "ru": "",
    "en": ""
  },
  "strained": {
    "ru": "Говорят, с вами бывает непросто договориться.",
    "en": "They say you can be a tough one to settle with."
  },
  "burnt": {
    "ru": "Наслышан о вашей манере — давайте на этот раз без давления.",
    "en": "I've heard about your style — let's keep the pressure down this time."
  }
};

export const CAMPAIGN_DEFS: CampaignDef[] = [
  {
    "id": "career",
    "icon": "🧗",
    "title": {
      "ru": "Восхождение",
      "en": "The Climb"
    },
    "tagline": {
      "ru": "Пройдите путь от junior до фаундера — четыре переговорки, и репутация тянется за вами.",
      "en": "From junior to founder — four negotiations, and your reputation follows you."
    },
    "stages": [
      {
        "scenario_id": "salary",
        "act": {
          "ru": "Акт I · Первый оффер",
          "en": "Act I · First Offer"
        },
        "intro": {
          "ru": "Вы только вышли на рынок. На столе — оффер. То, как вы проведёте этот разговор, задаст тон всей карьере.",
          "en": "You are new to the market. An offer is on the table. How you handle this sets the tone for your whole career."
        }
      },
      {
        "scenario_id": "conflict",
        "act": {
          "ru": "Акт II · Тимлид",
          "en": "Act II · Team Lead"
        },
        "intro": {
          "ru": "Пару лет спустя вы ведёте команду. Смежный отдел сорвал сроки и валит вину на вас. Репутация уже работает — на вас или против.",
          "en": "A couple of years on, you lead a team. A partner team missed a deadline and blames you. Your reputation now works for — or against — you."
        }
      },
      {
        "scenario_id": "supplier",
        "act": {
          "ru": "Акт III · Закупки",
          "en": "Act III · Procurement"
        },
        "intro": {
          "ru": "Вы отвечаете за закупки. Нужно сбить цену у надёжного поставщика, не сжигая отношения.",
          "en": "You now own procurement. Drive a reliable supplier's price down without burning the relationship."
        }
      },
      {
        "scenario_id": "investor",
        "act": {
          "ru": "Акт IV · Фаундер",
          "en": "Act IV · Founder"
        },
        "intro": {
          "ru": "Финал пути: вы — фаундер за столом с инвестором. Всё, чему вы научились, решится здесь.",
          "en": "The finale: you are a founder across from an investor. Everything you've learned comes to a head."
        }
      }
    ],
    "epilogue": {
      "triumph": {
        "ru": "Инвестор подписал. Через год вашу сделку разбирают на курсе как пример — не потому, что вы выбили лучшие условия, а потому, что все четверо, с кем вы говорили, готовы сесть за стол снова.",
        "en": "The investor signed. A year later your deal is taught as a case — not because you squeezed the best terms, but because all four people you talked to would sit down with you again."
      },
      "solid": {
        "ru": "Путь пройден. Условия — крепкие, отношения — целы, и это ровно то, что переносится на следующий стол. Репутация переговорщика собирается из четырёх обычных разговоров, а не из одного блестящего.",
        "en": "The climb is done. Terms are solid, relationships intact — and that is exactly what carries to the next table. A negotiator's name is built from four ordinary conversations, not one brilliant."
      },
      "mixed": {
        "ru": "Вы дошли. Где-то отдали лишнее, где-то передавили — и оба следа видны в том, как с вами разговаривали дальше. Это не провал: это карта того, что стоит переиграть.",
        "en": "You made it. Somewhere you gave away too much, somewhere you pushed too hard — and both showed up in how people spoke to you afterwards. Not a failure: a map of what is worth replaying."
      },
      "strained": {
        "ru": "Сделки состоялись, но за вами тянется шлейф. Инвестор согласился с оговорками, и по тому, как он это сказал, слышно всё, что было в предыдущих трёх актах.",
        "en": "The deals closed, but something trails behind you. The investor agreed with caveats — and the way he said it carried everything from the previous three acts."
      },
      "burnt": {
        "ru": "Четыре стола — четыре сожжённых моста. Условия, которые вы выбивали, оказались дешевле того, что вы за них заплатили: на четвёртом акте с вами уже разговаривали не как с партнёром, а как с риском.",
        "en": "Four tables, four burnt bridges. The terms you forced cost more than they were worth: by the fourth act people were talking to you not as a partner but as a risk."
      }
    }
  },
  {
    "id": "own_shop",
    "icon": "🛠",
    "title": {
      "ru": "Своё дело",
      "en": "On Your Own"
    },
    "tagline": {
      "ru": "Первый клиент, машина, студия и контракт, который держит всё. Четыре стола, где за вас никто не заступится.",
      "en": "First client, a car, a studio, and the contract that holds it together. Four tables with nobody backing you up."
    },
    "stages": [
      {
        "scenario_id": "freelance_rate",
        "act": {
          "ru": "Акт I · Первый клиент",
          "en": "Act I · First Client"
        },
        "intro": {
          "ru": "Вы ушли на себя. Первый клиент торгуется, и согласиться очень хочется: он один. Но ставка, которую вы назовёте сейчас, станет вашей ставкой для всех следующих — они спросят, за сколько вы работали.",
          "en": "You went solo. The first client haggles, and saying yes is tempting: he is the only one. But the rate you name now becomes your rate for everyone after — they will ask what you charged."
        }
      },
      {
        "scenario_id": "used_car",
        "act": {
          "ru": "Акт II · Рабочая машина",
          "en": "Act II · A Car for the Job"
        },
        "intro": {
          "ru": "Заказы пошли, нужна машина. Продавец знает про неё всё, вы — почти ничего, и это первый стол, где вы слабее по информации. Спрашивать не стыдно; стыдно платить за то, чего не спросил.",
          "en": "Work is coming in and you need a car. The seller knows everything about it, you know almost nothing — your first table where information is against you. Asking is not embarrassing; paying for what you didn't ask is."
        }
      },
      {
        "scenario_id": "rent",
        "act": {
          "ru": "Акт III · Своя студия",
          "en": "Act III · Your Own Studio"
        },
        "intro": {
          "ru": "Пора съезжать из кухни. Арендодателю важны не только деньги — и если вы выясните, что именно, платить придётся меньше. Репутация с прошлых актов уже здесь: в этом городе спрашивают друг у друга.",
          "en": "Time to move out of the kitchen. Money is not all the landlord cares about — and if you find out what else, you will pay less. Your reputation is already in the room: in this town people ask around."
        }
      },
      {
        "scenario_id": "sla_renewal",
        "act": {
          "ru": "Акт IV · Контракт, который держит всё",
          "en": "Act IV · The Contract That Holds"
        },
        "intro": {
          "ru": "Крупный клиент продлевает договор и требует условий жёстче прежних. Уйти нельзя: на нём держится половина выручки. Финал — про то, как торговаться, когда альтернативы почти нет, и не отдать всё.",
          "en": "Your biggest client is renewing and wants harder terms. Walking away is not an option: half your revenue rests on him. The finale is about bargaining with almost no alternative — and not giving away everything."
        }
      }
    ],
    "epilogue": {
      "triumph": {
        "ru": "Через три года у вас очередь из клиентов, и почти все пришли по чьей-то рекомендации. Оказалось, что самый прибыльный приём — тот, после которого с вами хотят работать снова.",
        "en": "Three years on you have a waiting list, and nearly everyone came by referral. The most profitable technique turned out to be the one that makes people want to work with you again."
      },
      "solid": {
        "ru": "Дело стоит. Не империя, но своё: ставка честная, машина ездит, студия ваша, контракт продлён. Каждый из четырёх столов вы могли пройти хуже — и знаете, где.",
        "en": "The business stands. Not an empire, but yours: a fair rate, a working car, your studio, the contract renewed. Each of the four tables could have gone worse — and you know exactly where."
      },
      "mixed": {
        "ru": "Вы выжили, и это не мало. Но ставка первого клиента ещё аукается, а последний договор вы подписали на условиях, которые перечитывать неприятно.",
        "en": "You survived, and that is not nothing. But the first client's rate still echoes, and you signed the last contract on terms you would rather not reread."
      },
      "strained": {
        "ru": "Дело идёт, но узко. В городе, где спрашивают друг у друга, о вас отвечают коротко — «работает, но тяжело». На четвёртом столе это стоило вам процентов.",
        "en": "The business runs, but narrowly. In a town where people ask around, the answer about you is short — \"gets it done, but it's hard work\". At the fourth table that cost you percentage points."
      },
      "burnt": {
        "ru": "Клиенты кончились раньше денег. Каждый стол вы выигрывали и каждый раз теряли того, с кем можно было бы сыграть ещё десять партий. В своём деле это и есть главный убыток.",
        "en": "The clients ran out before the money did. You won every table and each time lost someone worth ten more games. In your own business, that is the real loss."
      }
    }
  }
];
