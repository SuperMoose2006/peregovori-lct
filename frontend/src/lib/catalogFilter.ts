import type { CatalogItem } from "../data/scenarios";
import { normalizeDifficulty, type DifficultyMode } from "./difficulty";

export type CatalogTopic = "all" | "career" | "business" | "life";
export type CatalogDifficulty = "all" | DifficultyMode;

const TOPICS: Record<string, Exclude<CatalogTopic, "all">> = {
  supplier: "business", investor: "business", freelance_rate: "business", sla_renewal: "business",
  salary: "career", conflict: "career", candidate_offer: "career",
  rent: "life", used_car: "life",
};

// Everyday queries need not use the exact grammatical form of a card title.
const KEYWORDS: Record<string, string> = {
  supplier: "поставщик поставщика закупки закупка поставки цена цены стоимость supplier procurement supply price",
  salary: "зарплата зарплату зарплаты повышение оплата компенсация работа salary pay raise compensation job",
  conflict: "команда команды коллега коллеги конфликт конфликта работа сроки сложный разговор team colleague conflict deadline difficult conversation",
  investor: "инвестор инвестора инвестиции инвестиция доля стартап бизнес investor investment startup equity funding",
  rent: "аренда аренде аренду аренды квартира квартиры жилье помещение rent rental apartment housing lease",
  used_car: "машина машины машину автомобиль автомобиля авто торг покупка car vehicle purchase",
  freelance_rate: "фриланс фрилансер фрилансера ставка стоимость услуги контракт freelancer freelance rate services contract",
  sla_renewal: "сервис услуги поддержка гарантии контракт продление продлить service support renewal sla contract",
  candidate_offer: "найм кандидат кандидата сотрудник вакансия оффер работа hiring recruitment candidate employee job offer",
};

const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/ё/g, "е").trim();

export function scenarioTopic(id: string): Exclude<CatalogTopic, "all"> {
  return TOPICS[id] ?? "business";
}

/** Every search term must match; keep the authored order and original records. */
export function filterCatalog(rows: CatalogItem[], query: string, topic: CatalogTopic, difficulty: CatalogDifficulty): CatalogItem[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (topic !== "all" && scenarioTopic(row.id) !== topic) return false;
    if (difficulty !== "all" && normalizeDifficulty(row.difficulty) !== difficulty) return false;
    const text = normalize(`${row.title} ${row.role} ${KEYWORDS[row.id] ?? ""}`);
    return terms.every((term) => text.includes(term));
  });
}
