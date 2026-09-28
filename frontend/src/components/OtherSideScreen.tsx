// OtherSideScreen.tsx — выбор стола для режима «Обратная сторона стола».
//
// ЧТО ЗДЕСЬ ПОКАЗЫВАЕТСЯ ДО ПАРТИИ, И ПОЧЕМУ ИМЕННО ЭТО. Замысел режима — дать
// человеку ПОБЫТЬ второй стороной: получить свою красную линию, свои скрытые
// интересы и своё давление. Значит карточка обязана открыть игроку его
// собственную карту ДО первого хода — это не секрет оппонента, а его
// собственные причины: он и есть та сторона.
//
// Три причины берутся не отсюда, а из ОРИГИНАЛЬНОГО стола (`defendedInterests`
// → `SCENARIO_MAP[mirrorOf].interests`): за зеркалом игрок садится в кресло
// персоны того стола, и защищает он ровно её интересы — те самые, что в обычной
// партии от него прячут. Свой текст рядом разъехался бы с оригиналом при первой
// же правке, и экран обещал бы секреты, которых за тем столом нет.
//
// СЕТИ ЗДЕСЬ НЕ БЫВАЕТ: всё, что на экране, — это записи столов в браузере.
import type { Lang } from "../types";
import type { Strings } from "../i18n";
import { MIRRORS } from "../data/mirrors";
import { SCENARIO_MAP, defendedInterests } from "../data/scenarios";
import { ScreenHeading } from "./ScreenHeading";
import { Icon, DataIcon } from "./Icon";

interface Props {
  t: Strings;
  lang: Lang;
  onClose: () => void;
  onPlay: (scenarioId: string) => void;
}

export function OtherSideScreen({ t, lang, onClose, onPlay }: Props) {
  return (
    <div className="wrap rd-wrap">
      <div className="rd-head">
        <span className="rd-ic" aria-hidden="true"><Icon name="mirror" /></span>
        <div className="rd-id">
          <ScreenHeading as="h1" className="rd-title">{t.otherSide.title}</ScreenHeading>
          <p className="rd-sub">{t.otherSide.sheetLead}</p>
        </div>
        <span className="rd-badge">{t.otherSide.scored}</span>
        <button className="btn ghost rd-x" onClick={onClose} aria-label={t.otherSide.close}>✕</button>
      </div>

      {MIRRORS.map((def) => {
        // Оригинал обязан существовать: `mirrorOf` сверяется с движком тестом
        // `test_scenario_mirror.py`. Но экран не имеет права падать на битой
        // ссылке — стол без оригинала просто не показывается.
        const origin = def.mirrorOf ? SCENARIO_MAP[def.mirrorOf] : undefined;
        if (!origin) return null;
        const defending = defendedInterests(def, lang);
        return (
          <section className="rd-card os-card" key={def.id}>
            <div className="rd-head">
              <span className="rd-ic" aria-hidden="true"><DataIcon name={def.icon} /></span>
              <div className="rd-id">
                <h2 className="rd-title">{def.title[lang]}</h2>
                <p className="rd-sub">
                  {t.otherSide.youBecome.replace("{name}", origin.cp.nm[lang])}
                </p>
              </div>
            </div>
            <p className="rd-watch">{def.role[lang]}</p>
            <p className="rd-mine">{t.otherSide.origin.replace("{title}", origin.title[lang])}</p>

            <h3 className="os-h">{t.otherSide.defendTitle}</h3>
            <p className="rd-sub">{t.otherSide.defendLead}</p>
            <ul className="os-list">
              {defending.map((d) => (
                <li key={d.topic + d.text}>
                  <b>{d.topic}</b>
                  <span>{d.text}</span>
                </li>
              ))}
            </ul>

            <p className="rd-quote">{def.brief[lang]}</p>
            <button className="btn primary rc-go" data-other-side="play"
                    onClick={() => onPlay(def.id)}>
              {t.otherSide.play}
            </button>
          </section>
        );
      })}
    </div>
  );
}
