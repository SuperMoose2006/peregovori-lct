// LazyScreen.tsx — экран, который приезжает отдельным файлом.
//
// ЗАЧЕМ. Стол, разбор и курс — это две трети собранного кода, и до первого
// клика ни один из них не нужен. Они грузятся по требованию, а домашний экран
// за них больше не платит.
//
// ЧЕМ ЭТО НЕ ЯВЛЯЕТСЯ. Кусок, который не доехал, — это НЕ «работаем офлайн»
// (инвариант 5), а страница, загруженная наполовину. Поэтому здесь три вещи, и
// каждая обязательна:
//
//   1. Ожидание имеет КОНЕЦ. Зависшая загрузка (мобильная сеть, отвалившийся
//      раздатчик статики) не даёт ни ошибки, ни ответа — обещание «сейчас
//      откроется» висело бы вечно. Через CHUNK_TIMEOUT_MS оно превращается в
//      честный отказ.
//   2. Отказ ГОВОРИТ, что случилось, и даёт две двери: обновить страницу и уйти
//      домой. Домашний экран уже в памяти — он открывается всегда.
//   3. Кнопка делает ровно то, что написано. Здесь стояло «Повторить», и оно
//      НЕ РАБОТАЛО: браузер помнит провалившийся модуль в module map до конца
//      жизни страницы и на второй `import()` того же адреса возвращает ту же
//      ошибку, не сходив в сеть (проверено прибором: запрос гасился, кнопка
//      жалась, экран не открывался). Обойти это нечем — адрес куска
//      фиксирован сборкой. Значит, честная кнопка одна: перезагрузка. Она
//      сбрасывает module map целиком, а профиль, прогресс и курс переживают её
//      в localStorage.
//
// Продукт остаётся играбельным без сети не благодаря этому файлу, а благодаря
// прогреву на простое (App.tsx: warmScreens) — куски доезжают в кеш service
// worker'а сразу после первой отрисовки, задолго до того, как понадобятся.
import {
  Component, Suspense, lazy, useMemo,
  type ComponentType, type ReactNode,
} from "react";
import type { Lang } from "../types";
import { Karl } from "./Mascot";
// Только имя маскота и подписи к его картинкам. Строки самого экрана живут
// ниже — они нужны ровно здесь; а вот имя персонажа, записанное во втором
// месте, стало бы вторым источником правды о нём же. Вес нулевой: и словарь, и
// компонент маскота на критическом пути уже есть.
import { I18N } from "../i18n";

/** Сколько ждём файл, прежде чем назвать это отказом. Заметно больше любой
 *  живой загрузки и заметно меньше человеческого терпения. */
const CHUNK_TIMEOUT_MS = 12000;

// Строки живут здесь, а не в общем словаре: они нужны ровно на том экране,
// который не загрузился, и тащить ради них i18n в этот модуль незачем. Форма
// та же — {ru, en} (инвариант 4).
const TEXT = {
  ru: {
    loading: "Открываем экран…",
    failTitle: "Экран не догрузился",
    failBody: "Файл этого экрана не приехал — связь пропала или сервер не отдал его. Всё, что уже открыто, работает: можно вернуться на главную или обновить страницу целиком.",
    retry: "Обновить страницу",
    home: "На главную",
  },
  en: {
    loading: "Opening the screen…",
    failTitle: "This screen did not load",
    failBody: "Its file never arrived — the connection dropped, or the server did not serve it. Everything already open still works: go back home, or reload the whole page.",
    retry: "Reload the page",
    home: "Home",
  },
} as const;

/** Отказ по времени. Висящий запрос — не «ещё грузится», а тот же отказ, только
 *  молчаливый: без этого Suspense показывал бы точки до конца сеанса. */
