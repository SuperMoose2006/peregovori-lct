// Rail.tsx — правый рейл виджетов в оболочке приложения.
//
// It exists because the shell is three-part, not two: sidebar · content · rail.
// Without it the content column is the whole width and the layout stops reading
// as an app — which is exactly the gap between what was designed on the canvas
// and what the code shipped first.
import type { Strings } from "../i18n";
import { dailyTable } from "../lib/daily";
import { SCENARIO_MAP } from "../data/scenarios";
import type { Lang } from "../types";
import type { Profile } from "../lib/progress";
import { dailyGoalView, rankForXp, getRecord, streakView, DAILY_GOAL_MAX } from "../lib/progress";
import { plural } from "../lib/format";
import { MascotImg } from "./Mascot";
import { DataIcon } from "./Icon";

export function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rc">
      {/* h2, а не h3: на странице есть h1, и прыжок через уровень ломает
          навигацию по разделам у экранного диктора. */}
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/**
 * Группа карточек с подписью «что это за группа».
 *
 * ПОЧЕМУ ГРУППЫ. Рейл был стопкой из восьми карточек подряд — стол дня, память,
 * цель, серия, ранг, курс, чтение, обратная сторона, метод — и новичку порядок
 * казался случайным: половина из них про прогресс, половина — отдельные
 * форматы игры. Форматы уехали в основную колонку (App.tsx), а здесь осталось
 * то, что одинаково относится к любому разделу, — под одной подписью.
 *
 * Подпись — не заголовок: у карточек уже есть h2, и лишний уровень в дереве
 * заголовков диктору не помог бы.
 */