function withTimeout<T>(load: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("chunk load timed out")), CHUNK_TIMEOUT_MS);
    load().then(
      (mod) => { clearTimeout(timer); resolve(mod); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function ScreenLoading({ lang }: { lang: Lang }) {
  const m = I18N[lang].mascot;
  return (
    <section className="screen">
      <div className="wrap">
        <div className="gen">
          {/* Ждать вместе с кем-то живым легче, чем с тремя точками. Поза та
              же, что у ожидания генерации на главной: `think` в этом продукте
              значит «идёт работа, которой не видно», и значить что-то другое
              на соседнем экране она не должна. */}
          <div className="karl-mid">
            <Karl state="think" name={m.karl} alt={m.alt} />
          </div>
          <div className="gen-dots" aria-hidden="true"><i /><i /><i /></div>
          <p className="gen-sub" role="status">{TEXT[lang].loading}</p>
        </div>
      </div>
    </section>
  );
}

interface BoundaryProps {
  lang: Lang;
  onHome?: () => void;
  /** Надстройка, а не экран: её отсутствие уже что-то честно значит. */
  silent?: boolean;
  children: ReactNode;
}

/** Граница ошибки. Не сбрасывается: пока страница жива, повторная загрузка
 *  того же куска вернёт ту же ошибку из module map браузера (см. шапку). */
class ScreenBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.silent) return null;
    const t = TEXT[this.props.lang];
    const m = I18N[this.props.lang].mascot;
    return (
      <section className="screen">
        <div className="wrap">
          <div className="conn-lost" role="alert">
            {/* Карл без реплики — ровно как на потерянной связи (App.tsx):
                текст ниже это сообщение продукта, и подписывать его именем
                тренера значило бы выдать его слова за его же наблюдение. */}
            <div className="karl-note">
              <Karl state="concern" compact name={m.karl} alt={m.alt} />
              <div className="conn-lost-body">
                <b>{t.failTitle}</b>
                <span>{t.failBody}</span>
              </div>
            </div>
            <div className="conn-lost-actions">
              <button className="primary" onClick={() => location.reload()}>{t.retry}</button>
              {this.props.onHome ? (
                <button className="ghost" onClick={this.props.onHome}>{t.home}</button>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  }
}

interface Props<P> {
  lang: Lang;
  /** Динамический импорт экрана. Один и тот же путь на все вызовы — иначе это
   *  будут разные куски сборки. */
  load: () => Promise<{ default: ComponentType<P> }>;
  /** Отрисовка: сюда приходит уже загруженный компонент со своими пропсами. */
  render: (Screen: ComponentType<P>) => ReactNode;
  onHome?: () => void;
  /**
   * НАДСТРОЙКА, А НЕ ЭКРАН. Панель «вы тогда · вы сейчас» появляется не всегда:
   * «переигрывать нечем» — её штатное состояние, и продукт говорит это её
   * отсутствием. Поэтому пока она едет и если она не доехала, здесь пусто, а
   * не «панель не догрузилась» поверх идущей партии: последнее сообщало бы о
   * поломке там, где человек ничего и не ждал. Экран так помечать нельзя —
   * там пустота значит «страница сломалась молча».
   */
  silent?: boolean;
}

export function LazyScreen<P extends object>({ lang, load, render, onHome, silent }: Props<P>) {
  // Приведение — из-за `ref` в типе `LazyExoticComponent`, а не из-за пропсов:
  // `P` приходит из самого `load`, поэтому вызывающая сторона типизирована
  // ровно так же строго, как если бы экран стоял здесь напрямую.
  //
  // Пустые зависимости намеренно: `load` пересоздаётся на каждом рендере
  // родителя, и попади он сюда, экран пересобирался бы — и терял состояние —
  // при каждом обновлении, то есть на каждом ходу партии.
  const Screen = useMemo(
    () => lazy(() => withTimeout(load)) as unknown as ComponentType<P>,
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <ScreenBoundary lang={lang} onHome={onHome} silent={silent}>
      <Suspense fallback={silent ? null : <ScreenLoading lang={lang} />}>{render(Screen)}</Suspense>
    </ScreenBoundary>
  );
}