export function RailGroup({ head, note, className, children }:
  { head: string; note: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rail-group${className ? ` ${className}` : ""}`}>
      <div className="rail-head">
        <b>{head}</b>
        <span>{note}</span>
      </div>
      {children}
    </div>
  );
}

/** Daily goal + rank: the two widgets every screen of the shell carries.
 *
 * ВЫБОР ЦЕЛИ ЖИВЁТ ЗДЕСЬ. Раньше цифры 1/2/3 были кликабельны только в
 * маркетинговой шапке скина «додзё». Скин удалён — и вместе с ним исчезла бы
 * сама возможность поменять цель дня, хотя к оформлению она отношения не имеет.
 * Поэтому пипсы переехали в рейл и стали кнопками: показ и выбор в одном месте.
 */
export function ProgressCards({ t, lang, profile, onSetGoal }:
  { t: Strings; lang: Lang; profile: Profile; onSetGoal?: (target: number) => void }) {
  const goal = dailyGoalView(profile);
  const r = rankForXp(profile.xp);
  return (
    <>
      <RailCard title={t.goal.title}>
        {/* «0/1» без единого слова не отвечало, цель ЧЕГО это — тренировки,
            курса, кампании. Подпись под числом говорит, что считается. */}
        <p className="rc-hint">{t.goal.hint}</p>
        <div className="rc-goal">
          <b>{t.goal.count.replace("{done}", String(goal.done)).replace("{target}", String(goal.target))}</b>
          <span className="rc-steps" role={onSetGoal ? "group" : undefined}
                aria-label={onSetGoal ? t.gam.dailyTargetLabel : undefined}
                aria-hidden={onSetGoal ? undefined : true}>
            {Array.from({ length: DAILY_GOAL_MAX }, (_, i) => {
              const n = i + 1;
              const cls = `${i < goal.done ? "on" : ""}${goal.target === n ? " tgt" : ""}`.trim();
              return onSetGoal ? (
                <button key={n} className={cls} aria-pressed={goal.target === n}
                        title={t.gam.dailyTargetSet.replace("{n}", String(n))}
                        onClick={() => onSetGoal(n)}>{n}</button>
              ) : (
                <i key={n} className={cls}>{n}</i>
              );
            })}
          </span>
        </div>
        <div className="rc-bar"><i style={{ width: `${Math.round(goal.progress * 100)}%` }} /></div>
      </RailCard>

      <RailCard title={t.rank.title}>
        <div className="rc-rank">
          <b>{r.rank.name[lang]}</b>
          <span>{profile.xp} XP</span>
        </div>
        <div className="rc-bar"><i style={{ width: `${Math.round(r.progress * 100)}%` }} /></div>
        {r.next ? (
          <p className="rc-next">
            {t.rank.toNext.replace("{n}", String(r.toNext)).replace("{rank}", r.next.name[lang])}
          </p>
        ) : null}
        {/* Как ранг считается и на что НЕ влияет — тем же правилом, что
            `xpForDebrief`: балл партии, бонус за сделку и за рекорд. */}
        <p className="rc-hint rc-hint-after">{t.rank.hint}</p>
      </RailCard>
    </>
  );
}

/**
 * «Стол дня» — один и тот же у всех, каждый день другой.
 *
 * Причина вернуться завтра из тех, что не требуют нового содержания: восемь
 * столов открыты сразу, курс проходится за вечер, и без этой карточки
 * возвращаться не за чем. Условие дня названо словами прямо здесь — «короткий
 * стол», «холодный старт», — потому что человек должен знать, во что садится,
 * до того как сел.
 *
 * Стол считается ОФЛАЙН, тем же расписанием, что на сервере
 * (`lib/daily.ts` ↔ `app/engine/daily.py`): карточка обязана работать без сети,
 * как и всё остальное.
 *
 * ЧТО ЗДЕСЬ БЫЛО НЕПОНЯТНО. Заголовок «Стол дня» и строка условия («Обычный
 * стол, двенадцать ходов») не говорили главного — что это одна ситуация на
 * всех и завтра будет другая. Первая строка теперь говорит именно это. Слова
 * самих условий не трогаются: они зеркало `daily.py`, а движок — не наша зона.
 *
 * Сюда же переехала память об этом столе («Тихон помнит» отдельной карточкой):
 * слон с чужим именем посреди рейла вызывал вопрос «кто это?», а сама строка —
 * «ваш лучший результат здесь» — нужна ровно там, где решают, садиться ли.
 * Строки нет, пока нет рекорда: вспоминать нечего.
 */
export function DailyCard({ t, lang, profile, onPlay }:
  { t: Strings; lang: Lang; profile?: Profile; onPlay: (scenarioId: string) => void }) {
  const table = dailyTable();
  const sc = SCENARIO_MAP[table.scenarioId];
  if (!sc) return null;
  const record = profile ? getRecord(profile, table.scenarioId) : null;
  return (
    <RailCard title={t.daily.title}>
      <p className="rc-note">{t.daily.lead}</p>
      {/* Плитка — описание, а не кнопка: рядом с двумя соседями по разделу
          «Другие форматы» у каждой карточки одна кнопка внизу, и у этой тоже. */}
      <div className="rc-daily rc-daily--static">
        <span className="rc-daily-ic" aria-hidden="true"><DataIcon name={sc.icon} /></span>
        <span className="rc-daily-txt">
          <b>{sc.title[lang]}</b>
          <span className="rc-daily-mod">{table.modifier.label[lang]}</span>
        </span>
      </div>
      <p className="rc-next">{table.modifier.note[lang]}</p>
      {record?.bestGrade ? (
        <div className="rc-memory">
          <MascotImg dir="tikhon" state="remember" alt="" size={44} />
          <p className="rc-note">
            {t.daily.best.replace("{grade}", record.bestGrade).replace("{score}", String(record.bestScore))}
          </p>
        </div>
      ) : null}
      <button className="btn primary rc-go" data-daily="play" onClick={() => onPlay(table.scenarioId)}>
        {t.route.dailyCta}
      </button>
    </RailCard>
  );
}

/**
 * «Серия» — что она скажет о СЕГОДНЯШНЕМ дне.
 *
 * Чип серии в шапке показывает число дней и молчит о единственном, что от
 * игрока сейчас зависит: засчитан ли сегодняшний день. Разница между «серия
 * жива, но вы ещё не играли» и «день уже записан» — это ровно то, ради чего
 * серию смотрят, и до сих пор её нельзя было увидеть нигде.
 *
 * ЧТО ЗДЕСЬ НЕ РЕШАЕТСЯ. Ни одного условия карточка не считает сама: состояние
 * даёт `streakView`, а он — тот же `updateStreak`, которым серия записывается
 * после партии. Обещание «партия продлит серию» поэтому не предсказание, а та
 * же чистая функция; разойтись с тем, что произойдёт, оно не может.
 *
 * КТО ГОВОРИТ. По ролям (см. Mascot.tsx): о том, чего ещё нет — «сегодня вы не
 * играли» — говорит Карл, и дремлет, пока за стол не сядут. О том, что уже
 * записано — день засчитан, серия прервана, вас не было неделю — говорит Тихон.
 * Серии не было ни разу → карточки нет: слон над пустой записью это украшение.
 */
export function StreakCard({ t, profile }: { t: Strings; profile: Profile }) {
  const v = streakView(profile);
  if (!v) return null;
  const line =
    v.mood === "kept" ? t.streak.kept
    : v.mood === "waiting" ? t.streak.waiting
    : v.mood === "shielded" ? t.streak.shielded
    : v.mood === "away" ? t.streak.away
    : t.streak.lost;
  const n = v.mood === "shielded" ? v.freezes : v.mood === "away" ? v.awayDays : v.streak;
  const text = line.replace("{n}", String(n)).replace("{form}", plural(n, t.forms.days));

  const face = v.mood === "waiting"
    ? { dir: "karl" as const, state: "doze" }
    : v.mood === "kept" ? { dir: "tikhon" as const, state: "cheer" }
    : v.mood === "shielded" ? { dir: "tikhon" as const, state: "idle" }
    : v.mood === "away" ? { dir: "tikhon" as const, state: "doze" }
    : { dir: "tikhon" as const, state: "concern" };

  return (
    <RailCard title={t.streak.title}>
      <p className="rc-hint">{t.streak.hint}</p>
      <div className="rc-streak">
        {/* Декоративная: строка рядом называет и число дней, и что с ним
            делать. Числового чипа тут нет намеренно — «5» рядом со словами
            «серия прервана» противоречит сам себе: в профиле пятёрка стоит до
            следующей партии, а серии уже нет. */}
        <MascotImg dir={face.dir} state={face.state} alt="" size={44} />
        <p className="rc-note">{text}</p>
      </div>
    </RailCard>
  );
}

/**
 * Четыре приёма метода — с примером под каждым и ссылкой в курс.
 *
 * БЫЛО: заголовок «Метод» и четыре строки вроде «BATNA как рычаг». Новичок не
 * понимал ни что за метод, ни что перечислено, а понявший не получал ничего,
 * чем можно воспользоваться. Теперь у каждого приёма — мысль и пример из
 * партии, раскрываются по нажатию (иначе карточка заняла бы полэкрана), и
 * кнопка ведёт в курс, где приём разобран заданиями.
 *
 * Тексты те же, что на экране курса (`t.teach.panels`, WhyTeaches.tsx): второй
 * пересказ того же метода разошёлся бы с первым при первой же правке.
 */
export function MethodCard({ t, onCourse }: { t: Strings; onCourse?: () => void }) {
  return (
    <RailCard title={t.method.title}>
      <p className="rc-hint">{t.method.lead}</p>
      <ul className="rc-method">
        {t.teach.panels.map((p) => (
          <li key={p.name}>
            <details>
              <summary>{p.name}</summary>
              <p>{p.idea}</p>
              <p className="rc-method-ex">{p.example}</p>
            </details>
          </li>
        ))}
      </ul>
      {onCourse ? (
        <button className="btn rc-go rc-go-quiet" onClick={onCourse}>{t.method.more} →</button>
      ) : null}
    </RailCard>
  );
}
